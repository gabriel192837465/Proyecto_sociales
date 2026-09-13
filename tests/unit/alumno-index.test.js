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

const { state, setWS, setMiNombre, setMiRespuesta, setMiPuntaje, setPendienteEnvio, setCodigoPartida, setCuenta } = require('../../src/client/features/alumno/state');

// Drena la cola de microtasks para las cadenas async (fetch -> json -> ...)
// del IIFE de auto-reconexión, sin depender de timers reales/falsos.
async function flush(n = 12) {
  for (let i = 0; i < n; i++) await Promise.resolve();
}

function baseHTML() {
  return `
    <div class="screen activa" id="s-cuenta">
      <button id="tab-login" data-action="mostrar-tab-login"></button>
      <button id="tab-registro" data-action="mostrar-tab-registro"></button>
      <div id="form-login">
        <input type="email" id="login-email">
        <input type="password" id="login-password">
        <div id="error-login" style="display:none"></div>
        <button id="btn-login"></button>
      </div>
      <div id="form-registro" style="display:none">
        <input type="email" id="registro-email">
        <input type="text" id="registro-nombre-usuario">
        <input type="password" id="registro-password">
        <div id="error-registro" style="display:none"></div>
        <button id="btn-registro"></button>
      </div>
    </div>
    <div class="screen" id="s-unirse">
      <p id="cuenta-nombre-display">–</p>
      <button id="btn-cerrar-sesion"></button>
      <input type="text" id="input-codigo">
      <button id="btn-entrar"></button>
      <div id="error-nombre" style="display:none"></div>
    </div>
    <div class="screen" id="s-espera"></div>
    <div class="screen" id="s-pregunta"></div>
    <div class="screen" id="s-respondio"></div>
    <button class="opcion-btn" id="op-0"></button>
    <button class="opcion-btn" id="op-1"></button>
    <button class="opcion-btn" id="op-2"></button>
    <button class="opcion-btn" id="op-3"></button>
  `;
}

// Mock de fetch por defecto: /api/alumno/me sin sesión (usuario: null), y
// cualquier otra ruta (login/registro/entrar) resuelve ok con json vacío.
// Los tests que necesiten otro comportamiento sobreescriben global.fetch.
function mockFetchSinSesion() {
  return jest.fn((url) => {
    if (String(url).includes('/api/alumno/me')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ usuario: null }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

describe('alumno/index', () => {
  beforeEach(() => {
    document.body.innerHTML = baseHTML();
    localStorage.clear();
    setMiNombre('');
    setCodigoPartida('');
    setCuenta(null);
    setMiRespuesta(null);
    mockEnviar.mockClear();
    mockSetAutoReconnectEnabled.mockClear();
    mockGetWS = () => null;
    global.fetch = mockFetchSinSesion();
    global.WebSocket = class MockWS {
      constructor() { this.readyState = 1; }
      send() {}
      close() {}
    };
  });

  afterEach(() => {
    delete global.WebSocket;
  });

  describe('entrar', () => {
    test('sin código válido no hace nada', async () => {
      const mod = require('../../src/client/features/alumno/index');
      setMiNombre('Ana');
      document.getElementById('input-codigo').value = '';
      await window.entrar();
      expect(mockEnviar).not.toHaveBeenCalled();
    });

    test('código con formato inválido muestra error y no envía', async () => {
      const mod = require('../../src/client/features/alumno/index');
      setMiNombre('Ana');
      document.getElementById('input-codigo').value = '123';
      await window.entrar();
      expect(mockEnviar).not.toHaveBeenCalled();
      const errEl = document.getElementById('error-nombre');
      expect(errEl.style.display).toBe('block');
    });

    test('con código válido y WS abierto envía directo', async () => {
      const mod = require('../../src/client/features/alumno/index');
      setMiNombre('Ana');
      mockGetWS = () => ({ readyState: WebSocket.OPEN, send: jest.fn() });
      document.getElementById('input-codigo').value = '482731';
      await window.entrar();
      expect(state.miNombre).toBe('Ana');
      expect(state.codigoPartida).toBe('482731');
      expect(mockEnviar).toHaveBeenCalledWith(expect.objectContaining({
        tipo: 'alumno_entra', nombre: 'Ana', codigo: '482731'
      }));
      // REQ-UI-08: entrar() es la acción explícita que re-habilita la auto-reconexión
      expect(mockSetAutoReconnectEnabled).toHaveBeenCalledWith(true);
    });

    test('sin WS abierto llama conectar y enviar inmediatamente', async () => {
      const mod = require('../../src/client/features/alumno/index');
      setMiNombre('Bob');
      document.getElementById('input-codigo').value = '111222';
      const { conectar: mockSocketConectar } = require('../../src/client/shared/socket-client.js');
      await window.entrar();
      expect(mockSocketConectar).toHaveBeenCalled();
      expect(mockEnviar).toHaveBeenCalledWith(expect.objectContaining({
        tipo: 'alumno_entra', nombre: 'Bob', codigo: '111222'
      }));
    });

    test('error-nombre se oculta al entrar con éxito', async () => {
      const mod = require('../../src/client/features/alumno/index');
      setMiNombre('Ana');
      document.getElementById('error-nombre').style.display = 'block';
      document.getElementById('input-codigo').value = '482731';
      mockGetWS = () => ({ readyState: WebSocket.OPEN, send: jest.fn() });
      await window.entrar();
      expect(document.getElementById('error-nombre').style.display).toBe('none');
    });
  });

  describe('login / registro / cerrarSesion', () => {
    test('login exitoso pasa a la pantalla de código con el nombre de la cuenta', async () => {
      global.fetch = jest.fn((url) => {
        if (String(url).includes('/api/alumno/me')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ usuario: null }) });
        }
        if (String(url).includes('/api/alumno/login')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ ok: true, usuario: { id: 'u1', nombreUsuario: 'juanp', rol: 'alumno' } })
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      const mod = require('../../src/client/features/alumno/index');
      document.getElementById('login-email').value = 'juanp@alu.tecnica29de6.edu.ar';
      document.getElementById('login-password').value = 'contraseñaSegura123';
      await window.login();
      expect(state.miNombre).toBe('juanp');
      expect(state.cuenta).toEqual({ id: 'u1', nombreUsuario: 'juanp', rol: 'alumno' });
      expect(document.getElementById('cuenta-nombre-display').textContent).toBe('juanp');
      expect(document.getElementById('s-unirse').classList.contains('activa')).toBe(true);
    });

    test('login rechazado muestra el mensaje de error del servidor', async () => {
      global.fetch = jest.fn((url) => {
        if (String(url).includes('/api/alumno/me')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ usuario: null }) });
        }
        if (String(url).includes('/api/alumno/login')) {
          return Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ error: 'credenciales_invalidas', mensaje: 'Correo o contraseña incorrectos.' })
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      const mod = require('../../src/client/features/alumno/index');
      document.getElementById('login-email').value = 'juanp@alu.tecnica29de6.edu.ar';
      document.getElementById('login-password').value = 'mala';
      await window.login();
      const errEl = document.getElementById('error-login');
      expect(errEl.textContent).toBe('Correo o contraseña incorrectos.');
      expect(errEl.style.display).toBe('block');
      expect(state.cuenta).toBeNull();
    });

    test('registro exitoso pasa a la pantalla de código', async () => {
      global.fetch = jest.fn((url) => {
        if (String(url).includes('/api/alumno/me')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ usuario: null }) });
        }
        if (String(url).includes('/api/alumno/registro')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ ok: true, usuario: { id: 'u2', nombreUsuario: 'lucia', rol: 'alumno' } })
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      const mod = require('../../src/client/features/alumno/index');
      document.getElementById('registro-email').value = 'lucia@alu.tecnica29de6.edu.ar';
      document.getElementById('registro-nombre-usuario').value = 'lucia';
      document.getElementById('registro-password').value = 'contraseñaSegura123';
      await window.registro();
      expect(state.miNombre).toBe('lucia');
      expect(document.getElementById('s-unirse').classList.contains('activa')).toBe(true);
    });

    test('registro rechazado por dominio no institucional muestra el mensaje', async () => {
      global.fetch = jest.fn((url) => {
        if (String(url).includes('/api/alumno/me')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ usuario: null }) });
        }
        if (String(url).includes('/api/alumno/registro')) {
          return Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ error: 'dominio_no_institucional', mensaje: 'Debes utilizar un correo @alu.tecnica29de6.edu.ar' })
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      const mod = require('../../src/client/features/alumno/index');
      document.getElementById('registro-email').value = 'lucia@gmail.com';
      document.getElementById('registro-nombre-usuario').value = 'lucia';
      document.getElementById('registro-password').value = 'contraseñaSegura123';
      await window.registro();
      const errEl = document.getElementById('error-registro');
      expect(errEl.textContent).toBe('Debes utilizar un correo @alu.tecnica29de6.edu.ar');
      expect(errEl.style.display).toBe('block');
    });

    test('cerrarSesion limpia la cuenta y vuelve a la pantalla de cuenta', async () => {
      const mod = require('../../src/client/features/alumno/index');
      setCuenta({ id: 'u1', nombreUsuario: 'juanp', rol: 'alumno' });
      setMiNombre('juanp');
      setWS({ close: jest.fn() });
      await window.cerrarSesion();
      expect(state.cuenta).toBeNull();
      expect(state.miNombre).toBe('');
      expect(document.getElementById('s-cuenta').classList.contains('activa')).toBe(true);
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

  describe('inicialización (cuenta guardada + código guardado)', () => {
    test('con cuenta activa (cookie de sesión) va directo a la pantalla de código', async () => {
      global.fetch = jest.fn((url) => {
        if (String(url).includes('/api/alumno/me')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ usuario: { id: 'u1', nombreUsuario: 'Ana', rol: 'alumno' } })
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      jest.resetModules();
      require('../../src/client/features/alumno/index');
      await flush();
      expect(document.getElementById('s-unirse').classList.contains('activa')).toBe(true);
      expect(document.getElementById('cuenta-nombre-display').textContent).toBe('Ana');
    });

    test('sin cuenta y sin código guardado se queda en la pantalla de cuenta', async () => {
      jest.resetModules();
      require('../../src/client/features/alumno/index');
      await flush();
      expect(document.getElementById('s-cuenta').classList.contains('activa')).toBe(true);
    });

    test('con cuenta + código guardado, reconecta automáticamente (alumno_entra con código)', async () => {
      localStorage.setItem('historia_quiz_codigo', '482731');
      global.fetch = jest.fn((url) => {
        if (String(url).includes('/api/alumno/me')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ usuario: { id: 'u1', nombreUsuario: 'Ana', rol: 'alumno' } })
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      jest.resetModules();
      require('../../src/client/features/alumno/index');
      await flush();
      expect(mockEnviar).toHaveBeenCalledWith(expect.objectContaining({
        tipo: 'alumno_entra', nombre: 'Ana', codigo: '482731'
      }));
    });

    test('presionar Enter en input-codigo llama entrar', () => {
      jest.isolateModules(() => {
        const mod = require('../../src/client/features/alumno/index');
        window.entrar = jest.fn();
        const input = document.getElementById('input-codigo');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(window.entrar).toHaveBeenCalled();
      });
    });
  });
});
