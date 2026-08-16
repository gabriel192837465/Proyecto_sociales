/**
 * @jest-environment jsdom
 */
const mockEnviar = jest.fn();
jest.mock('../../src/client/shared/socket-client.js', () => ({
  enviar: (...args) => mockEnviar(...args),
  conectar: jest.fn(),
  onMensaje: jest.fn(),
  getWS: jest.fn(() => ({ close: jest.fn() })),
}));

let mockSocket;
beforeAll(() => {
  document.body.innerHTML = `
    <div id="estado-cx"></div>
    <div id="error-box" style="display:none"></div>
    <select id="banco-select"><option value="">– Elegí un banco –</option></select>
    <select id="tiempo-select"><option value="20">20</option></select>
    <div id="pantalla-lobby"><p></p></div>
    <div class="overlay" id="modal-auth" style="display:none">
      <input type="password" id="auth-password">
      <div id="auth-error-box" style="display:none"></div>
    </div>
  `;
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) }));
  global.WebSocket = class {
    constructor() { this.readyState = 1; mockSocket = this; }
    send() {}
    close() {}
  };
  localStorage.setItem('admin_token', 'test-token');
  require('../../src/client/features/docente/index.js');
});

const { S } = require('../../src/client/features/docente/state.js');

describe('docente/index', () => {
  beforeEach(() => {
    mockEnviar.mockClear();
    S.jugadoresOnline = { '1': true };
  });

  test('cerrarSesion limpia token', () => {
    window.cerrarSesion();
    expect(localStorage.getItem('admin_token')).toBeNull();
  });

  test('volverAlMenu envía mensaje', () => {
    window.volverAlMenu();
    expect(mockEnviar).toHaveBeenCalledWith({ tipo: 'volver_a_lobby' });
  });

  test('siguientePregunta envía mensaje', () => {
    window.siguientePregunta();
    expect(mockEnviar).toHaveBeenCalledWith({ tipo: 'siguiente_pregunta' });
  });

  test('forzarResultado envía mensaje', () => {
    window.forzarResultado();
    expect(mockEnviar).toHaveBeenCalledWith({ tipo: 'mostrar_resultado_manual' });
  });

  test('alternarPausa envía mensaje', () => {
    window.alternarPausa();
    expect(mockEnviar).toHaveBeenCalledWith({ tipo: 'alternar_pausa' });
  });

  test('reiniciarRankingGeneral envía mensaje', () => {
    window.reiniciarRankingGeneral();
    expect(mockEnviar).toHaveBeenCalledWith({ tipo: 'reiniciar_ranking_general' });
  });

  test('iniciarJuego sin banco muestra error', () => {
    document.getElementById('banco-select').value = '';
    window.iniciarJuego();
    expect(document.getElementById('error-box').style.display).toBe('block');
  });

  test('iniciarJuego sin alumnos muestra error', () => {
    S.jugadoresOnline = {};
    document.getElementById('banco-select').innerHTML = '<option value="b1">Test</option>';
    document.getElementById('banco-select').value = 'b1';
    window.iniciarJuego();
    expect(document.getElementById('error-box').textContent).toContain('No hay alumnos');
  });

  test('iniciarJuego con datos envía mensaje', () => {
    document.getElementById('banco-select').innerHTML = '<option value="b1">Test</option>';
    document.getElementById('banco-select').value = 'b1';
    window.iniciarJuego();
    expect(mockEnviar).toHaveBeenCalled();
  });

  test('autenticarDocente con password vacío muestra error', () => {
    document.getElementById('auth-password').value = '';
    window.autenticarDocente();
    expect(document.getElementById('auth-error-box').style.display).toBe('block');
  });

  test('click en data-action=exportar-csv delega a exportarInformeCSV', () => {
    const spy = jest.fn();
    window.exportarInformeCSV = spy;
    const btn = document.createElement('button');
    btn.dataset.action = 'exportar-csv';
    document.body.appendChild(btn);
    btn.click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('click en data-action=imprimir-informe delega a imprimirInforme', () => {
    const spy = jest.fn();
    window.imprimirInforme = spy;
    const btn = document.createElement('button');
    btn.dataset.action = 'imprimir-informe';
    document.body.appendChild(btn);
    btn.click();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
