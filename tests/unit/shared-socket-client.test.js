<<<<<<< HEAD
/**
 * @jest-environment jsdom
 */
const { onMensaje, conectar, enviar, getWS, setAutoReconnectEnabled, calcularDelayReintento, RETRY_INMEDIATO_WATCHDOG_MS } = require('../../src/client/shared/socket-client.js');

describe('shared/socket-client', () => {
  let wsInstance;
  let wsCount;
  // Modo "deferred close": cuando es true, el cierre nativo deja el socket en
  // CLOSED SIN disparar el evento close (carrera real: el estado CLOSED es
  // visible antes de que corra la tarea del evento). El test flushea el
  // onclose manualmente vía listeners.close().
  let deferCloseEvent;

  beforeEach(() => {
    wsCount = 0;
    deferCloseEvent = false;
    global.WebSocket = class MockWS {
      constructor(url) {
        this.url = url;
        this.readyState = 0;
        this.listeners = {};
        wsCount++;
        wsInstance = this;
      }
      // socket-client asigna ws.onclose = fn (property), no addEventListener
      set onclose(fn) { this.listeners.close = fn; }
      addEventListener(e, fn) { this.listeners[e] = fn; }
      send(data) { this.lastSent = data; }
      // Browser-faithful (WHATWG): close() sobre OPEN/CONNECTING setea CLOSING
      // SÍNCRONO y la transición CLOSING→CLOSED + evento close llegan
      // ASÍNCRONO. close() sobre CLOSING/CLOSED es no-op.
      close() {
        if (this.readyState === WebSocket.CLOSING || this.readyState === WebSocket.CLOSED) return;
        this.readyState = WebSocket.CLOSING;
        setTimeout(() => {
          if (this.readyState !== WebSocket.CLOSING) return;
          this.readyState = WebSocket.CLOSED;
          if (!deferCloseEvent && this.listeners.close) this.listeners.close();
        }, 0);
      }
    };
    global.WebSocket.OPEN = 1;
    global.WebSocket.CONNECTING = 0;
    global.WebSocket.CLOSING = 2;
    global.WebSocket.CLOSED = 3;
    jest.useFakeTimers();
  });

  afterEach(() => {
    const w = getWS();
    if (w) w.close();
    // El cierre asíncrono del mock (CLOSING→CLOSED) puede quedar pendiente:
    // descartarlo evita que un onclose de otro test dispare retries reales.
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function cerrarSocket() {
    wsInstance.readyState = 3;
    if (wsInstance.listeners.close) wsInstance.listeners.close();
  }

  test('conectar crea WebSocket', () => {
    const ws = conectar();
    expect(ws).toBeDefined();
    expect(ws.url).toContain('ws://');
  });

  test('conectar retorna ws existente si ya conectado', () => {
    const ws1 = conectar();
    wsInstance.readyState = WebSocket.OPEN;
    const ws2 = conectar();
    expect(ws2).toBe(ws1);
  });

  test('onMensaje registra handler y recibe mensajes', () => {
    const handler = jest.fn();
    onMensaje(handler);
    conectar();
    const msg = { tipo: 'test', data: 1 };
    wsInstance.onmessage({ data: JSON.stringify(msg) });
    expect(handler).toHaveBeenCalledWith(msg);
  });

  test('onMensaje retorna unsubscribe', () => {
    const handler = jest.fn();
    const unsubscribe = onMensaje(handler);
    unsubscribe();
    conectar();
    wsInstance.onmessage({ data: JSON.stringify({ tipo: 'test' }) });
    expect(handler).not.toHaveBeenCalled();
  });

  test('enviar serializa y envía', () => {
    conectar();
    wsInstance.readyState = WebSocket.OPEN;
    enviar({ tipo: 'saludo' });
    expect(JSON.parse(wsInstance.lastSent)).toEqual({ tipo: 'saludo' });
  });

  test('enviar no falla si ws no está abierto', () => {
    conectar();
    wsInstance.readyState = 3;
    expect(() => enviar({ tipo: 'test' })).not.toThrow();
  });

  test('getWS retorna la instancia actual', () => {
    const ws = conectar();
    expect(getWS()).toBe(ws);
  });

  test('reconexión automática en onclose (primer intento ≤ 2000ms)', () => {
    conectar();
    cerrarSocket();
    jest.advanceTimersByTime(2000);
    // retry programado con backoff: el intento 1 cae dentro de la ventana de 2000ms
    expect(wsCount).toBe(2);
  });

  describe('REQ-UI-08/09/10: setAutoReconnectEnabled (D3)', () => {
    test('setAutoReconnectEnabled(false) → onclose NO programa reconexión', () => {
      conectar(); // estado normal: flag en true
      setAutoReconnectEnabled(false); // estado terminal: kill-switch
      wsInstance.readyState = 3;
      if (wsInstance.listeners.close) wsInstance.listeners.close();
      jest.advanceTimersByTime(2100);
      expect(wsCount).toBe(1); // sin retry
    });

    test('conectar() explícito re-habilita la auto-reconexión', () => {
      conectar();
      setAutoReconnectEnabled(false);
      wsInstance.readyState = 3;
      if (wsInstance.listeners.close) wsInstance.listeners.close();
      jest.advanceTimersByTime(2100);
      expect(wsCount).toBe(1); // deshabilitado: sin retry

      // Acción explícita del usuario (entrar()) re-habilita
      conectar();
      expect(wsCount).toBe(2);
      wsInstance.readyState = 3;
      if (wsInstance.listeners.close) wsInstance.listeners.close();
      jest.advanceTimersByTime(2100);
      expect(wsCount).toBe(3); // retry programado
    });

    test('el retry interno NO re-habilita la auto-reconexión', () => {
      conectar();
      setAutoReconnectEnabled(false);
      wsInstance.readyState = 3;
      if (wsInstance.listeners.close) wsInstance.listeners.close();
      jest.advanceTimersByTime(2100);
      expect(wsCount).toBe(1);

      // Lo que hace el retry interno (reiniciarAutoReconexion: false)
      conectar({ reiniciarAutoReconexion: false });
      expect(wsCount).toBe(2);
      wsInstance.readyState = 3;
      if (wsInstance.listeners.close) wsInstance.listeners.close();
      jest.advanceTimersByTime(2100);
      expect(wsCount).toBe(2); // sigue deshabilitado
    });

    test('beforeunload se registra UNA sola vez aunque conectar() se llame varias veces', () => {
      jest.isolateModules(() => {
        const spy = jest.spyOn(window, 'addEventListener');
        try {
          const fresh = require('../../src/client/shared/socket-client.js');
          fresh.conectar();
          fresh.conectar();
          const beforeunloadCalls = spy.mock.calls.filter(([ev]) => ev === 'beforeunload');
          expect(beforeunloadCalls).toHaveLength(1);
        } finally {
          // Higiene: el módulo aislado registró listeners en el window COMPARTIDO
          // del jsdom. Removerlos evita que handlers de un módulo fantasma
          // interfieran en tests posteriores (offline/online reales dispararían
          // su retry sobre el mock global).
          spy.mock.calls.forEach(([ev, fn]) => window.removeEventListener(ev, fn));
          spy.mockRestore();
        }
      });
    });

    test('offline cierra el WS zombie y PAUSA el retry; online reanuda al instante (REQ-OFF-01 + backoff)', () => {
      conectar();
      wsInstance.readyState = WebSocket.OPEN;
      expect(wsCount).toBe(1);

      // Drop de red sin close frame (Playwright setOffline, wifi flaky):
      // `offline` → cierra el zombie Y cancela cualquier retry pendiente.
      window.dispatchEvent(new Event('offline'));
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(1); // cero churn contra la red muerta

      // Al volver la red, la auto-reconexión sigue activa → retry INMEDIATO.
      window.dispatchEvent(new Event('online'));
      expect(wsCount).toBe(2);
    });
  });

  describe('calcularDelayReintento (backoff exponencial + full jitter, puro)', () => {
    test('crece exponencialmente (base 2000) y toca el cap de 30s', () => {
      const delays = [1, 2, 3, 4, 5, 6].map(i => calcularDelayReintento(i, () => 1));
      expect(delays).toEqual([2000, 4000, 8000, 16000, 30000, 30000]);
    });

    test('el jitter escala el delay dentro de [1, exp] con random inyectado', () => {
      expect(calcularDelayReintento(3, () => 0)).toBe(1); // piso de 1ms: jamás delay 0 (bucle apretado)
      expect(calcularDelayReintento(3, () => 0.5)).toBe(4000);
      expect(calcularDelayReintento(3, () => 1)).toBe(8000);
      expect(calcularDelayReintento(10, () => 1)).toBe(30000); // cap también con intentos altos
    });

    test('con Math.random real devuelve un delay dentro de [1, exp]', () => {
      const d = calcularDelayReintento(1);
      expect(d).toBeGreaterThanOrEqual(1); // piso de 1ms
      expect(d).toBeLessThanOrEqual(2000);
    });
  });

  describe('retry real: backoff + jitter + offline/online (fake timers)', () => {
    test('el retry crece en ventanas máximas, se acota a 30s y NO duplica sockets', () => {
      conectar(); // 1
      cerrarSocket();
      expect(jest.getTimerCount()).toBe(1); // UN solo retry pendiente (sin duplicados)
      jest.advanceTimersByTime(2000); expect(wsCount).toBe(2);   // intento 1: ≤ 2000ms
      cerrarSocket();
      jest.advanceTimersByTime(4000); expect(wsCount).toBe(3);   // intento 2: ≤ 4000ms
      cerrarSocket();
      jest.advanceTimersByTime(8000); expect(wsCount).toBe(4);   // intento 3: ≤ 8000ms
      cerrarSocket();
      jest.advanceTimersByTime(16000); expect(wsCount).toBe(5);  // intento 4: ≤ 16000ms
      cerrarSocket();
      jest.advanceTimersByTime(30000); expect(wsCount).toBe(6);  // intento 5: cap 30000ms
      cerrarSocket();
      jest.advanceTimersByTime(30000); expect(wsCount).toBe(7);  // intento 6: sigue en el cap
    });

    test('offline cancela un retry ya programado; online lo reanuda al instante', () => {
      conectar(); // 1
      cerrarSocket(); // retry pendiente (intento 1)
      window.dispatchEvent(new Event('offline'));
      expect(jest.getTimerCount()).toBe(0); // el retry pendiente quedó cancelado
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(1); // pausado: cero churn

      // El `online` deja el módulo en estado limpio (sinRed=false) para el
      // próximo test y reanuda el retry al instante.
      window.dispatchEvent(new Event('online'));
      expect(wsCount).toBe(2);
    });

    test('online reinicia el backoff desde el intento 1', () => {
      conectar(); // 1
      cerrarSocket();
      jest.advanceTimersByTime(3000); expect(wsCount).toBe(2);   // intento 1 (≤ 2000ms)
      cerrarSocket();
      jest.advanceTimersByTime(5000); expect(wsCount).toBe(3);   // intento 2 (≤ 4000ms)

      // El socket del retry #2 también falla → retry #3 pendiente...
      cerrarSocket();
      // ...pero la red se cae: `offline` lo cancela sin churn.
      window.dispatchEvent(new Event('offline'));
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(3); // pausado

      // Red restablecida → retry INMEDIATO con backoff fresco (intento 1).
      window.dispatchEvent(new Event('online'));
      expect(wsCount).toBe(4);

      cerrarSocket();
      jest.advanceTimersByTime(2000); expect(wsCount).toBe(5);   // intento 1 fresco (≤ 2000ms), no intento 3 (≤ 8000ms)
    });

    test('online NO reintenta si el kill-switch sigue desactivado', () => {
      conectar(); // 1
      wsInstance.readyState = WebSocket.OPEN;
      setAutoReconnectEnabled(false);
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(1);
    });

    test('setAutoReconnectEnabled(false) cancela un retry ya programado', () => {
      conectar(); // 1
      cerrarSocket(); // retry pendiente
      setAutoReconnectEnabled(false); // kill-switch cancela el timer pendiente
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(1);
    });

    test('online/offline se registran UNA sola vez aunque conectar() se llame varias veces', () => {
      jest.isolateModules(() => {
        const spy = jest.spyOn(window, 'addEventListener');
        try {
          const fresh = require('../../src/client/shared/socket-client.js');
          fresh.conectar();
          fresh.conectar();
          const events = spy.mock.calls.map(([ev]) => ev);
          expect(events.filter(ev => ev === 'beforeunload')).toHaveLength(1);
          expect(events.filter(ev => ev === 'offline')).toHaveLength(1);
          expect(events.filter(ev => ev === 'online')).toHaveLength(1);
        } finally {
          // Higiene: ver test de beforeunload — sin esto, los listeners del
          // módulo aislado sobreviven en el window compartido y contaminan
          // los tests de offline/online posteriores.
          spy.mock.calls.forEach(([ev, fn]) => window.removeEventListener(ev, fn));
          spy.mockRestore();
        }
      });
    });
  });

  describe('race nativo offline/online: socket en CLOSING + stale guards', () => {
    test('online durante CLOSING no duplica socket; el onclose del socket actual hace el retry inmediato', () => {
      conectar(); // 1
      wsInstance.readyState = WebSocket.CLOSING; // el cierre nativo aún no terminó

      window.dispatchEvent(new Event('online'));
      expect(wsCount).toBe(1); // NO se crea un segundo socket mientras CLOSING

      cerrarSocket(); // CLOSING → CLOSED: el onclose retoma el retry inmediato
      expect(wsCount).toBe(2);
      expect(getWS().readyState).toBe(WebSocket.CONNECTING);

      // Backoff fresco (intento 1, ≤ 2000ms), igual que el online normal.
      cerrarSocket();
      jest.advanceTimersByTime(2000);
      expect(wsCount).toBe(3);
    });

    test('el onclose tardío de un socket viejo (stale) no programa retry ni afecta al nuevo', () => {
      const socketViejo = conectar(); // 1
      socketViejo.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // retry inmediato pendiente

      conectar(); // 2 — explícito: reemplaza al socket viejo
      socketViejo.readyState = WebSocket.CLOSED;
      socketViejo.listeners.close(); // el close del viejo llega DESPUÉS del reemplazo

      expect(wsCount).toBe(2); // el close stale no crea un tercer socket
      expect(getWS()).toBe(wsInstance); // el socket nuevo sigue intacto
    });

    test('el onopen tardío de un socket viejo (stale) se ignora', () => {
      const onOpen = jest.fn();
      conectar({ onOpen }); // 1
      const socketViejo = wsInstance;
      socketViejo.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // pendiente

      conectar(); // 2 — explícito
      socketViejo.onopen(); // onopen stale

      expect(onOpen).not.toHaveBeenCalled(); // el callback del socket viejo NO se dispara
      expect(getWS().readyState).toBe(WebSocket.CONNECTING);
    });

    test('conectar() explícito cancela el retry inmediato pendiente', () => {
      conectar(); // 1
      wsInstance.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // pendiente

      conectar(); // 2 — explícito: cancela el pendiente
      cerrarSocket(); // el socket nuevo cierra normalmente

      expect(wsCount).toBe(2); // SIN retry inmediato (marcador cancelado)
      jest.advanceTimersByTime(2000);
      expect(wsCount).toBe(3); // el backoff normal sigue funcionando
    });

    test('offline cancela el retry inmediato pendiente sin churn', () => {
      conectar(); // 1
      wsInstance.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // pendiente + watchdog armado
      window.dispatchEvent(new Event('offline')); // limpia pendiente Y watchdog
      expect(jest.getTimerCount()).toBe(0); // sin watchdog colgado contra la red muerta

      cerrarSocket(); // onclose: sin retry inmediato ni timer
      expect(wsCount).toBe(1);
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(1); // cero churn contra la red muerta

      // Higiene: `online` deja el módulo en estado limpio (sinRed=false) para
      // el próximo test — ver convención en 'offline cancela un retry ya
      // programado; online lo reanuda al instante'.
      window.dispatchEvent(new Event('online'));
      expect(wsCount).toBe(2); // reanuda y limpia sinRed
    });

    test('beforeunload cancela el retry inmediato pendiente', () => {
      conectar(); // 1
      wsInstance.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // pendiente
      window.dispatchEvent(new Event('beforeunload')); // kill-switch + limpia pendiente

      cerrarSocket();
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(1);
    });

    test('kill-switch cancela el retry inmediato pendiente (CLOSING)', () => {
      conectar(); // 1
      wsInstance.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // pendiente
      setAutoReconnectEnabled(false); // kill-switch aborta el pendiente

      cerrarSocket();
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(1);
    });

    test('offline durante CONNECTING cierra el socket en handshake y pausa; online reanuda', () => {
      const onClose = jest.fn();
      conectar({ onClose }); // 1 — handshake en curso (readyState CONNECTING)
      expect(wsInstance.readyState).toBe(WebSocket.CONNECTING);

      // Drop de red DURANTE el handshake: `offline` debe cerrar también el
      // socket en CONNECTING (pre-fix sólo cerraba OPEN → quedaba colgado y
      // `online` veía CONNECTING y saltaba la reconexión).
      window.dispatchEvent(new Event('offline'));
      expect(wsInstance.readyState).toBe(WebSocket.CLOSING); // cierre nativo iniciado (síncrono)

      jest.advanceTimersByTime(60000); // CLOSING → CLOSED (asíncrono) → onclose
      expect(wsCount).toBe(1); // cero churn contra la red muerta
      expect(onClose).toHaveBeenCalledTimes(1);

      window.dispatchEvent(new Event('online')); // socket ya CLOSED → retry inmediato
      expect(wsCount).toBe(2);
    });

    test('online durante el cierre asíncrono (CLOSING): onClose externo exactamente una vez y reanuda exactamente una vez', () => {
      const onClose = jest.fn();
      const socketViejo = conectar({ onClose }); // 1 — CONNECTING
      window.dispatchEvent(new Event('offline')); // close() → CLOSING síncrono, CLOSED pendiente
      expect(socketViejo.readyState).toBe(WebSocket.CLOSING);

      // `online` llega ANTES del CLOSED (carrera real del navegador):
      window.dispatchEvent(new Event('online'));
      expect(wsCount).toBe(1); // sin socket duplicado
      expect(jest.getTimerCount()).toBe(2); // cierre asíncrono pendiente + watchdog del CLOSING (no hay retry timer)

      jest.advanceTimersByTime(1); // CLOSING → CLOSED → onclose del socket ACTUAL
      expect(onClose).toHaveBeenCalledTimes(1); // el onClose externo corre UNA vez
      expect(wsCount).toBe(2); // reanuda con UN solo socket nuevo
      expect(getWS()).not.toBe(socketViejo);
      expect(getWS().readyState).toBe(WebSocket.CONNECTING);
      expect(jest.getTimerCount()).toBe(0); // retry inmediato sin timer pendiente
    });

    test('online con socket CLOSED y onclose pendiente: el cierre se procesa UNA vez y reanuda; el onclose tardío es no-op', () => {
      const onClose = jest.fn();
      deferCloseEvent = true; // CLOSED SIN evento close (carrera real)
      const socketViejo = conectar({ onClose }); // 1 — CONNECTING
      socketViejo.close(); // cierre nativo: CLOSING síncrono
      jest.advanceTimersByTime(1); // CLOSING → CLOSED, el evento close queda PENDIENTE
      expect(socketViejo.readyState).toBe(WebSocket.CLOSED);

      // CRÍTICO: `online` llega con el socket nativo ya CLOSED pero su evento
      // close aún sin correr. El cierre debe procesarse AHORA (una sola vez)
      // y la reconexión reanudar al instante.
      window.dispatchEvent(new Event('online'));
      expect(onClose).toHaveBeenCalledTimes(1); // onCloseCallback exactamente UNA vez
      expect(wsCount).toBe(2); // exactamente UN socket de reemplazo
      expect(getWS()).not.toBe(socketViejo);
      expect(getWS().readyState).toBe(WebSocket.CONNECTING);
      expect(jest.getTimerCount()).toBe(0); // reanudación inmediata: sin retry timer

      // El onclose tardío del socket viejo llega DESPUÉS del reemplazo:
      socketViejo.listeners.close();
      expect(onClose).toHaveBeenCalledTimes(1); // sin duplicado del callback
      expect(wsCount).toBe(2); // sin tercer socket
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(2); // sin retry duplicado
    });

    test('kill-switch dentro de onCloseCallback aborta la reconexión del online con socket CLOSED: sin reemplazo ni retry', () => {
      const onClose = jest.fn(() => setAutoReconnectEnabled(false)); // el callback apaga la auto-reconexión
      deferCloseEvent = true; // CLOSED SIN evento close (carrera real)
      const socketViejo = conectar({ onClose }); // 1 — CONNECTING
      socketViejo.close(); // cierre nativo: CLOSING síncrono
      jest.advanceTimersByTime(1); // CLOSING → CLOSED, el evento close queda PENDIENTE
      expect(socketViejo.readyState).toBe(WebSocket.CLOSED);

      // `online` llega con el socket nativo ya CLOSED pero su evento close
      // aún sin correr. El cierre se procesa AHORA y el onCloseCallback
      // desactiva la auto-reconexión (kill-switch): el código debe
      // RE-CHEQUEAR reconectarAuto después del procesamiento y NO crear el
      // socket de reemplazo.
      window.dispatchEvent(new Event('online'));
      expect(onClose).toHaveBeenCalledTimes(1); // onCloseCallback exactamente UNA vez
      expect(wsCount).toBe(1); // sin socket de reemplazo
      expect(getWS()).toBe(socketViejo);
      expect(jest.getTimerCount()).toBe(0); // sin retry timer

      // El onclose tardío del socket viejo llega DESPUÉS del `online`:
      socketViejo.listeners.close();
      expect(onClose).toHaveBeenCalledTimes(1); // sin duplicado del callback
      expect(wsCount).toBe(1); // sigue sin reemplazo
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(1); // y sin retry posterior: el kill-switch gana
    });

    test('beforeunload también cierra un socket en CONNECTING (mismo principio que offline)', () => {
      conectar(); // 1 — CONNECTING
      window.dispatchEvent(new Event('beforeunload'));
      expect(wsInstance.readyState).toBe(WebSocket.CLOSING); // el cierre nativo arrancó
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(1); // kill-switch de unload: sin retry
    });

    test('el onmessage tardío de un socket viejo (stale) no entrega mensajes', () => {
      const handler = jest.fn();
      onMensaje(handler);
      conectar(); // 1
      const socketViejo = wsInstance;
      socketViejo.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // retry inmediato pendiente

      conectar(); // 2 — explícito: reemplaza al socket viejo
      socketViejo.onmessage({ data: JSON.stringify({ tipo: 'stale' }) }); // mensaje del socket viejo

      expect(handler).not.toHaveBeenCalled(); // el guard de identidad lo descarta

      wsInstance.onmessage({ data: JSON.stringify({ tipo: 'vigente' }) }); // el socket nuevo sigue entregando
      expect(handler).toHaveBeenCalledWith({ tipo: 'vigente' });
    });

    test('kill-switch dentro de onCloseCallback aborta el retry inmediato (CLOSING): sin socket de reemplazo', () => {
      const onClose = () => setAutoReconnectEnabled(false); // el callback apaga la auto-reconexión
      conectar({ onClose }); // 1
      wsInstance.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // retry inmediato pendiente (con watchdog)

      // CLOSING → CLOSED → onclose: el procesamiento invoca onCloseCallback,
      // que desactiva la auto-reconexión. El código debe RE-CHEQUEAR
      // reconectarAuto después del callback y NO crear el socket de reemplazo.
      cerrarSocket();
      expect(wsCount).toBe(1); // sin socket de reemplazo
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(1); // y sin retry posterior: el kill-switch gana
    });
  });

  describe('watchdog del retry inmediato: CLOSING patológico que jamás emite close', () => {
    test('reemplaza el socket colgado tras el límite conservador: cierre exactamente una vez, un solo reemplazo', () => {
      const onClose = jest.fn();
      const socketViejo = conectar({ onClose }); // 1
      socketViejo.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // marker + watchdog armado
      expect(wsCount).toBe(1); // sin duplicado inmediato
      expect(jest.getTimerCount()).toBe(1); // sólo el watchdog (no hay cierre nativo pendiente)

      // El socket NUNCA emite close (patológico): el watchdog lo reemplaza.
      jest.advanceTimersByTime(RETRY_INMEDIATO_WATCHDOG_MS);
      expect(onClose).toHaveBeenCalledTimes(1); // cierre procesado exactamente una vez
      expect(wsCount).toBe(2); // UN solo socket de reemplazo
      expect(getWS()).not.toBe(socketViejo);
      expect(getWS().readyState).toBe(WebSocket.CONNECTING);
      expect(jest.getTimerCount()).toBe(0); // watchdog consumido
    });

    test('no se dispara antes del límite conservador', () => {
      conectar(); // 1
      wsInstance.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // watchdog armado
      jest.advanceTimersByTime(RETRY_INMEDIATO_WATCHDOG_MS - 1);
      expect(wsCount).toBe(1); // aún dentro de la ventana: sin reemplazo
    });

    test('el cierre normal cancela el watchdog: sin reemplazo espurio', () => {
      conectar(); // 1
      wsInstance.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // watchdog armado
      cerrarSocket(); // cierre normal dentro de la ventana → retry inmediato por onclose
      expect(wsCount).toBe(2);
      jest.advanceTimersByTime(RETRY_INMEDIATO_WATCHDOG_MS);
      expect(wsCount).toBe(2); // el watchdog quedó cancelado: sin segundo reemplazo
    });

    test('el kill-switch cancela el watchdog: el CLOSING patológico respeta el kill-switch', () => {
      conectar(); // 1
      wsInstance.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // watchdog armado
      setAutoReconnectEnabled(false); // kill-switch aborta marker + watchdog
      expect(jest.getTimerCount()).toBe(0);
      jest.advanceTimersByTime(RETRY_INMEDIATO_WATCHDOG_MS);
      expect(wsCount).toBe(1); // sin reemplazo: kill-switch respetado
    });
  });

  describe('carga inicial offline: navigator.onLine=false (REQ-OFF-01)', () => {
    test('no deja socket CONNECTING "sano" para siempre; online crea UN socket y preserva callbacks y cola', () => {
      jest.isolateModules(() => {
        // La página carga YA sin red (navigator.onLine=false) ANTES de requerir el módulo.
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
        const spy = jest.spyOn(window, 'addEventListener');
        try {
          const fresh = require('../../src/client/shared/socket-client.js');
          const onOpen = jest.fn();
          fresh.conectar({ onOpen });
          expect(fresh.getWS()).toBeNull(); // sin socket CONNECTING contra la red muerta

          fresh.enviar({ tipo: 'alumno_entra', nombre: 'Ana' }); // queda en cola

          // La red vuelve: invocamos el handler `online` del módulo AISLADO
          // directamente. window.dispatchEvent(new Event('online')) también
          // dispararía el listener del módulo original (cargado al inicio del
          // archivo): corriendo SOLO con --testNamePattern ese módulo está en
          // estado inicial (auto-reconexión activa, sinRed=false) y crearía un
          // socket extra — el test depende del orden de los tests anteriores.
          const freshOnlineHandler = spy.mock.calls
            .filter(([ev]) => ev === 'online')
            .map(([, fn]) => fn)
            .pop();
          expect(freshOnlineHandler).toBeDefined();
          freshOnlineHandler();
          expect(fresh.getWS()).not.toBeNull();
          expect(wsCount).toBe(1);

          // El socket nuevo drena la cola y dispara el onOpen registrado offline.
          wsInstance.readyState = WebSocket.OPEN;
          wsInstance.onopen();
          expect(onOpen).toHaveBeenCalledTimes(1);
          expect(JSON.parse(wsInstance.lastSent)).toEqual({ tipo: 'alumno_entra', nombre: 'Ana' });
        } finally {
          Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
          spy.mock.calls.forEach(([ev, fn]) => window.removeEventListener(ev, fn));
          spy.mockRestore();
        }
      });
    });
  });
});
=======
/**
 * @jest-environment jsdom
 */
const { onMensaje, conectar, enviar, getWS, setAutoReconnectEnabled, calcularDelayReintento, RETRY_INMEDIATO_WATCHDOG_MS } = require('../../src/client/shared/socket-client.js');

describe('shared/socket-client', () => {
  let wsInstance;
  let wsCount;
  // Modo "deferred close": cuando es true, el cierre nativo deja el socket en
  // CLOSED SIN disparar el evento close (carrera real: el estado CLOSED es
  // visible antes de que corra la tarea del evento). El test flushea el
  // onclose manualmente vía listeners.close().
  let deferCloseEvent;

  beforeEach(() => {
    wsCount = 0;
    deferCloseEvent = false;
    global.WebSocket = class MockWS {
      constructor(url) {
        this.url = url;
        this.readyState = 0;
        this.listeners = {};
        wsCount++;
        wsInstance = this;
      }
      // socket-client asigna ws.onclose = fn (property), no addEventListener
      set onclose(fn) { this.listeners.close = fn; }
      addEventListener(e, fn) { this.listeners[e] = fn; }
      send(data) { this.lastSent = data; }
      // Browser-faithful (WHATWG): close() sobre OPEN/CONNECTING setea CLOSING
      // SÍNCRONO y la transición CLOSING→CLOSED + evento close llegan
      // ASÍNCRONO. close() sobre CLOSING/CLOSED es no-op.
      close() {
        if (this.readyState === WebSocket.CLOSING || this.readyState === WebSocket.CLOSED) return;
        this.readyState = WebSocket.CLOSING;
        setTimeout(() => {
          if (this.readyState !== WebSocket.CLOSING) return;
          this.readyState = WebSocket.CLOSED;
          if (!deferCloseEvent && this.listeners.close) this.listeners.close();
        }, 0);
      }
    };
    global.WebSocket.OPEN = 1;
    global.WebSocket.CONNECTING = 0;
    global.WebSocket.CLOSING = 2;
    global.WebSocket.CLOSED = 3;
    jest.useFakeTimers();
  });

  afterEach(() => {
    const w = getWS();
    if (w) w.close();
    // El cierre asíncrono del mock (CLOSING→CLOSED) puede quedar pendiente:
    // descartarlo evita que un onclose de otro test dispare retries reales.
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function cerrarSocket() {
    wsInstance.readyState = 3;
    if (wsInstance.listeners.close) wsInstance.listeners.close();
  }

  test('conectar crea WebSocket', () => {
    const ws = conectar();
    expect(ws).toBeDefined();
    expect(ws.url).toContain('ws://');
  });

  test('conectar retorna ws existente si ya conectado', () => {
    const ws1 = conectar();
    wsInstance.readyState = WebSocket.OPEN;
    const ws2 = conectar();
    expect(ws2).toBe(ws1);
  });

  test('onMensaje registra handler y recibe mensajes', () => {
    const handler = jest.fn();
    onMensaje(handler);
    conectar();
    const msg = { tipo: 'test', data: 1 };
    wsInstance.onmessage({ data: JSON.stringify(msg) });
    expect(handler).toHaveBeenCalledWith(msg);
  });

  test('onMensaje retorna unsubscribe', () => {
    const handler = jest.fn();
    const unsubscribe = onMensaje(handler);
    unsubscribe();
    conectar();
    wsInstance.onmessage({ data: JSON.stringify({ tipo: 'test' }) });
    expect(handler).not.toHaveBeenCalled();
  });

  test('enviar serializa y envía', () => {
    conectar();
    wsInstance.readyState = WebSocket.OPEN;
    enviar({ tipo: 'saludo' });
    expect(JSON.parse(wsInstance.lastSent)).toEqual({ tipo: 'saludo' });
  });

  test('enviar no falla si ws no está abierto', () => {
    conectar();
    wsInstance.readyState = 3;
    expect(() => enviar({ tipo: 'test' })).not.toThrow();
  });

  test('getWS retorna la instancia actual', () => {
    const ws = conectar();
    expect(getWS()).toBe(ws);
  });

  test('reconexión automática en onclose (primer intento ≤ 2000ms)', () => {
    conectar();
    cerrarSocket();
    jest.advanceTimersByTime(2000);
    // retry programado con backoff: el intento 1 cae dentro de la ventana de 2000ms
    expect(wsCount).toBe(2);
  });

  describe('REQ-UI-08/09/10: setAutoReconnectEnabled (D3)', () => {
    test('setAutoReconnectEnabled(false) → onclose NO programa reconexión', () => {
      conectar(); // estado normal: flag en true
      setAutoReconnectEnabled(false); // estado terminal: kill-switch
      wsInstance.readyState = 3;
      if (wsInstance.listeners.close) wsInstance.listeners.close();
      jest.advanceTimersByTime(2100);
      expect(wsCount).toBe(1); // sin retry
    });

    test('conectar() explícito re-habilita la auto-reconexión', () => {
      conectar();
      setAutoReconnectEnabled(false);
      wsInstance.readyState = 3;
      if (wsInstance.listeners.close) wsInstance.listeners.close();
      jest.advanceTimersByTime(2100);
      expect(wsCount).toBe(1); // deshabilitado: sin retry

      // Acción explícita del usuario (entrar()) re-habilita
      conectar();
      expect(wsCount).toBe(2);
      wsInstance.readyState = 3;
      if (wsInstance.listeners.close) wsInstance.listeners.close();
      jest.advanceTimersByTime(2100);
      expect(wsCount).toBe(3); // retry programado
    });

    test('el retry interno NO re-habilita la auto-reconexión', () => {
      conectar();
      setAutoReconnectEnabled(false);
      wsInstance.readyState = 3;
      if (wsInstance.listeners.close) wsInstance.listeners.close();
      jest.advanceTimersByTime(2100);
      expect(wsCount).toBe(1);

      // Lo que hace el retry interno (reiniciarAutoReconexion: false)
      conectar({ reiniciarAutoReconexion: false });
      expect(wsCount).toBe(2);
      wsInstance.readyState = 3;
      if (wsInstance.listeners.close) wsInstance.listeners.close();
      jest.advanceTimersByTime(2100);
      expect(wsCount).toBe(2); // sigue deshabilitado
    });

    test('beforeunload se registra UNA sola vez aunque conectar() se llame varias veces', () => {
      jest.isolateModules(() => {
        const spy = jest.spyOn(window, 'addEventListener');
        try {
          const fresh = require('../../src/client/shared/socket-client.js');
          fresh.conectar();
          fresh.conectar();
          const beforeunloadCalls = spy.mock.calls.filter(([ev]) => ev === 'beforeunload');
          expect(beforeunloadCalls).toHaveLength(1);
        } finally {
          // Higiene: el módulo aislado registró listeners en el window COMPARTIDO
          // del jsdom. Removerlos evita que handlers de un módulo fantasma
          // interfieran en tests posteriores (offline/online reales dispararían
          // su retry sobre el mock global).
          spy.mock.calls.forEach(([ev, fn]) => window.removeEventListener(ev, fn));
          spy.mockRestore();
        }
      });
    });

    test('offline cierra el WS zombie y PAUSA el retry; online reanuda al instante (REQ-OFF-01 + backoff)', () => {
      conectar();
      wsInstance.readyState = WebSocket.OPEN;
      expect(wsCount).toBe(1);

      // Drop de red sin close frame (Playwright setOffline, wifi flaky):
      // `offline` → cierra el zombie Y cancela cualquier retry pendiente.
      window.dispatchEvent(new Event('offline'));
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(1); // cero churn contra la red muerta

      // Al volver la red, la auto-reconexión sigue activa → retry INMEDIATO.
      window.dispatchEvent(new Event('online'));
      expect(wsCount).toBe(2);
    });
  });

  describe('calcularDelayReintento (backoff exponencial + full jitter, puro)', () => {
    test('crece exponencialmente (base 2000) y toca el cap de 30s', () => {
      const delays = [1, 2, 3, 4, 5, 6].map(i => calcularDelayReintento(i, () => 1));
      expect(delays).toEqual([2000, 4000, 8000, 16000, 30000, 30000]);
    });

    test('el jitter escala el delay dentro de [1, exp] con random inyectado', () => {
      expect(calcularDelayReintento(3, () => 0)).toBe(1); // piso de 1ms: jamás delay 0 (bucle apretado)
      expect(calcularDelayReintento(3, () => 0.5)).toBe(4000);
      expect(calcularDelayReintento(3, () => 1)).toBe(8000);
      expect(calcularDelayReintento(10, () => 1)).toBe(30000); // cap también con intentos altos
    });

    test('con Math.random real devuelve un delay dentro de [1, exp]', () => {
      const d = calcularDelayReintento(1);
      expect(d).toBeGreaterThanOrEqual(1); // piso de 1ms
      expect(d).toBeLessThanOrEqual(2000);
    });
  });

  describe('retry real: backoff + jitter + offline/online (fake timers)', () => {
    test('el retry crece en ventanas máximas, se acota a 30s y NO duplica sockets', () => {
      conectar(); // 1
      cerrarSocket();
      expect(jest.getTimerCount()).toBe(1); // UN solo retry pendiente (sin duplicados)
      jest.advanceTimersByTime(2000); expect(wsCount).toBe(2);   // intento 1: ≤ 2000ms
      cerrarSocket();
      jest.advanceTimersByTime(4000); expect(wsCount).toBe(3);   // intento 2: ≤ 4000ms
      cerrarSocket();
      jest.advanceTimersByTime(8000); expect(wsCount).toBe(4);   // intento 3: ≤ 8000ms
      cerrarSocket();
      jest.advanceTimersByTime(16000); expect(wsCount).toBe(5);  // intento 4: ≤ 16000ms
      cerrarSocket();
      jest.advanceTimersByTime(30000); expect(wsCount).toBe(6);  // intento 5: cap 30000ms
      cerrarSocket();
      jest.advanceTimersByTime(30000); expect(wsCount).toBe(7);  // intento 6: sigue en el cap
    });

    test('offline cancela un retry ya programado; online lo reanuda al instante', () => {
      conectar(); // 1
      cerrarSocket(); // retry pendiente (intento 1)
      window.dispatchEvent(new Event('offline'));
      expect(jest.getTimerCount()).toBe(0); // el retry pendiente quedó cancelado
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(1); // pausado: cero churn

      // El `online` deja el módulo en estado limpio (sinRed=false) para el
      // próximo test y reanuda el retry al instante.
      window.dispatchEvent(new Event('online'));
      expect(wsCount).toBe(2);
    });

    test('online reinicia el backoff desde el intento 1', () => {
      conectar(); // 1
      cerrarSocket();
      jest.advanceTimersByTime(3000); expect(wsCount).toBe(2);   // intento 1 (≤ 2000ms)
      cerrarSocket();
      jest.advanceTimersByTime(5000); expect(wsCount).toBe(3);   // intento 2 (≤ 4000ms)

      // El socket del retry #2 también falla → retry #3 pendiente...
      cerrarSocket();
      // ...pero la red se cae: `offline` lo cancela sin churn.
      window.dispatchEvent(new Event('offline'));
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(3); // pausado

      // Red restablecida → retry INMEDIATO con backoff fresco (intento 1).
      window.dispatchEvent(new Event('online'));
      expect(wsCount).toBe(4);

      cerrarSocket();
      jest.advanceTimersByTime(2000); expect(wsCount).toBe(5);   // intento 1 fresco (≤ 2000ms), no intento 3 (≤ 8000ms)
    });

    test('online NO reintenta si el kill-switch sigue desactivado', () => {
      conectar(); // 1
      wsInstance.readyState = WebSocket.OPEN;
      setAutoReconnectEnabled(false);
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(1);
    });

    test('setAutoReconnectEnabled(false) cancela un retry ya programado', () => {
      conectar(); // 1
      cerrarSocket(); // retry pendiente
      setAutoReconnectEnabled(false); // kill-switch cancela el timer pendiente
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(1);
    });

    test('online/offline se registran UNA sola vez aunque conectar() se llame varias veces', () => {
      jest.isolateModules(() => {
        const spy = jest.spyOn(window, 'addEventListener');
        try {
          const fresh = require('../../src/client/shared/socket-client.js');
          fresh.conectar();
          fresh.conectar();
          const events = spy.mock.calls.map(([ev]) => ev);
          expect(events.filter(ev => ev === 'beforeunload')).toHaveLength(1);
          expect(events.filter(ev => ev === 'offline')).toHaveLength(1);
          expect(events.filter(ev => ev === 'online')).toHaveLength(1);
        } finally {
          // Higiene: ver test de beforeunload — sin esto, los listeners del
          // módulo aislado sobreviven en el window compartido y contaminan
          // los tests de offline/online posteriores.
          spy.mock.calls.forEach(([ev, fn]) => window.removeEventListener(ev, fn));
          spy.mockRestore();
        }
      });
    });
  });

  describe('race nativo offline/online: socket en CLOSING + stale guards', () => {
    test('online durante CLOSING no duplica socket; el onclose del socket actual hace el retry inmediato', () => {
      conectar(); // 1
      wsInstance.readyState = WebSocket.CLOSING; // el cierre nativo aún no terminó

      window.dispatchEvent(new Event('online'));
      expect(wsCount).toBe(1); // NO se crea un segundo socket mientras CLOSING

      cerrarSocket(); // CLOSING → CLOSED: el onclose retoma el retry inmediato
      expect(wsCount).toBe(2);
      expect(getWS().readyState).toBe(WebSocket.CONNECTING);

      // Backoff fresco (intento 1, ≤ 2000ms), igual que el online normal.
      cerrarSocket();
      jest.advanceTimersByTime(2000);
      expect(wsCount).toBe(3);
    });

    test('el onclose tardío de un socket viejo (stale) no programa retry ni afecta al nuevo', () => {
      const socketViejo = conectar(); // 1
      socketViejo.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // retry inmediato pendiente

      conectar(); // 2 — explícito: reemplaza al socket viejo
      socketViejo.readyState = WebSocket.CLOSED;
      socketViejo.listeners.close(); // el close del viejo llega DESPUÉS del reemplazo

      expect(wsCount).toBe(2); // el close stale no crea un tercer socket
      expect(getWS()).toBe(wsInstance); // el socket nuevo sigue intacto
    });

    test('el onopen tardío de un socket viejo (stale) se ignora', () => {
      const onOpen = jest.fn();
      conectar({ onOpen }); // 1
      const socketViejo = wsInstance;
      socketViejo.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // pendiente

      conectar(); // 2 — explícito
      socketViejo.onopen(); // onopen stale

      expect(onOpen).not.toHaveBeenCalled(); // el callback del socket viejo NO se dispara
      expect(getWS().readyState).toBe(WebSocket.CONNECTING);
    });

    test('conectar() explícito cancela el retry inmediato pendiente', () => {
      conectar(); // 1
      wsInstance.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // pendiente

      conectar(); // 2 — explícito: cancela el pendiente
      cerrarSocket(); // el socket nuevo cierra normalmente

      expect(wsCount).toBe(2); // SIN retry inmediato (marcador cancelado)
      jest.advanceTimersByTime(2000);
      expect(wsCount).toBe(3); // el backoff normal sigue funcionando
    });

    test('offline cancela el retry inmediato pendiente sin churn', () => {
      conectar(); // 1
      wsInstance.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // pendiente + watchdog armado
      window.dispatchEvent(new Event('offline')); // limpia pendiente Y watchdog
      expect(jest.getTimerCount()).toBe(0); // sin watchdog colgado contra la red muerta

      cerrarSocket(); // onclose: sin retry inmediato ni timer
      expect(wsCount).toBe(1);
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(1); // cero churn contra la red muerta

      // Higiene: `online` deja el módulo en estado limpio (sinRed=false) para
      // el próximo test — ver convención en 'offline cancela un retry ya
      // programado; online lo reanuda al instante'.
      window.dispatchEvent(new Event('online'));
      expect(wsCount).toBe(2); // reanuda y limpia sinRed
    });

    test('beforeunload cancela el retry inmediato pendiente', () => {
      conectar(); // 1
      wsInstance.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // pendiente
      window.dispatchEvent(new Event('beforeunload')); // kill-switch + limpia pendiente

      cerrarSocket();
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(1);
    });

    test('kill-switch cancela el retry inmediato pendiente (CLOSING)', () => {
      conectar(); // 1
      wsInstance.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // pendiente
      setAutoReconnectEnabled(false); // kill-switch aborta el pendiente

      cerrarSocket();
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(1);
    });

    test('offline durante CONNECTING cierra el socket en handshake y pausa; online reanuda', () => {
      const onClose = jest.fn();
      conectar({ onClose }); // 1 — handshake en curso (readyState CONNECTING)
      expect(wsInstance.readyState).toBe(WebSocket.CONNECTING);

      // Drop de red DURANTE el handshake: `offline` debe cerrar también el
      // socket en CONNECTING (pre-fix sólo cerraba OPEN → quedaba colgado y
      // `online` veía CONNECTING y saltaba la reconexión).
      window.dispatchEvent(new Event('offline'));
      expect(wsInstance.readyState).toBe(WebSocket.CLOSING); // cierre nativo iniciado (síncrono)

      jest.advanceTimersByTime(60000); // CLOSING → CLOSED (asíncrono) → onclose
      expect(wsCount).toBe(1); // cero churn contra la red muerta
      expect(onClose).toHaveBeenCalledTimes(1);

      window.dispatchEvent(new Event('online')); // socket ya CLOSED → retry inmediato
      expect(wsCount).toBe(2);
    });

    test('online durante el cierre asíncrono (CLOSING): onClose externo exactamente una vez y reanuda exactamente una vez', () => {
      const onClose = jest.fn();
      const socketViejo = conectar({ onClose }); // 1 — CONNECTING
      window.dispatchEvent(new Event('offline')); // close() → CLOSING síncrono, CLOSED pendiente
      expect(socketViejo.readyState).toBe(WebSocket.CLOSING);

      // `online` llega ANTES del CLOSED (carrera real del navegador):
      window.dispatchEvent(new Event('online'));
      expect(wsCount).toBe(1); // sin socket duplicado
      expect(jest.getTimerCount()).toBe(2); // cierre asíncrono pendiente + watchdog del CLOSING (no hay retry timer)

      jest.advanceTimersByTime(1); // CLOSING → CLOSED → onclose del socket ACTUAL
      expect(onClose).toHaveBeenCalledTimes(1); // el onClose externo corre UNA vez
      expect(wsCount).toBe(2); // reanuda con UN solo socket nuevo
      expect(getWS()).not.toBe(socketViejo);
      expect(getWS().readyState).toBe(WebSocket.CONNECTING);
      expect(jest.getTimerCount()).toBe(0); // retry inmediato sin timer pendiente
    });

    test('online con socket CLOSED y onclose pendiente: el cierre se procesa UNA vez y reanuda; el onclose tardío es no-op', () => {
      const onClose = jest.fn();
      deferCloseEvent = true; // CLOSED SIN evento close (carrera real)
      const socketViejo = conectar({ onClose }); // 1 — CONNECTING
      socketViejo.close(); // cierre nativo: CLOSING síncrono
      jest.advanceTimersByTime(1); // CLOSING → CLOSED, el evento close queda PENDIENTE
      expect(socketViejo.readyState).toBe(WebSocket.CLOSED);

      // CRÍTICO: `online` llega con el socket nativo ya CLOSED pero su evento
      // close aún sin correr. El cierre debe procesarse AHORA (una sola vez)
      // y la reconexión reanudar al instante.
      window.dispatchEvent(new Event('online'));
      expect(onClose).toHaveBeenCalledTimes(1); // onCloseCallback exactamente UNA vez
      expect(wsCount).toBe(2); // exactamente UN socket de reemplazo
      expect(getWS()).not.toBe(socketViejo);
      expect(getWS().readyState).toBe(WebSocket.CONNECTING);
      expect(jest.getTimerCount()).toBe(0); // reanudación inmediata: sin retry timer

      // El onclose tardío del socket viejo llega DESPUÉS del reemplazo:
      socketViejo.listeners.close();
      expect(onClose).toHaveBeenCalledTimes(1); // sin duplicado del callback
      expect(wsCount).toBe(2); // sin tercer socket
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(2); // sin retry duplicado
    });

    test('kill-switch dentro de onCloseCallback aborta la reconexión del online con socket CLOSED: sin reemplazo ni retry', () => {
      const onClose = jest.fn(() => setAutoReconnectEnabled(false)); // el callback apaga la auto-reconexión
      deferCloseEvent = true; // CLOSED SIN evento close (carrera real)
      const socketViejo = conectar({ onClose }); // 1 — CONNECTING
      socketViejo.close(); // cierre nativo: CLOSING síncrono
      jest.advanceTimersByTime(1); // CLOSING → CLOSED, el evento close queda PENDIENTE
      expect(socketViejo.readyState).toBe(WebSocket.CLOSED);

      // `online` llega con el socket nativo ya CLOSED pero su evento close
      // aún sin correr. El cierre se procesa AHORA y el onCloseCallback
      // desactiva la auto-reconexión (kill-switch): el código debe
      // RE-CHEQUEAR reconectarAuto después del procesamiento y NO crear el
      // socket de reemplazo.
      window.dispatchEvent(new Event('online'));
      expect(onClose).toHaveBeenCalledTimes(1); // onCloseCallback exactamente UNA vez
      expect(wsCount).toBe(1); // sin socket de reemplazo
      expect(getWS()).toBe(socketViejo);
      expect(jest.getTimerCount()).toBe(0); // sin retry timer

      // El onclose tardío del socket viejo llega DESPUÉS del `online`:
      socketViejo.listeners.close();
      expect(onClose).toHaveBeenCalledTimes(1); // sin duplicado del callback
      expect(wsCount).toBe(1); // sigue sin reemplazo
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(1); // y sin retry posterior: el kill-switch gana
    });

    test('beforeunload también cierra un socket en CONNECTING (mismo principio que offline)', () => {
      conectar(); // 1 — CONNECTING
      window.dispatchEvent(new Event('beforeunload'));
      expect(wsInstance.readyState).toBe(WebSocket.CLOSING); // el cierre nativo arrancó
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(1); // kill-switch de unload: sin retry
    });

    test('el onmessage tardío de un socket viejo (stale) no entrega mensajes', () => {
      const handler = jest.fn();
      onMensaje(handler);
      conectar(); // 1
      const socketViejo = wsInstance;
      socketViejo.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // retry inmediato pendiente

      conectar(); // 2 — explícito: reemplaza al socket viejo
      socketViejo.onmessage({ data: JSON.stringify({ tipo: 'stale' }) }); // mensaje del socket viejo

      expect(handler).not.toHaveBeenCalled(); // el guard de identidad lo descarta

      wsInstance.onmessage({ data: JSON.stringify({ tipo: 'vigente' }) }); // el socket nuevo sigue entregando
      expect(handler).toHaveBeenCalledWith({ tipo: 'vigente' });
    });

    test('kill-switch dentro de onCloseCallback aborta el retry inmediato (CLOSING): sin socket de reemplazo', () => {
      const onClose = () => setAutoReconnectEnabled(false); // el callback apaga la auto-reconexión
      conectar({ onClose }); // 1
      wsInstance.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // retry inmediato pendiente (con watchdog)

      // CLOSING → CLOSED → onclose: el procesamiento invoca onCloseCallback,
      // que desactiva la auto-reconexión. El código debe RE-CHEQUEAR
      // reconectarAuto después del callback y NO crear el socket de reemplazo.
      cerrarSocket();
      expect(wsCount).toBe(1); // sin socket de reemplazo
      jest.advanceTimersByTime(60000);
      expect(wsCount).toBe(1); // y sin retry posterior: el kill-switch gana
    });
  });

  describe('watchdog del retry inmediato: CLOSING patológico que jamás emite close', () => {
    test('reemplaza el socket colgado tras el límite conservador: cierre exactamente una vez, un solo reemplazo', () => {
      const onClose = jest.fn();
      const socketViejo = conectar({ onClose }); // 1
      socketViejo.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // marker + watchdog armado
      expect(wsCount).toBe(1); // sin duplicado inmediato
      expect(jest.getTimerCount()).toBe(1); // sólo el watchdog (no hay cierre nativo pendiente)

      // El socket NUNCA emite close (patológico): el watchdog lo reemplaza.
      jest.advanceTimersByTime(RETRY_INMEDIATO_WATCHDOG_MS);
      expect(onClose).toHaveBeenCalledTimes(1); // cierre procesado exactamente una vez
      expect(wsCount).toBe(2); // UN solo socket de reemplazo
      expect(getWS()).not.toBe(socketViejo);
      expect(getWS().readyState).toBe(WebSocket.CONNECTING);
      expect(jest.getTimerCount()).toBe(0); // watchdog consumido
    });

    test('no se dispara antes del límite conservador', () => {
      conectar(); // 1
      wsInstance.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // watchdog armado
      jest.advanceTimersByTime(RETRY_INMEDIATO_WATCHDOG_MS - 1);
      expect(wsCount).toBe(1); // aún dentro de la ventana: sin reemplazo
    });

    test('el cierre normal cancela el watchdog: sin reemplazo espurio', () => {
      conectar(); // 1
      wsInstance.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // watchdog armado
      cerrarSocket(); // cierre normal dentro de la ventana → retry inmediato por onclose
      expect(wsCount).toBe(2);
      jest.advanceTimersByTime(RETRY_INMEDIATO_WATCHDOG_MS);
      expect(wsCount).toBe(2); // el watchdog quedó cancelado: sin segundo reemplazo
    });

    test('el kill-switch cancela el watchdog: el CLOSING patológico respeta el kill-switch', () => {
      conectar(); // 1
      wsInstance.readyState = WebSocket.CLOSING;
      window.dispatchEvent(new Event('online')); // watchdog armado
      setAutoReconnectEnabled(false); // kill-switch aborta marker + watchdog
      expect(jest.getTimerCount()).toBe(0);
      jest.advanceTimersByTime(RETRY_INMEDIATO_WATCHDOG_MS);
      expect(wsCount).toBe(1); // sin reemplazo: kill-switch respetado
    });
  });

  describe('carga inicial offline: navigator.onLine=false (REQ-OFF-01)', () => {
    test('no deja socket CONNECTING "sano" para siempre; online crea UN socket y preserva callbacks y cola', () => {
      jest.isolateModules(() => {
        // La página carga YA sin red (navigator.onLine=false) ANTES de requerir el módulo.
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
        const spy = jest.spyOn(window, 'addEventListener');
        try {
          const fresh = require('../../src/client/shared/socket-client.js');
          const onOpen = jest.fn();
          fresh.conectar({ onOpen });
          expect(fresh.getWS()).toBeNull(); // sin socket CONNECTING contra la red muerta

          fresh.enviar({ tipo: 'alumno_entra', nombre: 'Ana' }); // queda en cola

          // La red vuelve: invocamos el handler `online` del módulo AISLADO
          // directamente. window.dispatchEvent(new Event('online')) también
          // dispararía el listener del módulo original (cargado al inicio del
          // archivo): corriendo SOLO con --testNamePattern ese módulo está en
          // estado inicial (auto-reconexión activa, sinRed=false) y crearía un
          // socket extra — el test depende del orden de los tests anteriores.
          const freshOnlineHandler = spy.mock.calls
            .filter(([ev]) => ev === 'online')
            .map(([, fn]) => fn)
            .pop();
          expect(freshOnlineHandler).toBeDefined();
          freshOnlineHandler();
          expect(fresh.getWS()).not.toBeNull();
          expect(wsCount).toBe(1);

          // El socket nuevo drena la cola y dispara el onOpen registrado offline.
          wsInstance.readyState = WebSocket.OPEN;
          wsInstance.onopen();
          expect(onOpen).toHaveBeenCalledTimes(1);
          expect(JSON.parse(wsInstance.lastSent)).toEqual({ tipo: 'alumno_entra', nombre: 'Ana' });
        } finally {
          Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
          spy.mock.calls.forEach(([ev, fn]) => window.removeEventListener(ev, fn));
          spy.mockRestore();
        }
      });
    });
  });
});
>>>>>>> origin/main
