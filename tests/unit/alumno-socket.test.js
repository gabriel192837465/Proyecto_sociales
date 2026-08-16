/**
 * @jest-environment jsdom
 */
const socketModule = require('../../src/client/features/alumno/socket');
const { state, setMiNombre, setJugadoresSala, setMiRespuesta, setMiPuntaje, setTiempoMax, setReconectarAuto, setWS, setPendienteEnvio, setMiId } = require('../../src/client/features/alumno/state');

function baseHTML() {
  return `
    <div class="screen" id="s-unirse"></div>
    <div class="screen" id="s-espera"></div>
    <div class="screen" id="s-pregunta"></div>
    <div class="screen" id="s-respondio"></div>
    <div class="screen" id="s-resultado"></div>
    <div class="screen" id="s-fin"></div>
    <div id="input-nombre"></div>
    <div id="error-nombre" style="display:none"></div>
    <div id="btn-entrar"></div>
    <div id="nombre-display"></div>
    <div id="lista-espera"></div>
    <div id="cant-espera"></div>
    <div id="pausa-alerta" style="display:none"></div>
    <div id="opciones-container"></div>
    <div id="pregunta-txt"></div>
    <div id="timer-bar" style="width:100%"></div>
    <div id="timer-num"></div>
    <div id="res-icono"></div>
    <div id="res-titulo"></div>
    <div id="res-pts"></div>
    <div id="res-desc"></div>
    <div id="ranking-final"></div>
    <div id="ranking-general-final"></div>
    <div id="mi-historial" style="display:none"></div>
    <div id="mi-historial-lista"></div>
    <button class="opcion-btn" id="op-0">A</button>
    <button class="opcion-btn" id="op-1">B</button>
    <button class="opcion-btn" id="op-2">C</button>
    <button class="opcion-btn" id="op-3">D</button>
    <div class="toast" id="toast"></div>
  `;
}

describe('alumno/socket', () => {
  beforeEach(() => {
    document.body.innerHTML = baseHTML();
    localStorage.clear();
    setMiNombre('');
    setJugadoresSala([]);
    setMiRespuesta(null);
    setMiPuntaje(0);
    setTiempoMax(20);
    setReconectarAuto(true);
    setWS(null);
    setMiId(null);
    global.WebSocket = class MockWS {
      constructor(url) { this.url = url; this.readyState = 1; }
      send(data) { this.lastSent = data; }
      close() {}
    };
    global.WebSocket.OPEN = 1;
  });

  afterEach(() => {
    delete global.WebSocket;
  });

  test('renderListaEspera muestra nombres', () => {
    setJugadoresSala(['Ana', 'Bob']);
    socketModule.renderListaEspera();
    expect(document.getElementById('lista-espera').innerHTML).toContain('Ana');
    expect(document.getElementById('lista-espera').innerHTML).toContain('Bob');
    expect(document.getElementById('cant-espera').textContent).toBe('2');
  });

  test('renderListaEspera no falla sin container', () => {
    document.getElementById('lista-espera').remove();
    expect(() => socketModule.renderListaEspera()).not.toThrow();
  });

  describe('conectar', () => {
    test('sin ws previo crea nueva conexión', () => {
      socketModule.conectar();
      expect(state.ws).toBeTruthy();
    });

    test('ya conectado no reconecta', () => {
      socketModule.conectar();
      const wsBefore = state.ws;
      socketModule.conectar();
      expect(state.ws.readyState).toBe(wsBefore.readyState);
    });

    test('envía alumno_entra con state.miNombre al abrir conexión', () => {
      jest.isolateModules(() => {
        const { state: freshState, setMiNombre: freshSetMiNombre } = require('../../src/client/features/alumno/state');
        const freshSocketModule = require('../../src/client/features/alumno/socket');
        freshSetMiNombre('Carlos');
        freshSocketModule.conectar();
        const wsInstance = freshState.ws;
        expect(wsInstance).toBeTruthy();
        
        const sendSpy = jest.spyOn(wsInstance, 'send');
        if (wsInstance.onopen) {
          wsInstance.onopen();
        }
        expect(sendSpy).toHaveBeenCalledWith(JSON.stringify({ tipo: 'alumno_entra', nombre: 'Carlos' }));
        sendSpy.mockRestore();
      });
    });

    test('no envía alumno_entra al abrir si state.miNombre está vacío', () => {
      jest.isolateModules(() => {
        const { state: freshState, setMiNombre: freshSetMiNombre } = require('../../src/client/features/alumno/state');
        const freshSocketModule = require('../../src/client/features/alumno/socket');
        freshSetMiNombre('');
        freshSocketModule.conectar();
        const wsInstance = freshState.ws;
        expect(wsInstance).toBeTruthy();
        
        const sendSpy = jest.spyOn(wsInstance, 'send');
        if (wsInstance.onopen) {
          wsInstance.onopen();
        }
        expect(sendSpy).not.toHaveBeenCalled();
        sendSpy.mockRestore();
      });
    });

    test('carga inicial offline: el socket creado por `online` se bindea a state.ws y el cleanup lo alcanza', () => {
      jest.isolateModules(() => {
        // La página carga YA sin red: el módulo compartido aislado arranca con
        // sinRed=true y `conectar()` devuelve null → state.ws queda sin socket.
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
        const spy = jest.spyOn(window, 'addEventListener');
        // Mock que registra cada socket creado y captura close() para el cleanup.
        const createdSockets = [];
        global.WebSocket = class MockWS {
          constructor(url) {
            this.url = url;
            this.readyState = 1; // OPEN
            this.close = jest.fn();
            createdSockets.push(this);
          }
          send(data) { this.lastSent = data; }
        };
        global.WebSocket.OPEN = 1;
        global.WebSocket.CONNECTING = 0;
        global.WebSocket.CLOSING = 2;
        global.WebSocket.CLOSED = 3;
        try {
          const { state: freshState } = require('../../src/client/features/alumno/state');
          const freshSocketModule = require('../../src/client/features/alumno/socket');

          freshSocketModule.conectar(); // sinRed → devuelve null, NO setea state.ws
          expect(freshState.ws).toBeNull();
          expect(createdSockets).toHaveLength(0);

          // La red vuelve: el handler `online` del módulo compartido aislado
          // crea el socket (invocado directo: window.dispatchEvent también
          // dispararía el listener del módulo original compartido).
          const onlineHandler = spy.mock.calls
            .filter(([ev]) => ev === 'online')
            .map(([, fn]) => fn)
            .pop();
          expect(onlineHandler).toBeDefined();
          onlineHandler();
          expect(createdSockets).toHaveLength(1);

          // El socket abre: el onOpen del alumno recibe el socket como argumento
          // y lo bindea a state.ws (pre-fix lo ignoraba → state.ws quedaba null
          // y el kill-switch no podía cerrarlo).
          createdSockets[0].onopen();
          expect(freshState.ws).toBe(createdSockets[0]);

          // Kill-switch (REQ-UI-08): el cleanup alcanza el socket vivo — lo
          // cierra y lo desbindea.
          freshSocketModule.manejarMensaje({ tipo: 'auth_rechazada', razon: 'server_shutting_down' });
          expect(createdSockets[0].close).toHaveBeenCalledTimes(1);
          expect(freshState.ws).toBeNull();
        } finally {
          Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
          // Higiene: remover los listeners que el módulo aislado registró en el
          // window compartido del jsdom (ver convención en shared-socket-client).
          spy.mock.calls.forEach(([ev, fn]) => window.removeEventListener(ev, fn));
          spy.mockRestore();
        }
      });
    });
  });

  describe('manejarMensaje — bienvenido', () => {
    test('nuevo jugador en lobby', () => {
      setMiNombre('Ana');
      socketModule.manejarMensaje({ tipo: 'bienvenido', id: 'uuid-1', jugadores: [{ nombre: 'Bob' }], reconectado: false, fase: 'lobby' });
      expect(document.getElementById('s-espera').classList.contains('activa')).toBe(true);
    });

    test('reconexión en fase pregunta sin haber respondido', () => {
      setMiNombre('Ana');
      socketModule.manejarMensaje({ tipo: 'bienvenido', id: 'uuid-1', jugadores: [], reconectado: true, fase: 'pregunta', tiempo: 15, respondioActual: false, opciones: ['A', 'B', 'C', 'D'] });
      expect(state.miRespuesta).toBeNull();
      expect(document.getElementById('s-pregunta').classList.contains('activa')).toBe(true);
    });

    test('reconexión en fase pregunta ya respondió', () => {
      socketModule.manejarMensaje({ tipo: 'bienvenido', id: 'uuid-1', jugadores: [], reconectado: true, fase: 'pregunta', tiempo: 15, respondioActual: true, respuestaAnterior: 1 });
      expect(state.miRespuesta).toBe(1);
      expect(document.getElementById('s-respondio').classList.contains('activa')).toBe(true);
    });

    test('reconexión en fase pregunta con pausa activa', () => {
      document.getElementById('pausa-alerta').style.display = 'none';
      socketModule.manejarMensaje({ tipo: 'bienvenido', id: 'uuid-1', jugadores: [], reconectado: true, fase: 'pregunta', tiempo: 15, respondioActual: false, pausado: true, opciones: ['A', 'B', 'C', 'D'] });
      expect(document.getElementById('pausa-alerta').style.display).toBe('block');
    });

    test('reconexión en fase resultado', () => {
      socketModule.manejarMensaje({ tipo: 'bienvenido', id: 'uuid-1', jugadores: [], reconectado: true, fase: 'resultado', respuestaAnterior: 0, correcta: 0, ranking: [{ id: 'uuid-1', puntaje: 100 }] });
      expect(document.getElementById('s-resultado').classList.contains('activa')).toBe(true);
    });

    test('reconexión en fase fin', () => {
      socketModule.manejarMensaje({ tipo: 'bienvenido', id: 'uuid-1', jugadores: [], reconectado: true, fase: 'fin', ranking: [], rankingGeneral: [] });
      expect(document.getElementById('s-fin').classList.contains('activa')).toBe(true);
    });
  });

  describe('REQ-UI-11: miHistorial en los eventos de FIN', () => {
    const MI_HISTORIAL = [
      { n: 1, pregunta: '¿Pregunta 1?', correctaLetra: 'A', opcionLetra: 'B', opcionTexto: 'Otra', respondio: true, acerto: false }
    ];

    test('bienvenido en fase fin con miHistorial: renderiza Mis respuestas', () => {
      setMiNombre('Ana');
      socketModule.manejarMensaje({
        tipo: 'bienvenido', id: 'uuid-1', jugadores: [], reconectado: true, fase: 'fin',
        ranking: [], rankingGeneral: [], miHistorial: MI_HISTORIAL
      });

      expect(document.getElementById('s-fin').classList.contains('activa')).toBe(true);
      expect(document.getElementById('mi-historial').style.display).toBe('block');
      expect(document.getElementById('mi-historial-lista').innerHTML).toContain('Pregunta 1');
      expect(document.getElementById('mi-historial-lista').innerHTML).toContain('✗ Correcta: A');
    });

    test('fin_juego con miHistorial renderiza el resumen', () => {
      socketModule.manejarMensaje({
        tipo: 'fin_juego', jugadores: [{ id: '1', nombre: 'Ana', puntaje: 200 }],
        rankingGeneral: [], miHistorial: MI_HISTORIAL
      });

      expect(document.getElementById('s-fin').classList.contains('activa')).toBe(true);
      expect(document.getElementById('mi-historial').style.display).toBe('block');
      expect(document.getElementById('mi-historial-lista').innerHTML).toContain('B)');
    });

    test('fin_juego sin miHistorial (servidor viejo): rankings sí, resumen no', () => {
      // El resumen quedó visible de una pantalla anterior: el handler debe ocultarlo.
      document.getElementById('mi-historial').style.display = 'block';
      document.getElementById('mi-historial-lista').innerHTML = '<div>viejo</div>';

      socketModule.manejarMensaje({
        tipo: 'fin_juego', jugadores: [{ id: '1', nombre: 'Ana', puntaje: 200 }], rankingGeneral: []
      });

      expect(document.getElementById('s-fin').classList.contains('activa')).toBe(true);
      expect(document.getElementById('ranking-final').innerHTML).toContain('Ana');
      expect(document.getElementById('mi-historial').style.display).toBe('none');
      expect(document.getElementById('mi-historial-lista').innerHTML).toBe('');
    });

    test('bienvenido en fase fin sin miHistorial: rankings visibles sin resumen', () => {
      document.getElementById('mi-historial').style.display = 'block';
      document.getElementById('mi-historial-lista').innerHTML = '<div>viejo-item</div>';

      socketModule.manejarMensaje({
        tipo: 'bienvenido', id: 'uuid-1', jugadores: [], reconectado: true, fase: 'fin',
        ranking: [], rankingGeneral: []
      });

      expect(document.getElementById('s-fin').classList.contains('activa')).toBe(true);
      expect(document.getElementById('mi-historial').style.display).toBe('none');
      expect(document.getElementById('mi-historial-lista').innerHTML).toBe('');
    });
  });

  describe('manejarMensaje — jugadores', () => {
    test('jugador_unido_alumno agrega a sala', () => {
      setJugadoresSala(['Ana']);
      socketModule.manejarMensaje({ tipo: 'jugador_unido_alumno', nombre: 'Bob' });
      expect(state.jugadoresSala).toContain('Bob');
    });

    test('jugador_unido_alumno ignora duplicado', () => {
      setJugadoresSala(['Ana']);
      socketModule.manejarMensaje({ tipo: 'jugador_unido_alumno', nombre: 'Ana' });
      expect(state.jugadoresSala).toEqual(['Ana']);
    });

    test('jugador_salio_alumno remueve', () => {
      setJugadoresSala(['Ana', 'Bob']);
      socketModule.manejarMensaje({ tipo: 'jugador_salio_alumno', nombre: 'Ana' });
      expect(state.jugadoresSala).toEqual(['Bob']);
    });

    test('jugador_desconectado_alumno remueve', () => {
      setJugadoresSala(['Ana', 'Bob']);
      socketModule.manejarMensaje({ tipo: 'jugador_desconectado_alumno', nombre: 'Bob' });
      expect(state.jugadoresSala).toEqual(['Ana']);
    });

    test('jugador_reconectado_alumno agrega', () => {
      socketModule.manejarMensaje({ tipo: 'jugador_reconectado_alumno', nombre: 'Carlos' });
      expect(state.jugadoresSala).toContain('Carlos');
    });
  });

  describe('manejarMensaje — juego', () => {
    test('nueva_pregunta resetea y muestra', () => {
      setMiRespuesta(1);
      socketModule.manejarMensaje({ tipo: 'nueva_pregunta', pregunta: '¿?', opciones: ['A', 'B', 'C', 'D'], tiempo: 20 });
      expect(state.miRespuesta).toBeNull();
      expect(document.getElementById('pregunta-txt').textContent).toBe('¿?');
    });

    test('tick actualiza timer', () => {
      setTiempoMax(20);
      socketModule.manejarMensaje({ tipo: 'tick', tiempo: 10 });
      expect(document.getElementById('timer-num').textContent).toBe('10s');
    });

    test('juego_pausado bloquea botones', () => {
      socketModule.manejarMensaje({ tipo: 'juego_pausado' });
      expect(document.getElementById('pausa-alerta').style.display).toBe('block');
      document.querySelectorAll('.opcion-btn').forEach(btn => expect(btn.disabled).toBe(true));
    });

    test('juego_reanudado habilita si no respondió', () => {
      setMiRespuesta(null);
      socketModule.manejarMensaje({ tipo: 'juego_reanudado', tiempo: 15 });
      expect(document.getElementById('pausa-alerta').style.display).toBe('none');
      expect(document.querySelectorAll('.opcion-btn')[0].disabled).toBe(false);
    });

    test('juego_reanudado no habilita si ya respondió', () => {
      setMiRespuesta(0);
      socketModule.manejarMensaje({ tipo: 'juego_reanudado', tiempo: 15 });
      expect(document.getElementById('pausa-alerta').style.display).toBe('none');
    });

    test('resultado muestra pantalla', () => {
      socketModule.manejarMensaje({ tipo: 'resultado', correcta: 0, ranking: [{ id: 'test', puntaje: 100 }] });
      expect(document.getElementById('s-resultado').classList.contains('activa')).toBe(true);
    });

    test('juego_reiniciado resetea estado', () => {
      state.miPuntaje = 100;
      setMiRespuesta(1);
      socketModule.manejarMensaje({ tipo: 'juego_reiniciado', tiempoPorPregunta: 30 });
      expect(state.miPuntaje).toBe(0);
      expect(state.miRespuesta).toBeNull();
      expect(state.TIEMPO_MAX).toBe(30);
      expect(document.getElementById('s-espera').classList.contains('activa')).toBe(true);
    });

    test('fin_juego muestra ranking', () => {
      socketModule.manejarMensaje({ tipo: 'fin_juego', jugadores: [{ id: '1', nombre: 'Ana', puntaje: 200 }], rankingGeneral: [] });
      expect(document.getElementById('s-fin').classList.contains('activa')).toBe(true);
    });

    test('volver_a_lobby resetea', () => {
      state.miPuntaje = 100;
      setMiRespuesta(1);
      socketModule.manejarMensaje({ tipo: 'volver_a_lobby' });
      expect(state.miPuntaje).toBe(0);
      expect(state.miRespuesta).toBeNull();
      expect(document.getElementById('s-espera').classList.contains('activa')).toBe(true);
    });
  });

  describe('manejarMensaje — error_nombre', () => {
    test('muestra error y cierra ws', () => {
      const closeSpy = jest.fn();
      setWS({ close: closeSpy });
      socketModule.manejarMensaje({ tipo: 'error_nombre', msg: 'Nombre en uso' });
      expect(document.getElementById('error-nombre').style.display).toBe('block');
      expect(document.getElementById('btn-entrar').disabled).toBe(false);
      expect(closeSpy).toHaveBeenCalled();
    });

    test('sin miId deshabilita la auto-reconexión compartida (REQ-UI-08)', () => {
      const shared = require('../../src/client/shared/socket-client');
      const spy = jest.spyOn(shared, 'setAutoReconnectEnabled');
      const closeSpy = jest.fn();
      setWS({ close: closeSpy });

      socketModule.manejarMensaje({ tipo: 'error_nombre', msg: 'Ese nombre ya está en uso. Probá con otro.' });

      expect(spy).toHaveBeenCalledWith(false);
      expect(closeSpy).toHaveBeenCalled();
      spy.mockRestore();
    });

    test('con miId solo muestra toast y NO deshabilita la reconexión (REQ-UI-08)', () => {
      const shared = require('../../src/client/shared/socket-client');
      const spy = jest.spyOn(shared, 'setAutoReconnectEnabled');
      setMiId('uuid-1');
      const closeSpy = jest.fn();
      setWS({ close: closeSpy });

      socketModule.manejarMensaje({ tipo: 'error_nombre', msg: 'Ese nombre ya está en uso. Probá con otro.' });

      expect(spy).not.toHaveBeenCalled();
      expect(closeSpy).not.toHaveBeenCalled();
      expect(document.getElementById('toast').textContent).toContain('ya está en uso');
      spy.mockRestore();
    });
  });

  describe('manejarMensaje — respuesta_rechazada', () => {
    let warnSpy;
    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
      warnSpy.mockRestore();
    });

    test('opcion_invalida re-habilita botones, vuelve a s-pregunta, muestra toast', () => {
      setMiRespuesta(0);
      setPantallaForTest('s-respondio');
      setPendienteEnvio(true);
      document.getElementById('op-0').classList.add('seleccionada');
      document.querySelectorAll('.opcion-btn').forEach(b => b.disabled = true);

      socketModule.manejarMensaje({ tipo: 'respuesta_rechazada', razon: 'opcion_invalida' });

      const toast = document.getElementById('toast');
      expect(toast.className).toContain('show');
      expect(toast.className).toContain('err');
      expect(toast.textContent).toContain('Opción inválida');
      expect(toast.textContent).toContain('Probá');
      document.querySelectorAll('.opcion-btn').forEach(b => expect(b.disabled).toBe(false));
      expect(document.getElementById('op-0').classList.contains('seleccionada')).toBe(false);
      expect(state.miRespuesta).toBeNull();
      expect(document.getElementById('s-pregunta').classList.contains('activa')).toBe(true);
    });

    test('ya_respondio muestra toast sin re-habilitar botones', () => {
      setMiRespuesta(2);
      setPantallaForTest('s-respondio');
      document.querySelectorAll('.opcion-btn').forEach(b => b.disabled = true);

      socketModule.manejarMensaje({ tipo: 'respuesta_rechazada', razon: 'ya_respondio' });

      const toast = document.getElementById('toast');
      expect(toast.className).toContain('show');
      expect(toast.className).toContain('err');
      expect(toast.textContent).toContain('Ya enviaste');
      document.querySelectorAll('.opcion-btn').forEach(b => expect(b.disabled).toBe(true));
      expect(state.miRespuesta).toBe(2);
    });

    test('pausado muestra toast y mantiene botones en su estado previo (deshabilitados)', () => {
      // Estado realista: juego_pausado ya deshabilitó los botones.
      setMiRespuesta(null);
      setPantallaForTest('s-pregunta');
      document.querySelectorAll('.opcion-btn').forEach(b => b.disabled = true);

      socketModule.manejarMensaje({ tipo: 'respuesta_rechazada', razon: 'pausado' });

      const toast = document.getElementById('toast');
      expect(toast.textContent).toContain('pausado');
      // El rechazo no debe re-habilitar los botones.
      document.querySelectorAll('.opcion-btn').forEach(b => expect(b.disabled).toBe(true));
    });

    test('fase_invalida muestra toast sin re-habilitar botones', () => {
      setPantallaForTest('s-respondio');
      socketModule.manejarMensaje({ tipo: 'respuesta_rechazada', razon: 'fase_invalida' });

      const toast = document.getElementById('toast');
      expect(toast.textContent).toContain('terminó');
      expect(toast.className).toContain('err');
    });

    test('no_sesion muestra toast y agenda reload en 3s', () => {
      jest.useFakeTimers();
      // jsdom hace window.location no-mockeable. Verificamos que el setTimeout
      // se haya programado con 3000ms (el reload en sí mismo es no-op en jsdom).
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      socketModule.manejarMensaje({ tipo: 'respuesta_rechazada', razon: 'no_sesion' });

      const toast = document.getElementById('toast');
      expect(toast.textContent).toContain('Recargando');
      expect(toast.className).toContain('err');

      const reloadScheduled = setTimeoutSpy.mock.calls.some(([, delay]) => delay === 3000);
      expect(reloadScheduled).toBe(true);

      setTimeoutSpy.mockRestore();
      jest.useRealTimers();
    });

    test('razon desconocida no lanza error y registra warn', () => {
      expect(() =>
        socketModule.manejarMensaje({ tipo: 'respuesta_rechazada', razon: 'inventada' })
      ).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('manejarMensaje — respuesta_ok', () => {
    test('limpia el flag pendienteEnvio', () => {
      setPendienteEnvio(true);
      socketModule.manejarMensaje({ tipo: 'respuesta_ok' });
      expect(state.pendienteEnvio).toBe(false);
    });

    test('no cambia de pantalla', () => {
      setPantallaForTest('s-respondio');
      socketModule.manejarMensaje({ tipo: 'respuesta_ok' });
      expect(document.getElementById('s-respondio').classList.contains('activa')).toBe(true);
    });
  });

  describe('manejarMensaje — nombre_cambiado', () => {
    test('self-rename reemplaza la entrada del jugador en jugadoresSala', () => {
      // El alumno está en su propia lista (jugadoresOnline incluye al self).
      setMiNombre('Juan');
      setJugadoresSala(['Ana', 'Juan', 'Luis']);
      socketModule.renderListaEspera();

      socketModule.manejarMensaje({ tipo: 'nombre_cambiado', oldNombre: 'Juan', nombre: 'Juancito' });

      expect(state.miNombre).toBe('Juancito');
      expect(state.jugadoresSala).toEqual(['Ana', 'Juancito', 'Luis']);
      expect(document.getElementById('nombre-display').textContent).toBe('Juancito');
      expect(localStorage.getItem('historia_quiz_nombre')).toBe('Juancito');
      // DOM re-renderizado
      const html = document.getElementById('lista-espera').innerHTML;
      expect(html).toContain('Juancito');
      expect(html).not.toContain('>Juan<');
    });

    test('self-rename defensivo: no rompe si oldNombre no está en jugadoresSala', () => {
      // El setJugadoresSala map no encuentra oldNombre → la lista queda igual.
      setMiNombre('Ana');
      setJugadoresSala(['Ana', 'Bob']);
      socketModule.renderListaEspera();

      socketModule.manejarMensaje({ tipo: 'nombre_cambiado', oldNombre: 'Carlos', nombre: 'Carlitos' });

      // miNombre y display se actualizan igual
      expect(state.miNombre).toBe('Carlitos');
      expect(document.getElementById('nombre-display').textContent).toBe('Carlitos');
      expect(localStorage.getItem('historia_quiz_nombre')).toBe('Carlitos');
      // La lista no se altera (no había coincidencia)
      expect(state.jugadoresSala).toEqual(['Ana', 'Bob']);
    });
  });

  describe('R1-001: client-side session token management', () => {
    let mockWSInstance;

    beforeEach(() => {
      // Initialize websocket via conectar to ensure both state.ws and socket-client internal references are set
      socketModule.conectar();
      mockWSInstance = state.ws;
      jest.spyOn(mockWSInstance, 'send');
      jest.spyOn(mockWSInstance, 'close');
      mockWSInstance.send.mockClear();
      mockWSInstance.close.mockClear();
      sessionStorage.clear();
      const { setSessionToken } = require('../../src/client/features/alumno/state');
      setSessionToken('');
    });

    test('bienvenido stores token in state and sessionStorage', () => {
      socketModule.manejarMensaje({
        tipo: 'bienvenido',
        id: 'uuid-123',
        token: 'test-token-xyz',
        jugadores: [],
        reconectado: false
      });

      const { state: freshState } = require('../../src/client/features/alumno/state');
      expect(freshState.sessionToken).toBe('test-token-xyz');
      expect(sessionStorage.getItem('historia_quiz_token')).toBe('test-token-xyz');
    });

    test('nueva_pregunta updates token in state and sessionStorage when provided', () => {
      const { state: freshState, setMiId } = require('../../src/client/features/alumno/state');
      setMiId('uuid-123');

      socketModule.manejarMensaje({
        tipo: 'nueva_pregunta',
        pregunta: '¿?',
        opciones: ['A', 'B'],
        tiempo: 20,
        tokensPorAlumno: {
          'uuid-123': 'new-rotated-token'
        }
      });

      expect(freshState.sessionToken).toBe('new-rotated-token');
      expect(sessionStorage.getItem('historia_quiz_token')).toBe('new-rotated-token');
    });

    test('enviar includes session token in the outgoing message', () => {
      const { setSessionToken } = require('../../src/client/features/alumno/state');
      setSessionToken('my-active-token');

      socketModule.enviar('respuesta', { opcion: 2 });

      expect(mockWSInstance.send).toHaveBeenCalled();
      const sentPayload = JSON.parse(mockWSInstance.send.mock.calls[0][0]);
      expect(sentPayload.tipo).toBe('respuesta');
      expect(sentPayload.opcion).toBe(2);
      expect(sentPayload.token).toBe('my-active-token');
    });

    test('auth_rechazada token_rotado updates token and replays last message', () => {
      const { setSessionToken, state: freshState } = require('../../src/client/features/alumno/state');
      setSessionToken('old-token');

      socketModule.enviar('respuesta', { opcion: 3 });
      expect(mockWSInstance.send).toHaveBeenCalledTimes(1);

      socketModule.manejarMensaje({
        tipo: 'auth_rechazada',
        razon: 'token_rotado',
        token: 'fresh-reauth-token'
      });

      expect(freshState.sessionToken).toBe('fresh-reauth-token');
      expect(sessionStorage.getItem('historia_quiz_token')).toBe('fresh-reauth-token');

      expect(mockWSInstance.send).toHaveBeenCalledTimes(2);
      const replayedPayload = JSON.parse(mockWSInstance.send.mock.calls[1][0]);
      expect(replayedPayload.tipo).toBe('respuesta');
      expect(replayedPayload.opcion).toBe(3);
      expect(replayedPayload.token).toBe('fresh-reauth-token');
    });

    test('auth_rechazada server_shutting_down disables shared auto reconnect and closes socket', () => {
      const { state: freshState } = require('../../src/client/features/alumno/state');
      const shared = require('../../src/client/shared/socket-client');
      const spy = jest.spyOn(shared, 'setAutoReconnectEnabled');

      socketModule.manejarMensaje({
        tipo: 'auth_rechazada',
        razon: 'server_shutting_down'
      });

      expect(spy).toHaveBeenCalledWith(false);
      expect(mockWSInstance.close).toHaveBeenCalled();
      expect(freshState.ws).toBeNull();
      spy.mockRestore();
    });

    test('auth_rechazada token_rotado sin token → máximo 3 intentos, pendiente sin reenviar (REQ-UI-09)', () => {
      const { setSessionToken } = require('../../src/client/features/alumno/state');
      setSessionToken('old-token');
      setMiId('uuid-1');
      // D3: el contador interno se resetea en bienvenido
      socketModule.manejarMensaje({ tipo: 'bienvenido', id: 'uuid-1', jugadores: [], reconectado: false });

      socketModule.enviar('respuesta', { opcion: 2 });
      expect(mockWSInstance.send).toHaveBeenCalledTimes(1);

      // Sin token en la rechazo: reintentos acotados
      socketModule.manejarMensaje({ tipo: 'auth_rechazada', razon: 'token_rotado' });
      expect(mockWSInstance.send).toHaveBeenCalledTimes(2); // reintento 1
      socketModule.manejarMensaje({ tipo: 'auth_rechazada', razon: 'token_rotado' });
      expect(mockWSInstance.send).toHaveBeenCalledTimes(3); // reintento 2
      socketModule.manejarMensaje({ tipo: 'auth_rechazada', razon: 'token_rotado' });
      expect(mockWSInstance.send).toHaveBeenCalledTimes(3); // se detiene: pendiente sin enviar
    });
  });
});

function setPantallaForTest(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('activa'));
  const el = document.getElementById(id);
  if (el) el.classList.add('activa');
}
