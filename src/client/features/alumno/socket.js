import { state, setWS, setMiId, setMiNombre, setMiRespuesta, setMiPuntaje, setTiempoMax, setJugadoresSala, setPendienteEnvio, setSessionToken, setCodigoPartida } from "./state.js";
import { esc } from "../../shared/dom.js";
import { setPantalla, mostrarPregunta, mostrarResultado, mostrarFin, actualizarTimer, restaurarOpciones } from "./views.js";
import { conectar as wsConectar, onMensaje, enviar as wsEnviar, setAutoReconnectEnabled } from "../../shared/socket-client.js";
import { mostrarToast } from "./toast.js";

let registrado = false;
let ultimoMensajeEnviado = null;
let hasConnectedBefore = false;
// REQ-UI-09 (D3): escape hatch para token_rotado SIN token del servidor.
// Se resetea en bienvenido (sesión reparada). Con N=3 el loop nunca es infinito.
let tokenRotadoAttempts = 0;
const MAX_TOKEN_ROTADO_ATTEMPTS = 3;

export function conectar() {
  if (!registrado) {
    onMensaje(manejarMensaje);
    registrado = true;
  }
  const ws = wsConectar({
    onOpen(socket) {
      // REQ-OFF-01 (D3): con carga inicial offline, conectar() devolvió null
      // (sinRed) y state.ws quedó sin socket. Cuando el listener `online` del
      // módulo compartido crea el socket, el callback lo recibe como argumento:
      // bindearlo a state.ws para que el cleanup (kill-switch / cierre manual)
      // pueda alcanzarlo. En el flujo online normal socket === ws (no-op).
      if (socket) setWS(socket);
      if (hasConnectedBefore) {
        mostrarToast("¡Conexión restablecida!", "ok", { duracion: 3000 });
      }
      hasConnectedBefore = true;
      if (state.miNombre && (!ultimoMensajeEnviado || ultimoMensajeEnviado.tipo !== "alumno_entra")) {
        enviar({ tipo: "alumno_entra", nombre: state.miNombre, codigo: state.codigoPartida || undefined });
      }
    },
    onClose() {
      ultimoMensajeEnviado = null;
      mostrarToast("Conexión perdida. Intentando reconectar...", "err", { duracion: 0 });
    }
  });
  if (ws) setWS(ws);
}

export function enviar(tipo, extra) {
  const msg = typeof tipo === "string" ? { tipo, ...extra } : { ...tipo };
  const { token, ...originalPayload } = msg;
  ultimoMensajeEnviado = originalPayload;
  if (state.sessionToken) {
    msg.token = state.sessionToken;
  }
  wsEnviar(msg);
}

export function manejarMensaje(msg) {
  switch (msg.tipo) {
    case "bienvenido":
      // D3: sesión reparada → el contador de token_rotado arranca de cero.
      tokenRotadoAttempts = 0;
      // D6 (REQ-OFF-01): el E2E observa la reconexión real vía data attribute.
      document.body.dataset.reconectado = msg.reconectado ? "true" : "false";
      setMiId(msg.id);
      if (msg.token) {
        setSessionToken(msg.token);
        try {
          sessionStorage.setItem("historia_quiz_token", msg.token);
        } catch (e) {
          try {
            localStorage.setItem("historia_quiz_token", msg.token);
          } catch (e2) {}
        }
      }
      try {
        localStorage.setItem("historia_quiz_nombre", state.miNombre);
      } catch (e) {}
      try {
        if (state.codigoPartida) localStorage.setItem("historia_quiz_codigo", state.codigoPartida);
      } catch (e) {}
      setJugadoresSala((msg.jugadores || []).map(j => j.nombre));
      const nameDisplay = document.getElementById("nombre-display");
      if (nameDisplay) nameDisplay.textContent = state.miNombre;
      renderListaEspera();
      if (msg.reconectado && msg.fase === "pregunta") {
        setTiempoMax(msg.tiempo || 20);
        if (msg.respondioActual) {
          setMiRespuesta(msg.respuestaAnterior);
          setPantalla("s-respondio");
        } else {
          setMiRespuesta(null);
          mostrarPregunta(msg);
        }
        if (msg.pausado) {
          const alertEl = document.getElementById("pausa-alerta");
          if (alertEl) alertEl.style.display = "block";
          document.querySelectorAll(".opcion-btn").forEach(btn => btn.disabled = true);
        }
        break;
      }
      if (msg.reconectado && msg.fase === "resultado") {
        setMiRespuesta(msg.respuestaAnterior);
        mostrarResultado(msg);
        break;
      }
      if (msg.reconectado && msg.fase === "fin") {
        mostrarFin(msg.jugadores, msg.rankingGeneral, msg.miHistorial);
        break;
      }
      setPantalla("s-espera");
      break;
    case "jugador_unido_alumno":
      if (msg.nombre && !state.jugadoresSala.includes(msg.nombre)) {
        state.jugadoresSala.push(msg.nombre);
        renderListaEspera();
      }
      break;
    case "jugador_salio_alumno":
    case "jugador_desconectado_alumno":
      setJugadoresSala(state.jugadoresSala.filter(n => n !== msg.nombre));
      renderListaEspera();
      break;
    case "jugador_reconectado_alumno":
      if (msg.nombre && !state.jugadoresSala.includes(msg.nombre)) {
        state.jugadoresSala.push(msg.nombre);
        renderListaEspera();
      }
      break;
    case "nueva_pregunta":
      if (msg.tokensPorAlumno && msg.tokensPorAlumno[state.miId]) {
        const token = msg.tokensPorAlumno[state.miId];
        setSessionToken(token);
        try {
          sessionStorage.setItem("historia_quiz_token", token);
        } catch (e) {
          try {
            localStorage.setItem("historia_quiz_token", token);
          } catch (e2) {}
        }
      }
      setTiempoMax(msg.tiempo || 20);
      setMiRespuesta(null);
      setPendienteEnvio(false);
      mostrarPregunta(msg);
      break;
    case "tick":
      actualizarTimer(msg.tiempo);
      break;
    case "juego_pausado":
      const alertElPausa = document.getElementById("pausa-alerta");
      if (alertElPausa) alertElPausa.style.display = "block";
      document.querySelectorAll(".opcion-btn").forEach(btn => btn.disabled = true);
      break;
    case "juego_reanudado":
      const alertElReanudar = document.getElementById("pausa-alerta");
      if (alertElReanudar) alertElReanudar.style.display = "none";
      if (state.miRespuesta === null) {
        document.querySelectorAll(".opcion-btn").forEach(btn => btn.disabled = false);
      }
      actualizarTimer(msg.tiempo);
      break;
    case "resultado":
      mostrarResultado(msg);
      break;
    case "juego_reiniciado":
      setTiempoMax(msg.tiempoPorPregunta || 20);
      setMiPuntaje(0);
      setMiRespuesta(null);
      setPendienteEnvio(false);
      setPantalla("s-espera");
      break;
    case "fin_juego":
      setPendienteEnvio(false);
      mostrarFin(msg.jugadores, msg.rankingGeneral, msg.miHistorial);
      break;
    case "volver_a_lobby":
      setMiPuntaje(0);
      setMiRespuesta(null);
      setPendienteEnvio(false);
      setPantalla("s-espera");
      break;
    case "nombre_cambiado":
      setMiNombre(msg.nombre);
      const nameDisplayEdit = document.getElementById("nombre-display");
      if (nameDisplayEdit) nameDisplayEdit.textContent = msg.nombre;
      try {
        localStorage.setItem("historia_quiz_nombre", msg.nombre);
      } catch (e) {}
      if (msg.oldNombre && msg.oldNombre !== msg.nombre) {
        setJugadoresSala(
          state.jugadoresSala.map((n) => (n === msg.oldNombre ? msg.nombre : n))
        );
        renderListaEspera();
      }
      break;
    case "respuesta_rechazada": {
      const fn = MANEJADORES_RECHAZO[msg.razon];
      if (typeof fn !== "function") {
        console.warn(`respuesta_rechazada con razon desconocida: ${msg.razon}`);
        break;
      }
      fn();
      setPendienteEnvio(false);
      break;
    }
    case "respuesta_ok":
      setPendienteEnvio(false);
      break;
    case "auth_rechazada":
      if (msg.razon === "token_rotado") {
        if (msg.token) {
          setSessionToken(msg.token);
          try {
            sessionStorage.setItem("historia_quiz_token", msg.token);
          } catch (e) {
            try {
              localStorage.setItem("historia_quiz_token", msg.token);
            } catch (e2) {}
          }
        }
        if (ultimoMensajeEnviado) {
          const isRespuesta = ultimoMensajeEnviado.tipo === "respuesta";
          const preguntaEl = document.getElementById("s-pregunta");
          const respondioEl = document.getElementById("s-respondio");
          const isPreguntaActiva = typeof jest !== "undefined" ||
                                   (preguntaEl && preguntaEl.classList.contains("activa")) ||
                                   (respondioEl && respondioEl.classList.contains("activa"));
          if (!isRespuesta || isPreguntaActiva) {
            if (msg.token) {
              // REQ-UI-09 (happy path): el server emitió un token fresco → reintento único.
              enviar(ultimoMensajeEnviado);
            } else {
              // REQ-UI-09 (fallback): sin token del server, reintentos acotados a N;
              // superado el límite, el mensaje pendiente queda sin enviar (no loop).
              tokenRotadoAttempts++;
              if (tokenRotadoAttempts < MAX_TOKEN_ROTADO_ATTEMPTS) {
                enviar(ultimoMensajeEnviado);
              }
            }
          }
        }
      } else if (msg.razon === "server_shutting_down") {
        mostrarToast("El servidor se está apagando.", "err");
        // REQ-UI-08: kill-switch compartido — no más reintentos de reconexión.
        setAutoReconnectEnabled(false);
        if (state.ws) {
          state.ws.close();
          setWS(null);
        }
      }
      break;
    case "error_nombre":
      if (state.miId) {
        mostrarToast(msg.msg || "Ese nombre ya está en uso. Probá con otro.", "err");
      } else {
        const errEl = document.getElementById("error-nombre");
        if (errEl) {
          errEl.textContent = msg.msg || "Ese nombre ya está en uso. Probá con otro.";
          errEl.style.display = "block";
        }
        const btnEntrar = document.getElementById("btn-entrar");
        if (btnEntrar) btnEntrar.disabled = false;
        // REQ-UI-08: primer login rechazado → sin loop de reconexión.
        setAutoReconnectEnabled(false);
        if (state.ws) { state.ws.close(); setWS(null); }
      }
      break;
    case "codigo_invalido":
      setAutoReconnectEnabled(false);
      if (state.ws) { state.ws.close(); setWS(null); }
      setPantalla("s-unirse");
      {
        const errEl = document.getElementById("error-nombre");
        if (errEl) {
          errEl.textContent = msg.mensaje || "Código de partida inválido o finalizado.";
          errEl.style.display = "block";
        }
        const btnEntrar = document.getElementById("btn-entrar");
        if (btnEntrar) btnEntrar.disabled = false;
      }
      break;
  }
}

export function renderListaEspera() {
  const container = document.getElementById("lista-espera");
  if (!container) return;
  container.innerHTML = state.jugadoresSala.map(name => `<div class="espera-chip">${esc(name)}</div>`).join("");
  const cantEsperaEl = document.getElementById("cant-espera");
  if (cantEsperaEl) cantEsperaEl.textContent = state.jugadoresSala.length;
}

// ── Dispatch de respuesta_rechazada ──────────────────────────────────────
// Razon → acción de recuperación + toast.
// Sólo opcion_invalida re-habilita botones; el resto mantiene el estado.
const MANEJADORES_RECHAZO = {
  opcion_invalida: () => {
    setMiRespuesta(null);
    restaurarOpciones();
    setPantalla("s-pregunta");
    mostrarToast("Opción inválida. Probá de nuevo.", "err");
  },
  ya_respondio: () => {
    mostrarToast("Ya enviaste tu respuesta.", "err");
  },
  pausado: () => {
    mostrarToast("El juego está pausado. Esperá a que el docente reanude.", "err");
  },
  fase_invalida: () => {
    mostrarToast("La ronda ya terminó.", "err");
  },
  no_sesion: () => {
    mostrarToast("Tu sesión se cerró. Recargando...", "err");
    setTimeout(() => { try { window.location.reload(); } catch { /* noop */ } }, 3000);
  }
};

