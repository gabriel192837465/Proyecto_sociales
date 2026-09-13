<<<<<<< HEAD
/**
 * @jest-environment jsdom
 */
const { esc } = require('../../src/client/shared/dom.js');
const { jugadoresSala, setJugadoresSala } = require('../../src/client/features/alumno/state.js');
const { renderListaEspera } = require('../../src/client/features/alumno/socket.js');
const { setPantalla } = require('../../src/client/features/alumno/views.js');

describe('alumno.js', () => {
  beforeAll(() => {
    document.body.innerHTML = `
      <div class="screen" id="s-unirse"></div>
      <div class="screen" id="s-espera"></div>
      <div class="screen" id="s-pregunta"></div>
      <div class="screen" id="s-respondio"></div>
      <div class="screen" id="s-resultado"></div>
      <div class="screen" id="s-fin"></div>
      <div id="input-nombre"></div>
      <div id="error-nombre"></div>
      <div id="btn-entrar"></div>
      <div id="nombre-display"></div>
      <div id="lista-espera"></div>
      <div id="cant-espera"></div>
      <div id="pausa-alerta"></div>
      <div id="pregunta-txt"></div>
      <div id="opciones-container"></div>
      <div id="timer-bar"></div>
      <div id="timer-num"></div>
      <div id="res-icono"></div>
      <div id="res-titulo"></div>
      <div id="res-pts"></div>
      <div id="res-desc"></div>
      <div id="ranking-final"></div>
      <div id="ranking-general-final"></div>
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
    expect(esc('<br>')).toBe('&lt;br&gt;');
    expect(esc("it's")).toBe('it&#039;s');
  });

  test('renderListaEspera renderiza nombres', () => {
    setJugadoresSala(['Ana', 'Bob']);
    renderListaEspera();
    const container = document.getElementById('lista-espera');
    expect(container.innerHTML).toContain('Ana');
    expect(container.innerHTML).toContain('Bob');
    expect(document.getElementById('cant-espera').textContent).toBe('2');
  });

  test('setPantalla cambia pantalla activa', () => {
    setPantalla('s-espera');
    expect(document.getElementById('s-espera').classList.contains('activa')).toBe(true);
    expect(document.getElementById('s-unirse').classList.contains('activa')).toBe(false);
  });
});
=======
/**
 * @jest-environment jsdom
 */
const { esc } = require('../../src/client/shared/dom.js');
const { jugadoresSala, setJugadoresSala } = require('../../src/client/features/alumno/state.js');
const { renderListaEspera } = require('../../src/client/features/alumno/socket.js');
const { setPantalla } = require('../../src/client/features/alumno/views.js');

describe('alumno.js', () => {
  beforeAll(() => {
    document.body.innerHTML = `
      <div class="screen" id="s-unirse"></div>
      <div class="screen" id="s-espera"></div>
      <div class="screen" id="s-pregunta"></div>
      <div class="screen" id="s-respondio"></div>
      <div class="screen" id="s-resultado"></div>
      <div class="screen" id="s-fin"></div>
      <div id="input-nombre"></div>
      <div id="error-nombre"></div>
      <div id="btn-entrar"></div>
      <div id="nombre-display"></div>
      <div id="lista-espera"></div>
      <div id="cant-espera"></div>
      <div id="pausa-alerta"></div>
      <div id="pregunta-txt"></div>
      <div id="opciones-container"></div>
      <div id="timer-bar"></div>
      <div id="timer-num"></div>
      <div id="res-icono"></div>
      <div id="res-titulo"></div>
      <div id="res-pts"></div>
      <div id="res-desc"></div>
      <div id="ranking-final"></div>
      <div id="ranking-general-final"></div>
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
    expect(esc('<br>')).toBe('&lt;br&gt;');
    expect(esc("it's")).toBe('it&#039;s');
  });

  test('renderListaEspera renderiza nombres', () => {
    setJugadoresSala(['Ana', 'Bob']);
    renderListaEspera();
    const container = document.getElementById('lista-espera');
    expect(container.innerHTML).toContain('Ana');
    expect(container.innerHTML).toContain('Bob');
    expect(document.getElementById('cant-espera').textContent).toBe('2');
  });

  test('setPantalla cambia pantalla activa', () => {
    setPantalla('s-espera');
    expect(document.getElementById('s-espera').classList.contains('activa')).toBe(true);
    expect(document.getElementById('s-unirse').classList.contains('activa')).toBe(false);
  });
});
>>>>>>> origin/main
