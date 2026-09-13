/**
 * @jest-environment jsdom
 */
const { state, setToken, clearToken, setBancoActual, setPregEditando, setImportMode, setCsvTexto } = require('../../src/client/features/admin/state.js');

describe('admin/state', () => {
  beforeEach(() => {
    localStorage.clear();
    setToken('');
    setBancoActual(null);
    setPregEditando(null);
    setImportMode('csv');
    setCsvTexto('');
  });

  test('token se persiste en localStorage', () => {
    expect(state.token).toBe('');
    setToken('my-token');
    expect(state.token).toBe('my-token');
    expect(localStorage.getItem('admin_token')).toBe('my-token');
    clearToken();
    expect(state.token).toBe('');
    expect(localStorage.getItem('admin_token')).toBeNull();
  });

  test('bancoActualId se actualiza', () => {
    expect(state.bancoActualId).toBeNull();
    setBancoActual('banco_1');
    expect(state.bancoActualId).toBe('banco_1');
  });

  test('pregEditandoId se actualiza', () => {
    expect(state.pregEditandoId).toBeNull();
    setPregEditando('p_123');
    expect(state.pregEditandoId).toBe('p_123');
  });

  test('importMode se actualiza', () => {
    expect(state.importMode).toBe('csv');
    setImportMode('json');
    expect(state.importMode).toBe('json');
  });

  test('csvTexto se actualiza', () => {
    expect(state.csvTexto).toBe('');
    setCsvTexto('a;b;c');
    expect(state.csvTexto).toBe('a;b;c');
  });

  test('clearToken remueve de localStorage', () => {
    setToken('exists');
    clearToken();
    expect(localStorage.getItem('admin_token')).toBeNull();
  });
});
