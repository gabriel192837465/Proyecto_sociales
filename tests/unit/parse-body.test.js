const { parseBody, MAX_BODY_SIZE } = require('../../src/server/http/middleware/parse-body');

describe('middleware/parse-body', () => {
  it('debería parsear JSON válido', async () => {
    const callbacks = {};
    const req = {
      on: jest.fn((event, callback) => {
        callbacks[event] = callback;
      })
    };

    const promise = parseBody(req);
    
    // Simulate data event — real HTTP emits Buffer chunks
    callbacks.data(Buffer.from('{"test": "value"}'));
    // Simulate end event
    callbacks.end();

    const result = await promise;
    expect(result).toEqual({ test: 'value' });
  });

  it('debería retornar el cuerpo como string si no es JSON válido', async () => {
    const callbacks = {};
    const req = {
      on: jest.fn((event, callback) => {
        callbacks[event] = callback;
      })
    };

    const promise = parseBody(req);

    callbacks.data(Buffer.from('not json'));
    callbacks.end();

    const result = await promise;
    expect(result).toBe('not json');
  });

  it('debería rechazar payload demasiado grande', async () => {
    const callbacks = {};
    const req = {
      on: jest.fn((event, callback) => {
        callbacks[event] = callback;
      })
    };

    const largeChunk = Buffer.alloc(MAX_BODY_SIZE + 1, 'x');
    const promise = parseBody(req);
    
    callbacks.data(largeChunk);

    await expect(promise).rejects.toThrow('PAYLOAD_TOO_LARGE');
  });

  it('debería rechazar si el tamaño acumulado excede el límite', async () => {
    const callbacks = {};
    const req = {
      on: jest.fn((event, callback) => {
        callbacks[event] = callback;
      })
    };

    const chunk1 = Buffer.alloc(Math.floor(MAX_BODY_SIZE / 2), 'x');
    const chunk2 = Buffer.alloc(Math.floor(MAX_BODY_SIZE / 2) + 1, 'x');
    const promise = parseBody(req);
    
    callbacks.data(chunk1);
    callbacks.data(chunk2);

    await expect(promise).rejects.toThrow('PAYLOAD_TOO_LARGE');
  });

  it('debería manejar errores de stream', async () => {
    const callbacks = {};
    const req = {
      on: jest.fn((event, callback) => {
        callbacks[event] = callback;
      })
    };

    const promise = parseBody(req);
    
    callbacks.error(new Error('Stream error'));

    await expect(promise).rejects.toThrow('Stream error');
  });

  it('debería concatenar múltiples chunks', async () => {
    const callbacks = {};
    const req = {
      on: jest.fn((event, callback) => {
        callbacks[event] = callback;
      })
    };

    const promise = parseBody(req);

    callbacks.data(Buffer.from('{"test":'));
    callbacks.data(Buffer.from(' "value"}'));
    callbacks.end();

    const result = await promise;
    expect(result).toEqual({ test: 'value' });
  });

  it('debería preservar caracteres UTF-8 multi-byte entre chunks', async () => {
    const callbacks = {};
    const req = {
      on: jest.fn((event, callback) => {
        callbacks[event] = callback;
      })
    };

    const promise = parseBody(req);

    // JSON con carácter multi-byte (ñ = 2 bytes UTF-8)
    // Partimos el Buffer en dos chunks en medio del carácter
    const json = Buffer.from('{"nombre": "España"}', 'utf8');
    const mid = json.indexOf(0xC3); // C3 = primer byte de 'ñ' en UTF-8
    const chunk1 = json.subarray(0, mid + 1); // incluye solo el primer byte de la ñ
    const chunk2 = json.subarray(mid + 1);

    callbacks.data(chunk1);
    callbacks.data(chunk2);
    callbacks.end();

    const result = await promise;
    expect(result).toEqual({ nombre: 'España' });
  });
});
