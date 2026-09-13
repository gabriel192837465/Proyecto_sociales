/**
 * @jest-environment jsdom
 */
jest.mock('../../src/client/features/admin/api-client.js', () => ({
  fetchUsuarios: jest.fn(),
  setUsuarioActivo: jest.fn(),
}));
jest.mock('../../src/client/features/admin/toast.js', () => ({
  toast: jest.fn(),
}));

const { fetchUsuarios, setUsuarioActivo } = require('../../src/client/features/admin/api-client.js');
const { toast } = require('../../src/client/features/admin/toast.js');
const { mostrarUsuarios, toggleUsuarioActivo } = require('../../src/client/features/admin/usuarios.js');

describe('admin/usuarios', () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="main-content"></div><div id="toast"></div>`;
    fetchUsuarios.mockReset();
    setUsuarioActivo.mockReset();
    toast.mockReset();
  });

  test('mostrarUsuarios renderiza la tabla con las cuentas devueltas', async () => {
    fetchUsuarios.mockResolvedValue({
      usuarios: [
        { id: 'u1', nombreUsuario: 'juanp', email: 'juanp@alu.tecnica29de6.edu.ar', activo: true },
        { id: 'u2', nombreUsuario: 'lucia', email: 'lucia@alu.tecnica29de6.edu.ar', activo: false },
      ]
    });

    await mostrarUsuarios();

    const html = document.getElementById('main-content').innerHTML;
    expect(html).toContain('juanp');
    expect(html).toContain('juanp@alu.tecnica29de6.edu.ar');
    expect(html).toContain('lucia');
    expect(fetchUsuarios).toHaveBeenCalledWith(undefined);
  });

  test('mostrarUsuarios sin cuentas muestra un estado vacío', async () => {
    fetchUsuarios.mockResolvedValue({ usuarios: [] });
    await mostrarUsuarios();
    expect(document.getElementById('main-content').innerHTML).toContain('No hay cuentas de alumno');
  });

  test('mostrarUsuarios muestra un error si falla la carga', async () => {
    fetchUsuarios.mockRejectedValue(new Error('No autorizado'));
    await mostrarUsuarios();
    expect(document.getElementById('main-content').innerHTML).toContain('No autorizado');
  });

  test('toggleUsuarioActivo desactiva una cuenta activa y refresca la tabla', async () => {
    fetchUsuarios.mockResolvedValue({ usuarios: [{ id: 'u1', nombreUsuario: 'juanp', email: 'x@y.com', activo: false }] });
    setUsuarioActivo.mockResolvedValue({ ok: true, usuario: { id: 'u1', activo: false } });

    // main-content necesita el wrapper que arma mostrarUsuarios() para que
    // el refresco post-toggle encuentre #usuarios-tabla-wrap.
    document.getElementById('main-content').innerHTML = `<div id="usuarios-tabla-wrap"></div>`;

    await toggleUsuarioActivo('u1', true);

    expect(setUsuarioActivo).toHaveBeenCalledWith('u1', false);
    expect(toast).toHaveBeenCalledWith('Cuenta desactivada.', 'ok');
  });

  test('toggleUsuarioActivo activa una cuenta inactiva', async () => {
    fetchUsuarios.mockResolvedValue({ usuarios: [] });
    setUsuarioActivo.mockResolvedValue({ ok: true, usuario: { id: 'u1', activo: true } });
    document.getElementById('main-content').innerHTML = `<div id="usuarios-tabla-wrap"></div>`;

    await toggleUsuarioActivo('u1', false);

    expect(setUsuarioActivo).toHaveBeenCalledWith('u1', true);
    expect(toast).toHaveBeenCalledWith('Cuenta activada.', 'ok');
  });

  test('toggleUsuarioActivo muestra un toast de error si falla', async () => {
    setUsuarioActivo.mockRejectedValue(new Error('boom'));
    document.getElementById('main-content').innerHTML = `<div id="usuarios-tabla-wrap"></div>`;

    await toggleUsuarioActivo('u1', true);

    expect(toast).toHaveBeenCalledWith('Error: boom', 'err');
  });
});
