/**
 * @jest-environment jsdom
 */
const apiClient = require('../../src/client/features/admin/api-client');
const { state, setToken } = require('../../src/client/features/admin/state');

describe('admin/api-client', () => {
  beforeEach(() => {
    setToken('test-token');
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
  });

  function mockFetch(status, body) {
    global.fetch.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body)
    });
  }

  function mockFetchError(status, body) {
    global.fetch.mockResolvedValue({
      ok: false,
      status,
      json: () => Promise.resolve(body)
    });
  }

  describe('apiFetch (via exported functions)', () => {
    test('fetchBancos hace GET correcto', async () => {
      mockFetch(200, [{ id: 'b1' }]);
      const res = await apiClient.fetchBancos();
      expect(global.fetch).toHaveBeenCalledWith('/api/bancos', expect.objectContaining({
        headers: expect.objectContaining({ 'X-Admin-Token': 'test-token' })
      }));
      expect(res).toEqual([{ id: 'b1' }]);
    });

    test('lanza UNAUTHORIZED en 401', async () => {
      mockFetchError(401, { error: 'No autorizado' });
      await expect(apiClient.fetchBancos()).rejects.toThrow('UNAUTHORIZED');
    });

    test('lanza UNAUTHORIZED en 403', async () => {
      mockFetchError(403, { error: 'Prohibido' });
      await expect(apiClient.fetchBancos()).rejects.toThrow('UNAUTHORIZED');
    });

    test('lanza error con mensaje del servidor', async () => {
      mockFetchError(400, { error: 'Bad request' });
      await expect(apiClient.fetchBancos()).rejects.toThrow('Bad request');
    });

    test('lanza HTTP n cuando no hay error key', async () => {
      mockFetchError(500, {});
      await expect(apiClient.fetchBancos()).rejects.toThrow('HTTP 500');
    });

    test('lanza HTTP n cuando json() falla', async () => {
      global.fetch.mockResolvedValue({
        ok: false, status: 502,
        json: () => Promise.reject(new Error('parse fail'))
      });
      await expect(apiClient.fetchBancos()).rejects.toThrow('HTTP 502');
    });
  });

  describe('authenticateAdmin', () => {
    test('éxito', async () => {
      mockFetch(200, [{ id: 'b1' }]);
      const res = await apiClient.authenticateAdmin('mypass');
      expect(res).toEqual([{ id: 'b1' }]);
    });

    test('fallo lanza AUTH_FAILED', async () => {
      mockFetchError(401, {});
      await expect(apiClient.authenticateAdmin('wrong')).rejects.toThrow('AUTH_FAILED');
    });
  });

  describe('CRUD bancos', () => {
    test('fetchBanco', async () => {
      mockFetch(200, { id: 'b1' });
      expect(await apiClient.fetchBanco('b1')).toEqual({ id: 'b1' });
    });

    test('createBanco hace POST', async () => {
      mockFetch(201, { id: 'b2' });
      const res = await apiClient.createBanco({ nombre: 'Nuevo' });
      expect(global.fetch).toHaveBeenCalledWith('/api/bancos',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ nombre: 'Nuevo' }) }));
      expect(res).toEqual({ id: 'b2' });
    });

    test('updateBanco hace PUT', async () => {
      mockFetch(200, { id: 'b1' });
      const res = await apiClient.updateBanco('b1', { nombre: 'Editado' });
      expect(global.fetch).toHaveBeenCalledWith('/api/bancos/b1',
        expect.objectContaining({ method: 'PUT' }));
      expect(res).toEqual({ id: 'b1' });
    });

    test('deleteBanco hace DELETE', async () => {
      mockFetch(200, { ok: true });
      const res = await apiClient.deleteBanco('b1');
      expect(global.fetch).toHaveBeenCalledWith('/api/bancos/b1',
        expect.objectContaining({ method: 'DELETE' }));
      expect(res).toEqual({ ok: true });
    });
  });

  describe('CRUD preguntas', () => {
    test('createPregunta', async () => {
      mockFetch(201, { id: 'p1' });
      const res = await apiClient.createPregunta('b1', { pregunta: '¿?' });
      expect(global.fetch).toHaveBeenCalledWith('/api/bancos/b1/preguntas',
        expect.objectContaining({ method: 'POST' }));
      expect(res).toEqual({ id: 'p1' });
    });

    test('updatePregunta', async () => {
      mockFetch(200, { id: 'p1' });
      const res = await apiClient.updatePregunta('b1', 'p1', { pregunta: '¿?' });
      expect(global.fetch).toHaveBeenCalledWith('/api/bancos/b1/preguntas/p1',
        expect.objectContaining({ method: 'PUT' }));
      expect(res).toEqual({ id: 'p1' });
    });

    test('deletePregunta', async () => {
      mockFetch(200, { ok: true });
      const res = await apiClient.deletePregunta('b1', 'p1');
      expect(global.fetch).toHaveBeenCalledWith('/api/bancos/b1/preguntas/p1',
        expect.objectContaining({ method: 'DELETE' }));
      expect(res).toEqual({ ok: true });
    });
  });

  describe('imports', () => {
    test('importCSV', async () => {
      mockFetch(200, { importadas: 2 });
      const res = await apiClient.importCSV('b1', 'csv data');
      expect(global.fetch).toHaveBeenCalledWith('/api/bancos/b1/importar-csv',
        expect.objectContaining({ method: 'POST' }));
      expect(res).toEqual({ importadas: 2 });
    });

    test('importJSON', async () => {
      mockFetch(200, { importadas: 3 });
      const res = await apiClient.importJSON('b1', { preguntas: [] });
      expect(global.fetch).toHaveBeenCalledWith('/api/bancos/b1/importar-json',
        expect.objectContaining({ method: 'POST' }));
      expect(res).toEqual({ importadas: 3 });
    });
  });
});
