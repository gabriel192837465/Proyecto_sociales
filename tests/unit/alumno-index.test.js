/**
 * @jest-environment jsdom
 */
const mockEnviar = jest.fn();
let mockGetWS = () => null;
const mockSetAutoReconnectEnabled = jest.fn();
jest.mock('../../src/client/shared/socket-client.js', () => ({
  enviar: (...args) => mockEnviar(...args),
  conectar: jest.fn(() => ({})),
  onMensaje: jest.fn(),
  getWS: () => mockGetWS(),
  setAutoReconnectEnabled: (...args) => mockSetAutoReconnectEnabled(...args),
}));

const { state, setWS, setMiNombre, setMiRespuesta, setMiPuntaje, setPendienteEnvio } = require('../../src/client/features/alumno/state');

function baseHTML() {
  return `
    <input type="text" id="input-nombre">
    <button id="btn-entrar"></button>
    <div id="error-nombre" style="display:none"></div>
    <div class="screen" id="s-espera"></div>
    <div class="screen activa" id="s-unirse"></div>
    <div class="screen" id="s-pregunta"></div>
    <div class="screen" id="s-respondio"></div>
    <button class="opcion-btn" id="op-0"></button>
    <button class="opcion-btn" id="op-1"></button>
    <button class="opcion-btn" id="op-2"></button>
    <button class="opcion-btn" id="op-3"></button>
  `;
}

describe('alumno/index', () => {
  beforeEach(() => {
    document.body.innerHTML = baseHTML();
    localStorage.clear();
    setMiNombre('');
    setMiRespuesta(null);
    mockEnviar.mockClear();
    mockSetAutoReconnectEnabled.mockClear();
    mockGetWS = () => null;
    global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
    global.WebSocket = class MockWS {
      constructor() { this.readyState = 1; }
      send() {}
      close() {}
    };
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.WebSocket;
  });

  describe('entrar', () => {
    test('sin nombre no hace nada', () => {
      const mod = require('../../src/client/features/alumno/index');
      document.getElementById('input-nombre').value = '';
      window.entrar();
      expect(document.getElementById('btn-entrar').disabled).toBe(false);
    });

    test('con nombre y WS abierto envía directo', async () => {
      const mod = require('../../src/client/features/alumno/index');
      mockGetWS = () => ({ readyState: WebSocket.OPEN, send: jest.fn() });
      document.getElementById('input-nombre').value = 'Ana';
      await window.entrar();
      expect(state.miNombre).toBe('Ana');
      expect(mockEnviar).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'alumno_entra' }));
      // REQ-UI-08: entrar() es la acción explícita que re-habilita la auto-reconexión
      expect(mockSetAutoReconnectEnabled).toHaveBeenCalledWith(true);
    });

    test('sin WS abierto llama conectar y enviar inmediatamente', async () => {
      const mod = require('../../src/client/features/alumno/index');
      document.getElementById('input-nombre').value = 'Bob';
      const { conectar: mockSocketConectar } = require('../../src/client/shared/socket-client.js');
      await window.entrar();
      expect(state.miNombre).toBe('Bob');
      expect(mockSocketConectar).toHaveBeenCalled();
      expect(mockEnviar).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'alumno_entra', nombre: 'Bob' }));
    });

    test('error-nombre se oculta al entrar', async () => {
      const mod = require('../../src/client/features/alumno/index');
      document.getElementById('error-nombre').style.display = 'block';
      document.getElementById('input-nombre').value = 'Ana';
      mockGetWS = () => ({ readyState: WebSocket.OPEN, send: jest.fn() });
      await window.entrar();
      expect(document.getElementById('error-nombre').style.display).toBe('none');
    });
  });

  describe('responder', () => {
    test('ya respondió no envía de nuevo', () => {
      const mod = require('../../src/client/features/alumno/index');
      setMiRespuesta(0);
      window.responder(1);
      expect(mockEnviar).not.toHaveBeenCalled();
    });

    test('responde correctamente', () => {
      const mod = require('../../src/client/features/alumno/index');
      window.responder(2);
      expect(state.miRespuesta).toBe(2);
      expect(document.getElementById('op-2').classList.contains('seleccionada')).toBe(true);
      expect(document.getElementById('op-0').disabled).toBe(true);
      expect(mockEnviar).toHaveBeenCalledWith(expect.objectContaining({ opcion: 2 }));
      expect(document.getElementById('s-respondio').classList.contains('activa')).toBe(true);
    });

    test('responder activa el flag pendienteEnvio antes de enviar', () => {
      const mod = require('../../src/client/features/alumno/index');
      setPendienteEnvio(false);
      window.responder(0);
      expect(state.pendienteEnvio).toBe(true);
    });
  });

  describe('restaurarOpciones', () => {
    test('re-habilita los 4 botones y remueve .seleccionada', () => {
      const { restaurarOpciones } = require('../../src/client/features/alumno/index');
      setMiRespuesta(0);
      setPendienteEnvio(true);
      document.getElementById('op-0').classList.add('seleccionada');
      document.getElementById('op-1').classList.add('seleccionada');
      document.querySelectorAll('.opcion-btn').forEach(b => b.disabled = true);

      restaurarOpciones();

      document.querySelectorAll('.opcion-btn').forEach(b => expect(b.disabled).toBe(false));
      expect(document.getElementById('op-0').classList.contains('seleccionada')).toBe(false);
      expect(document.getElementById('op-1').classList.contains('seleccionada')).toBe(false);
      // El caller decide si resetear miRespuesta
      expect(state.miRespuesta).toBe(0);
    });

    test('re-habilita los botones aun si pendienteEnvio es false', () => {
      const { restaurarOpciones } = require('../../src/client/features/alumno/index');
      setPendienteEnvio(false);
      document.getElementById('op-0').classList.add('seleccionada');
      document.getElementById('op-0').disabled = true;

      restaurarOpciones();

      expect(document.getElementById('op-0').classList.contains('seleccionada')).toBe(false);
      expect(document.getElementById('op-0').disabled).toBe(false);
    });
  });

  describe('volverAlLobby', () => {
    test('resetea puntaje y respuesta', () => {
      const mod = require('../../src/client/features/alumno/index');
      state.miPuntaje = 100;
      setMiRespuesta(1);
      window.volverAlLobby();
      expect(state.miPuntaje).toBe(0);
      expect(state.miRespuesta).toBeNull();
      expect(document.getElementById('s-espera').classList.contains('activa')).toBe(true);
    });
  });

  describe('auto-reconnect y enter key', () => {
    test('dispara entrar con datos guardados si existen', () => {
      localStorage.setItem('historia_quiz_id', 'uuid-123');
      localStorage.setItem('historia_quiz_nombre', 'Ana');
      jest.isolateModules(() => {
        const { state: freshState } = require('../../src/client/features/alumno/state');
        freshState.miNombre = '';
        const mod = require('../../src/client/features/alumno/index');
        expect(freshState.miNombre).toBe('Ana');
        expect(document.getElementById('input-nombre').value).toBe('Ana');
        expect(document.getElementById('btn-entrar').disabled).toBe(true);
      });
    });

    test('presionar Enter en input llama entrar', () => {
      jest.isolateModules(() => {
        const mod = require('../../src/client/features/alumno/index');
        window.entrar = jest.fn();
        const input = document.getElementById('input-nombre');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(window.entrar).toHaveBeenCalled();
      });
    });
  });
});
