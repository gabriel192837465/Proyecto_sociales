/**
 * @jest-environment jsdom
 */
const { onBancoChange, mostrarError, ocultarError, pedirClave, mostrarAuthError, cargarBancos } = require('../../src/client/features/docente/api.js');
const { S } = require('../../src/client/features/docente/state.js');

describe('docente/api', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <select id="banco-select"><option value="">– Elegí un banco –</option></select>
      <div id="banco-meta"></div>
      <div id="error-box" style="display:none"></div>
      <div class="overlay" id="modal-auth" style="display:none"></div>
      <div id="auth-error-box" style="display:none"></div>
      <div id="estado-cx"></div>
    `;
    S.bancosCache = [];
    S.token = 'test-token';
    localStorage.setItem('admin_token', 'test-token');
  });

  describe('onBancoChange', () => {
    test('sin selección limpia meta', () => {
      document.getElementById('banco-select').value = '';
      onBancoChange();
      expect(document.getElementById('banco-meta').innerHTML).toBe('');
    });

    test('con id no vacío no crashea', () => {
      document.getElementById('banco-select').innerHTML = '<option value="b1">Banco</option>';
      document.getElementById('banco-select').value = 'b1';
      expect(() => onBancoChange()).not.toThrow();
    });
  });

  describe('cargarBancos', () => {
    test('carga y renderiza bancos', async () => {
      global.fetch = jest.fn(() => Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([{ id: 'b1', nombre: 'Test', nivel: 'S', anio: '3°', tema: 'H', cantidad: 5 }])
      }));
      await cargarBancos();
      expect(S.bancosCache.length).toBe(1);
      const sel = document.getElementById('banco-select');
      expect(sel.innerHTML).toContain('Test');
    });

    test('401 redirige a pedirClave', async () => {
      global.fetch = jest.fn(() => Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({})
      }));
      await cargarBancos();
      expect(S.token).toBe('');
      expect(document.getElementById('modal-auth').style.display).toBe('flex');
    });

    test('error de red no crashea', async () => {
      global.fetch = jest.fn(() => Promise.reject(new Error('Network error')));
      await expect(cargarBancos()).resolves.toBeUndefined();
    });
  });

  describe('UI helpers', () => {
    test('mostrarError muestra mensaje', () => {
      mostrarError('Algo salió mal');
      const el = document.getElementById('error-box');
      expect(el.textContent).toContain('Algo salió mal');
      expect(el.style.display).toBe('block');
    });

    test('ocultarError oculta el error', () => {
      document.getElementById('error-box').style.display = 'block';
      ocultarError();
      expect(document.getElementById('error-box').style.display).toBe('none');
    });

    test('pedirClave muestra modal', () => {
      pedirClave();
      expect(document.getElementById('modal-auth').style.display).toBe('flex');
    });

    test('pedirClave con error muestra error', () => {
      pedirClave('Token inválido');
      expect(document.getElementById('auth-error-box').style.display).toBe('block');
      expect(document.getElementById('auth-error-box').textContent).toContain('Token inválido');
    });

    test('mostrarAuthError muestra mensaje de error', () => {
      mostrarAuthError('Contraseña incorrecta');
      expect(document.getElementById('auth-error-box').textContent).toContain('Contraseña incorrecta');
      expect(document.getElementById('auth-error-box').style.display).toBe('block');
    });
  });
});
