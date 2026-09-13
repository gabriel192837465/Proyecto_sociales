let ws = null;
let handlers = [];
let cola = [];
let reconectarAuto = true;
let reconectarTimer = null;
let reintentos = 0;
let sinRed = false;
let onOpenCallback = null;
let onCloseCallback = null;
// `online` llegó con el socket en CLOSING (el cierre nativo iniciado por
// `offline` aún no terminó: CLOSING→CLOSED es asíncrono). Se marca un retry
// inmediato pendiente que el onclose del socket ACTUAL ejecutará al quedar
// CLOSED — evita crear un segundo socket con la red recién restablecida.
let reintentoInmediatoPendiente = false;
let watchdogReintentoInmediato = null;

// Backoff exponencial + full jitter: el delay del intento N es aleatorio en
// [1, min(RETRY_MAX_MS, RETRY_BASE_MS * 2^(N-1))]. Retry infinito con cap.
// El piso de 1ms evita que un random()==0 programe un retry de delay 0
// (bucle apretado falla→reintenta→falla sin respirar) sin alterar la
// semántica de full jitter.
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 30000;
// Watchdog del retry inmediato (CLOSING patológico): si el socket en CLOSING
// jamás emite close (cierre nativo que nunca completa CLOSING→CLOSED), el
// marker quedaría pendiente para siempre y el cliente colgado. 10s es
// conservador: por encima del timeout típico del handshake de cierre del
// navegador (evita reemplazos espurios) pero acotado (el hang máximo tras
// `online` es de ~10s). Exportado para el test con fake timers.
export const RETRY_INMEDIATO_WATCHDOG_MS = 10000;

function getWsUrl() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}`;
}

// Pura y determinista si se inyecta `random` (testeable sin timers reales).
export function calcularDelayReintento(intento, random = Math.random) {
  const exp = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, intento - 1));
  // Full jitter con piso de 1ms: un delay 0 crearía un retry inmediato en
  // bucle apretado sin dejar respirar al backoff.
  return Math.max(1, Math.round(exp * random()));
}

function drenarCola() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  while (cola.length) ws.send(JSON.stringify(cola.shift()));
}

// Cierra el socket actual sólo si la conexión nativa sigue viva: OPEN o en
// handshake CONNECTING. CRÍTICO incluir CONNECTING: si un socket en handshake
// quedara "current", `online` vería CONNECTING y saltaría la reconexión →
// cliente colgado sin retry. close() sobre CONNECTING aborta el handshake:
// CLOSING síncrono, CLOSED + onclose asíncronos (spec WHATWG) → el flujo de
// marker/backoff existente lo reanuda igual. Sobre CLOSING/CLOSED es no-op.
function cerrarSocketVivo() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    ws.close();
  }
}

export function onMensaje(fn) {
  handlers.push(fn);
  return () => {
    handlers = handlers.filter(h => h !== fn);
  };
}

// REQ-UI-08 (D3): kill-switch real de la auto-reconexión. Sticky hasta que un
// `conectar()` EXPLÍCITO la re-habilite (el retry interno pasa
// reiniciarAutoReconexion:false y NO la vuelve a activar). Además cancela un
// retry ya programado: el kill-switch no sólo evita futuros, también aborta
// el pendiente.
export function setAutoReconnectEnabled(enabled) {
  reconectarAuto = !!enabled;
  if (!reconectarAuto) {
    // El kill-switch no sólo evita futuros y aborta el retry programado,
    // también descarta el retry inmediato pendiente (socket en CLOSING) y su
    // watchdog.
    descartarReintentoInmediato();
    if (reconectarTimer) {
      clearTimeout(reconectarTimer);
      reconectarTimer = null;
    }
  }
}

// Programa UN solo retry (guard anti-duplicados) con backoff + jitter.
// No programa si el kill-switch está activo o el cliente está offline.
function programaReintento() {
  if (reconectarTimer || !reconectarAuto || sinRed) return;
  reintentos++;
  reconectarTimer = setTimeout(() => {
    reconectarTimer = null;
    conectar({ onOpen: onOpenCallback, onClose: onCloseCallback, reiniciarAutoReconexion: false });
  }, calcularDelayReintento(reintentos));
}

// Cancela el retry inmediato pendiente Y su watchdog: el marker se limpia y
// el timer del CLOSING patológico queda abortado. Se invoca en cada punto
// donde el retry inmediato pierde vigencia (cierre procesado, conexión
// explícita, offline, beforeunload, kill-switch).
function descartarReintentoInmediato() {
  reintentoInmediatoPendiente = false;
  if (watchdogReintentoInmediato) {
    clearTimeout(watchdogReintentoInmediato);
    watchdogReintentoInmediato = null;
  }
}

// Arma UN solo watchdog (guard anti-duplicados) para el retry inmediato. Al
// dispararse procesa el cierre del socket colgado EXACTAMENTE una vez (guard
// per-socket) y lo reemplaza sólo si sigue siendo el socket actual con la
// auto-reconexión habilitada — el kill-switch se re-chequea también DESPUÉS
// del procesamiento por si el onCloseCallback lo desactivó adentro.
function armarWatchdogReintentoInmediato() {
  if (watchdogReintentoInmediato) return;
  watchdogReintentoInmediato = setTimeout(() => {
    watchdogReintentoInmediato = null;
    if (!reintentoInmediatoPendiente) return; // ya consumido/cancelado
    const socket = ws;
    if (!socket || socket !== ws) return; // stale: ya fue reemplazado
    if (socket.readyState !== WebSocket.CLOSING && socket.readyState !== WebSocket.CLOSED) return;
    if (!reconectarAuto) return; // kill-switch
    reintentos = 0;
    procesarCierreSocket(socket);
    if (reconectarAuto && ws === socket) {
      conectar({ onOpen: onOpenCallback, onClose: onCloseCallback, reiniciarAutoReconexion: false });
    }
  }, RETRY_INMEDIATO_WATCHDOG_MS);
}

// Efectos de cierre de UN socket, ejecutados EXACTAMENTE UNA VEZ por socket
// (guard per-socket `cierreProcesado`): onCloseCallback + consumo del marker
// de retry inmediato (CLOSING). La reanudación la decide el llamador: el
// onclose reanuda al instante si el marker estaba activo o programa el retry
// normal; el `online` con CLOSED reanuda siempre. Un segundo intento sobre el
// mismo socket — p.ej. el onclose tardío tras un `online` que observó CLOSED
// antes de que corra el evento close — es un no-op.
function procesarCierreSocket(socket) {
  if (socket.cierreProcesado) return;
  socket.cierreProcesado = true;
  descartarReintentoInmediato();
  if (onCloseCallback) onCloseCallback();
}

export function conectar(opts = {}) {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return ws;
  }
  // Una conexión nueva (explícita o retry) invalida el retry inmediato
  // pendiente: el socket que debía ejecutarlo ya no es el actual.
  descartarReintentoInmediato();
  // D3: sólo una llamada explícita del usuario re-habilita (page reload,
  // entrar()). El retry interno pasa reiniciarAutoReconexion: false.
  if (opts.reiniciarAutoReconexion !== false) {
    reconectarAuto = true;
    reintentos = 0; // conexión explícita → backoff fresco
  }
  // Una conexión explícita supera cualquier retry pendiente.
  if (reconectarTimer) { clearTimeout(reconectarTimer); reconectarTimer = null; }
  if (opts.onOpen) onOpenCallback = opts.onOpen;
  if (opts.onClose) onCloseCallback = opts.onClose;
  // Red caída (offline inicial por navigator.onLine, o `offline` reciente):
  // NO se crea un socket CONNECTING contra la red muerta — `online` lo vería
  // "sano" (CONNECTING) y jamás reconectaría, dejando al cliente colgado para
  // siempre. Callbacks explícitos y mensajes en cola se preservan; el
  // `online` creará el ÚNICO socket al volver la red.
  if (sinRed) return ws;
  ws = new WebSocket(getWsUrl());
  // Guard de identidad: cada socket captura su propia referencia y sus
  // callbacks se descartan si ya no es el `ws` actual. Un socket reemplazado
  // no debe resetear el backoff, entregar mensajes ni programar retries del
  // socket nuevo (su onclose tardío es stale).
  const socket = ws;
  socket.cierreProcesado = false; // guard per-socket: el cierre se procesa una sola vez
  socket.onopen = () => {
    if (socket !== ws) return; // stale
    reintentos = 0;
    drenarCola();
    if (onOpenCallback) onOpenCallback(socket);
  };
  socket.onmessage = (e) => {
    if (socket !== ws) return; // stale
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    handlers.forEach(fn => fn(msg));
  };
  socket.onclose = () => {
    if (socket !== ws) return; // stale: un socket viejo no procesa su cierre
    // El marker se captura ANTES del guard per-socket: si `online` ya
    // procesó este cierre (CLOSED sin evento close), nada corre dos veces.
    const retryInmediato = reintentoInmediatoPendiente;
    procesarCierreSocket(socket);
    if (retryInmediato) {
      // `online` llegó durante CLOSING: al quedar CLOSED reanudamos AL
      // INSTANTE con backoff fresco (un solo socket, sin duplicados).
      // RE-CHECK del kill-switch: onCloseCallback puede desactivar la
      // auto-reconexión dentro del procesamiento — si lo hizo (o reemplazó
      // el socket), NO se crea el reemplazo.
      if (reconectarAuto && ws === socket) {
        reintentos = 0;
        conectar({ onOpen: onOpenCallback, onClose: onCloseCallback, reiniciarAutoReconexion: false });
      }
      return;
    }
    programaReintento();
  };
  return ws;
}

// REQ-UI-10 (D3): beforeunload se registra UNA sola vez a nivel módulo, no por
// conectar() — evita acumular listeners en reconexiones. Cierra el WS en el
// unload para que el server detecte la desconexión al instante.
if (typeof window !== "undefined") {
  // REQ-OFF-01 (carga inicial): si la página carga YA sin red
  // (navigator.onLine=false), `conectar()` no debe crear un socket CONNECTING
  // que `online` vería como "sano" para siempre. Sin socket, `online` crea el
  // único socket al volver la red. Callbacks explícitos y cola se preservan.
  if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
    sinRed = !navigator.onLine;
  }

  window.addEventListener("beforeunload", () => {
    reconectarAuto = false;
    descartarReintentoInmediato(); // el cierre del socket no debe reintentar en unload
    if (reconectarTimer) { clearTimeout(reconectarTimer); reconectarTimer = null; }
    cerrarSocketVivo();
  });

  // REQ-OFF-01 (D3): los drops de red SIN close frame (setOffline de
  // Playwright, wifi flaky, suspensión) dejan el socket zombie — el onclose
  // jamás se dispara. Ante `offline` cerramos el WS Y pausamos el retry: cero
  // churn contra la red muerta (el backoff no reintenta mientras offline).
  window.addEventListener("offline", () => {
    sinRed = true;
    descartarReintentoInmediato(); // sin retry inmediato ni watchdog contra la red muerta
    if (reconectarTimer) { clearTimeout(reconectarTimer); reconectarTimer = null; }
    // Cierra OPEN y CONNECTING (ver cerrarSocketVivo): sin churn mientras
    // offline; el onclose pausado + el `online` reanudan al instante.
    cerrarSocketVivo();
  });

  // Al volver `online`, si la auto-reconexión sigue habilitada (kill-switch
  // respetado) se reintenta AL INSTANTE con backoff fresco, sin esperar el
  // próximo tick del backoff ni duplicar timers/sockets.
  window.addEventListener("online", () => {
    sinRed = false;
    if (!reconectarAuto) return;
    if (reconectarTimer) { clearTimeout(reconectarTimer); reconectarTimer = null; }
    // CLOSING: el cierre nativo iniciado por `offline` aún no terminó
    // (CLOSING→CLOSED es asíncrono). Crear aquí un segundo socket duplicaría
    // la conexión; marcamos el retry inmediato y el onclose del socket actual
    // lo ejecuta al quedar CLOSED. El watchdog acota el caso patológico en el
    // que el socket en CLOSING jamás emite close.
    if (ws && ws.readyState === WebSocket.CLOSING) {
      reintentoInmediatoPendiente = true;
      armarWatchdogReintentoInmediato();
      return;
    }
    const conectado = ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING);
    if (!conectado) {
      const socket = ws;
      if (socket && socket.readyState === WebSocket.CLOSED) {
        // CRÍTICO (race): el socket nativo ya quedó CLOSED pero su evento
        // close aún no corrió. Crear el reemplazo sin procesar el cierre
        // dejaría onCloseCallback sin invocar (el onclose tardío sería
        // stale) — en el flujo alumno, ultimoMensajeEnviado quedaría en
        // alumno_entra y el socket nuevo podría omitir el re-join.
        // Procesamos el cierre AHORA, exactamente una vez (guard per-socket);
        // el onclose tardío será un no-op por el guard de identidad.
        procesarCierreSocket(socket);
        // RE-CHECK (misma regla que el onclose del retry inmediato y el
        // watchdog): el onCloseCallback pudo desactivar la auto-reconexión
        // (kill-switch) o reemplazar el socket — en ambos casos NO se crea
        // un reemplazo ni se resetea el backoff.
        if (!reconectarAuto || ws !== socket) return;
      }
      reintentos = 0;
      conectar({ onOpen: onOpenCallback, onClose: onCloseCallback, reiniciarAutoReconexion: false });
    }
  });
}

export function enviar(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  } else {
    cola.push(msg);
  }
}

export function getWS() {
  return ws;
}
