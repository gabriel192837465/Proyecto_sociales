/**
 * @jest-environment jsdom
 */
const { esc } = require('../../src/client/shared/dom.js');
const { S, syncJugadoresMap } = require('../../src/client/features/docente/state.js');

describe('docente.js', () => {
  beforeAll(() => {
    document.body.innerHTML = `
      <div id="estado-cx"></div>
      <select id="banco-select"></select>
      <div id="banco-meta"></div>
      <div id="error-box"></div>
      <div id="count-jugadores"></div>
      <div id="lista-jugadores"></div>
      <div id="pantalla-lobby"></div>
      <div id="pantalla-pregunta"></div>
      <div id="pantalla-resultado"></div>
      <div id="pantalla-fin"></div>
      <div id="qrcode"></div>
      <div id="qr-url-txt"></div>
      <div id="ranking-lista"></div>
      <div id="ranking-general-lista"></div>
      <div id="resp-estado-alumnos"></div>
      <div id="timer-bar"></div>
      <div id="timer-num"></div>
      <div id="pregunta-txt"></div>
      <div id="epoca-tag"></div>
      <div id="pregunta-num"></div>
      <div id="opciones-container"></div>
      <div id="btn-siguiente"></div>
      <div id="btn-forzar"></div>
      <div id="btn-pausa"></div>
      <div id="pausa-alerta"></div>
      <div id="resultado-contenido"></div>
      <div id="podio-fin"></div>
      <div class="overlay" id="modal-auth" style="display:none">
        <div><input type="password" id="auth-password"><div id="auth-error-box"></div></div>
      </div>
    `;
    const store = {};
    global.localStorage = {
      getItem: jest.fn((k) => store[k] ?? null),
      setItem: jest.fn((k, v) => { store[k] = String(v); }),
      removeItem: jest.fn((k) => { delete store[k]; }),
      clear: jest.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
      get length() { return Object.keys(store).length; },
      key: jest.fn((i) => Object.keys(store)[i] ?? null),
    };
  });

  test('esc escapa caracteres HTML', () => {
    expect(esc('<b>bold</b>')).toBe('&lt;b&gt;bold&lt;/b&gt;');
    expect(esc('"hello"')).toBe('&quot;hello&quot;');
    expect(esc(null)).toBe('');
  });

  test('syncJugadoresMap actualiza mapas', () => {
    syncJugadoresMap([
      { id: '1', nombre: 'Ana', online: true },
      { id: '2', nombre: 'Bob', online: false }
    ]);
    expect(S.jugadoresMap['1']).toBe('Ana');
    expect(S.jugadoresMap['2']).toBe('Bob');
    expect(S.jugadoresOnline['1']).toBe(true);
    expect(S.jugadoresOnline['2']).toBe(false);
  });
});
