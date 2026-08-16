/**
 * @jest-environment jsdom
 */
const { mostrarToast } = require('../../src/client/features/alumno/toast.js');

function baseHTML() {
  return `<div class="toast" id="toast"></div>`;
}

describe('alumno/toast', () => {
  beforeEach(() => {
    document.body.innerHTML = baseHTML();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('mostrarToast agrega clases show + tipo y mensaje al contenedor', () => {
    mostrarToast('Hola mundo', 'err');
    const t = document.getElementById('toast');
    expect(t.className).toContain('toast');
    expect(t.className).toContain('show');
    expect(t.className).toContain('err');
    expect(t.textContent).toContain('Hola mundo');
  });

  test('mostrarToast tipo ok usa clase ok', () => {
    mostrarToast('Todo bien', 'ok');
    const t = document.getElementById('toast');
    expect(t.className).toContain('ok');
    expect(t.className).not.toContain('err');
  });

  test('llamar dos veces reemplaza el mensaje en vez de apilar', () => {
    mostrarToast('Primero', 'ok');
    const t = document.getElementById('toast');
    expect(t.textContent).toContain('Primero');

    mostrarToast('Segundo', 'err');
    expect(t.className).toContain('err');
    expect(t.textContent).toContain('Segundo');
    expect(t.textContent).not.toContain('Primero');
  });

  test('auto-dismiss a los 4 segundos remueve la clase show', () => {
    mostrarToast('Se cierra solo', 'ok');
    const t = document.getElementById('toast');
    expect(t.className).toContain('show');

    jest.advanceTimersByTime(4000);
    expect(t.className).not.toContain('show');
  });

  test('botón ✕ cierra el toast inmediatamente y cancela el timer', () => {
    mostrarToast('Manual close', 'err');
    const t = document.getElementById('toast');
    const closeBtn = t.querySelector('.toast-close');
    expect(closeBtn).toBeTruthy();

    closeBtn.click();
    expect(t.className).not.toContain('show');

    // Si el timer se hubiera disparado, no debe causar error
    jest.advanceTimersByTime(10000);
    expect(t.className).not.toContain('show');
  });

  test('si #toast no existe, mostrarToast no lanza error', () => {
    document.body.innerHTML = '';
    expect(() => mostrarToast('Sin contenedor', 'err')).not.toThrow();
  });

  test('dismiss() expuesto resetea aunque no haya timer armado', () => {
    const t = document.getElementById('toast');
    t.className = 'toast show err';
    t.textContent = 'Residual';
    const closeBtn = t.querySelector('.toast-close');
    // Al pedir un nuevo toast, el viejo debe limpiarse
    mostrarToast('Nuevo', 'ok');
    expect(t.textContent).toContain('Nuevo');
    expect(t.className).toContain('ok');
  });
});
