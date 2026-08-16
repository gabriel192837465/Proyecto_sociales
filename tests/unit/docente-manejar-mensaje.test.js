/**
 * @jest-environment jsdom
 */
const { manejarMensaje } = require('../../src/client/features/docente/manejar-mensaje.js');
const { S } = require('../../src/client/features/docente/state.js');

describe('docente/manejar-mensaje', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="qrcode"></div>
      <div id="qr-url-txt"></div>
      <div id="count-jugadores"></div>
      <div id="lista-jugadores"></div>
      <div id="pantalla-lobby"><p></p></div>
      <div id="pantalla-pregunta"></div>
      <div id="pantalla-resultado"></div>
      <div id="pantalla-fin"></div>
      <div id="btn-siguiente"></div>
      <div id="btn-forzar"></div>
      <div id="btn-pausa"></div>
      <div id="error-box" style="display:none"></div>
      <div id="ranking-lista"></div>
      <div id="ranking-general-lista"></div>
      <div id="resp-estado-alumnos"></div>
      <div id="timer-bar"></div>
      <div id="timer-num"></div>
      <div id="pregunta-txt"></div>
      <div id="epoca-tag"></div>
      <div id="pregunta-num"></div>
      <div id="opciones-container"></div>
      <div id="resultado-contenido"></div>
      <div id="podio-fin"></div>
      <div class="overlay" id="modal-auth" style="display:none"><div id="auth-error-box"></div></div>
    `;
    S.jugadoresMap = {};
    S.jugadoresOnline = {};
    S.totalJugadores = 0;
    S.idsRespondieronActual = [];
    S.pantallaActual = "lobby";
    S.TIEMPO_MAX = 20;
    S.ws = null;
    localStorage.clear();
    global.QRCode = class { constructor() {} };
  });

  test('estado_inicial lobby', () => {
    manejarMensaje({ tipo: 'estado_inicial', fase: 'lobby', jugadores: [{ id: '1', nombre: 'Ana', online: true }], rankingGeneral: [] });
    expect(document.getElementById('pantalla-lobby').style.display).toBe('block');
    expect(S.totalJugadores).toBe(1);
  });

  test('estado_inicial lobby sin jugadores', () => {
    manejarMensaje({ tipo: 'estado_inicial', fase: 'lobby', jugadores: [], rankingGeneral: [] });
    expect(document.getElementById('count-jugadores').textContent).toBe('0');
  });

  test('estado_inicial pregunta', () => {
    manejarMensaje({ tipo: 'estado_inicial', fase: 'pregunta', pregunta: { idx: 0, total: 5, pregunta: '¿?', opciones: ['A','B','C','D'], tiempo: 20 }, tiempoRestante: 15, respuestasActuales: {} });
    expect(S.pantallaActual).toBe('pregunta');
  });

  test('estado_inicial resultado', () => {
    manejarMensaje({ tipo: 'estado_inicial', fase: 'resultado', resultado: { correcta: 0, respuestas: {} }, jugadores: [], rankingGeneral: [] });
    expect(S.pantallaActual).toBe('resultado');
  });

  test('jugador_unido', () => {
    S.pantallaActual = 'lobby';
    manejarMensaje({ tipo: 'jugador_unido', id: '1', nombre: 'Ana', jugadores: [], rankingGeneral: [] });
    expect(S.jugadoresMap['1']).toBe('Ana');
    expect(S.totalJugadores).toBe(1);
    expect(document.getElementById('chip-1').textContent).toBe('Ana');
  });

  test('jugador_reconectado en lobby', () => {
    S.pantallaActual = 'lobby';
    manejarMensaje({ tipo: 'jugador_reconectado', id: '1', nombre: 'Ana', jugadores: [], rankingGeneral: [] });
    expect(S.jugadoresOnline['1']).toBe(true);
    expect(document.getElementById('chip-1')).toBeTruthy();
  });

  test('jugador_reconectado no duplica chip', () => {
    document.getElementById('lista-jugadores').innerHTML = '<div class="jugador-chip" id="chip-1">Ana</div>';
    S.pantallaActual = 'lobby';
    manejarMensaje({ tipo: 'jugador_reconectado', id: '1', nombre: 'Ana', jugadores: [], rankingGeneral: [] });
    expect(document.querySelectorAll('#lista-jugadores .jugador-chip').length).toBe(1);
  });

  test('jugador_desconectado', () => {
    S.jugadoresOnline['1'] = true;
    manejarMensaje({ tipo: 'jugador_desconectado', id: '1', jugadores: [], rankingGeneral: [] });
    expect(S.jugadoresOnline['1']).toBe(false);
  });

  test('jugador_salio', () => {
    S.jugadoresMap['1'] = 'Ana';
    S.jugadoresOnline['1'] = true;
    document.getElementById('lista-jugadores').innerHTML = '<div class="jugador-chip" id="chip-1">Ana</div>';
    manejarMensaje({ tipo: 'jugador_salio', id: '1', jugadores: [], rankingGeneral: [] });
    expect(S.jugadoresMap['1']).toBeUndefined();
    expect(document.getElementById('chip-1')).toBeNull();
  });

  test('nueva_pregunta', () => {
    manejarMensaje({ tipo: 'nueva_pregunta', idx: 0, total: 3, pregunta: '¿Test?', opciones: ['A','B','C','D'], epoca: 'Independencia', tiempo: 20 });
    expect(S.TIEMPO_MAX).toBe(20);
    expect(document.getElementById('pregunta-txt').textContent).toBe('¿Test?');
  });

  test('tick', () => {
    manejarMensaje({ tipo: 'tick', tiempo: 10 });
    expect(document.getElementById('timer-bar').style.width).toBeTruthy();
  });

  test('juego_pausado', () => {
    manejarMensaje({ tipo: 'juego_pausado' });
    expect(document.getElementById('btn-pausa').textContent).toContain('Reanudar');
  });

  test('juego_reanudado', () => {
    manejarMensaje({ tipo: 'juego_reanudado', tiempo: 18 });
    expect(document.getElementById('btn-pausa').textContent).toContain('Pausar');
  });

  test('progreso_respuestas', () => {
    manejarMensaje({ tipo: 'progreso_respuestas', respondieronIds: ['1', '2'] });
    expect(S.idsRespondieronActual).toEqual(['1', '2']);
  });

  test('resultado', () => {
    manejarMensaje({ tipo: 'resultado', correcta: 0, respuestas: {}, ranking: [], rankingGeneral: [] });
    expect(S.pantallaActual).toBe('resultado');
  });

  test('juego_reiniciado setea tiempo', () => {
    S.TIEMPO_MAX = 10;
    manejarMensaje({ tipo: 'juego_reiniciado', tiempoPorPregunta: 30, totalPreguntas: 5, bancoNombre: 'Test', jugadores: [], rankingGeneral: [] });
    expect(S.TIEMPO_MAX).toBe(30);
  });

  test('fin_juego', () => {
    manejarMensaje({ tipo: 'fin_juego', ranking: [], rankingGeneral: [] });
    expect(S.pantallaActual).toBe('fin');
  });

  test('volver_a_lobby', () => {
    S.pantallaActual = 'pregunta';
    manejarMensaje({ tipo: 'volver_a_lobby', jugadores: [{ id: '1', nombre: 'Ana' }], rankingGeneral: [] });
    expect(S.pantallaActual).toBe('lobby');
    expect(S.totalJugadores).toBe(1);
  });

  test('ranking_general_reiniciado', () => {
    manejarMensaje({ tipo: 'ranking_general_reiniciado', rankingGeneral: [] });
  });

  test('error muestra mensaje', () => {
    manejarMensaje({ tipo: 'error', msg: 'Error de prueba' });
    expect(document.getElementById('error-box').textContent).toContain('Error de prueba');
  });

  test('error con clave abre modal', () => {
    S.token = 'old';
    localStorage.setItem('admin_token', 'old');
    manejarMensaje({ tipo: 'error', msg: 'Clave incorrecta' });
    expect(localStorage.getItem('admin_token')).toBeNull();
    expect(document.getElementById('modal-auth').style.display).toBe('flex');
  });

  test('error sin propiedad msg no crashea', () => {
    expect(() => {
      manejarMensaje({ tipo: 'error' });
      manejarMensaje({ tipo: 'error', msg: null });
      manejarMensaje({ tipo: 'error', msg: undefined });
    }).not.toThrow();
  });

  test('jugador_desconectado en lobby remueve chip', () => {
    S.pantallaActual = 'lobby';
    S.jugadoresOnline['1'] = true;
    document.getElementById('lista-jugadores').innerHTML = '<div class="jugador-chip" id="chip-1">Ana</div>';
    manejarMensaje({ tipo: 'jugador_desconectado', id: '1', jugadores: [], rankingGeneral: [] });
    expect(document.getElementById('chip-1')).toBeNull();
    expect(S.totalJugadores).toBe(0);
  });

  test('jugador_salio sin chip no falla', () => {
    S.jugadoresMap['1'] = 'Ana';
    manejarMensaje({ tipo: 'jugador_salio', id: '1', jugadores: [], rankingGeneral: [] });
    expect(S.jugadoresMap['1']).toBeUndefined();
  });

  test('jugador_unido con jugadores actualiza el panel de ranking de la ronda (REQ-DUI-02)', () => {
    S.pantallaActual = 'lobby';
    manejarMensaje({
      tipo: 'jugador_unido',
      id: '1',
      nombre: 'Ana',
      jugadores: [{ id: '1', nombre: 'Ana', puntaje: 5 }],
      rankingGeneral: [],
    });
    const panel = document.getElementById('ranking-lista');
    expect(panel.textContent).toContain('Ana');
    expect(panel.textContent).toContain('5');
  });

  test('evento sin jugadores NO limpia el panel (REQ-DUI-02)', () => {
    S.pantallaActual = 'lobby';
    // Primero el panel se renderiza con datos reales
    manejarMensaje({
      tipo: 'jugador_reconectado',
      id: '1',
      nombre: 'Ana',
      jugadores: [{ id: '1', nombre: 'Ana', puntaje: 5 }],
      rankingGeneral: [],
    });
    expect(document.getElementById('ranking-lista').textContent).toContain('Ana');

    // Evento posterior SIN `jugadores` → el panel conserva su contenido
    manejarMensaje({ tipo: 'jugador_reconectado', id: '1', nombre: 'Ana' });
    expect(document.getElementById('ranking-lista').textContent).toContain('Ana');
    expect(document.getElementById('ranking-lista').textContent).not.toContain('Sin jugadores');
  });

  test('estado_inicial pregunta pausada', () => {
    manejarMensaje({ tipo: 'estado_inicial', fase: 'pregunta', pregunta: { idx: 0, total: 5, pregunta: '¿?', opciones: ['A','B','C','D'], tiempo: 20 }, tiempoRestante: 10, respuestasActuales: {}, pausado: true });
    expect(document.getElementById('btn-pausa').textContent).toContain('Reanudar');
  });
});
