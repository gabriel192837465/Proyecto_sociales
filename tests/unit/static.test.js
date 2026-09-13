const fs = require('fs');
const path = require('path');

describe('routes/static.js', () => {
  const { handleStatic } = require('../../src/server/http/static');

  function mockReqRes(pathname) {
    const res = { headers: {}, body: '', statusCode: undefined };
    res.writeHead = function (code, h) {
      this.statusCode = code;
      if (h) Object.assign(this.headers, h);
    };
    res.end = function (d) { this.body = d || ''; };
    return { req: { url: pathname, method: 'GET' }, res };
  }

  function pollFor(fn, timeout = 2000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const result = fn();
        if (result !== undefined && result !== false) return resolve(result);
        if (Date.now() - start > timeout) return reject(new Error('pollFor timeout'));
        setImmediate(check);
      };
      setImmediate(check);
    });
  }

  test('debería servir archivo HTML existente', async () => {
    const { req, res } = mockReqRes('/admin.html');
    handleStatic(req, res, '/admin.html');
    await pollFor(() => res.statusCode);
    expect(res.statusCode).toBe(200);
    expect(res.body.toString()).toContain('<html');
  });

  test('debería servir index.html para ruta raíz', async () => {
    const { req, res } = mockReqRes('/');
    handleStatic(req, res, '/');
    await pollFor(() => res.statusCode);
    expect(res.statusCode).toBe(200);
    expect(res.body.toString()).toContain('alumno.html');
  });

  test('debería retornar 404 para archivo inexistente', async () => {
    const { req, res } = mockReqRes('/no-existe.js');
    handleStatic(req, res, '/no-existe.js');
    await pollFor(() => res.statusCode);
    expect(res.statusCode).toBe(404);
    expect(res.body).toBe(JSON.stringify({ error: 'No encontrado' }));
  });
});

describe('middleware/cors.js', () => {
  const { applyCors, handleOptions } = require('../../src/server/http/middleware/cors');

  test('applyCors omite ACAO si el origen no está permitido', () => {
    const headers = {};
    const req = { headers: { origin: 'http://test.com' } };
    const res = { setHeader: jest.fn((k, v) => { headers[k] = v; }) };
    applyCors(req, res);
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(headers['Access-Control-Allow-Methods']).toBe('GET,POST,PUT,DELETE,OPTIONS');
  });

  test('handleOptions responde 204 a OPTIONS y retorna true', () => {
    const req = { method: 'OPTIONS' };
    let code, ended = false;
    const res = {
      writeHead(c) { code = c; },
      end() { ended = true; }
    };
    const result = handleOptions(req, res);
    expect(result).toBe(true);
    expect(code).toBe(204);
    expect(ended).toBe(true);
  });

  test('handleOptions retorna false para otros métodos', () => {
    const req = { method: 'GET' };
    const result = handleOptions(req, {});
    expect(result).toBe(false);
  });
});

describe('middleware/parse-body.js', () => {
  const { parseBody, MAX_BODY_SIZE } = require('../../src/server/http/middleware/parse-body');
  test('MAX_BODY_SIZE es 512KB', () => {
    expect(MAX_BODY_SIZE).toBe(512 * 1024);
  });
});
