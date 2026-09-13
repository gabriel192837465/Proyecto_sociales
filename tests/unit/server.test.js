const http = require('http');

jest.mock('../../src/server/infra/logger', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    level: 'info',
  };
  return mockLogger;
});

const server = require('../../src/server');
const logger = require('../../src/server/infra/logger');

describe('server.js', () => {
  let originalExit;
  let exitCalled;

  beforeEach(() => {
    originalExit = process.exit;
    exitCalled = false;
    jest.clearAllMocks();
    process.exit = () => { exitCalled = true; };
  });

  afterEach(() => {
    process.exit = originalExit;
    jest.restoreAllMocks();
  });

  describe('handleServerError', () => {
    it('debería exportar función handleServerError', () => {
      expect(typeof server.handleServerError).toBe('function');
    });

    it('debería manejar error EADDRINUSE', () => {
      const error = new Error('Address already in use');
      error.code = 'EADDRINUSE';

      server.handleServerError(error);

      expect(exitCalled).toBe(true);
      expect(logger.error).toHaveBeenCalled();
      expect(logger.error.mock.calls.some(c => c.some(p => String(p).includes('puerto')))).toBe(true);
    });

    it('debería salir en cualquier error de inicio', () => {
      const error = new Error('Some other error');
      error.code = 'OTHER_ERROR';

      server.handleServerError(error);

      expect(exitCalled).toBe(true);
      expect(logger.error).toHaveBeenCalled();
    });

    it('debería salir en errores críticos (EACCES)', () => {
      const error = new Error('Permission denied');
      error.code = 'EACCES';

      server.handleServerError(error);

      expect(exitCalled).toBe(true);
      expect(logger.error).toHaveBeenCalled();
    });

    it('debería salir en errores críticos (EADDRNOTAVAIL)', () => {
      const error = new Error('Address not available');
      error.code = 'EADDRNOTAVAIL';

      server.handleServerError(error);

      expect(exitCalled).toBe(true);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('logServerInfo', () => {
    it('debería exportar función logServerInfo', () => {
      expect(typeof server.logServerInfo).toBe('function');
    });

    it('debería logear información del servidor', () => {
      server.logServerInfo(3000, '127.0.0.1', 'secure-token');

      expect(logger.info).toHaveBeenCalled();
      expect(logger.info.mock.calls.some(c => c.some(p => String(p).includes('Historia Quiz Server')))).toBe(true);
      expect(logger.info.mock.calls.some(c => c.some(p => String(p).includes('docente.html')))).toBe(true);
      expect(logger.info.mock.calls.some(c => c.some(p => String(p).includes('alumno.html')))).toBe(true);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('debería mostrar advertencia de seguridad con token predeterminado', () => {
      server.logServerInfo(3000, '127.0.0.1', 'historia');

      expect(logger.warn).toHaveBeenCalled();
      expect(logger.warn.mock.calls.some(c => c.some(p => String(p).includes('ADVERTENCIA DE SEGURIDAD')))).toBe(true);
      expect(logger.warn.mock.calls.some(c => c.some(p => String(p).includes('clave predeterminada')))).toBe(true);
    });
  });

  describe('startServer', () => {
    it('debería exportar función startServer', () => {
      expect(typeof server.startServer).toBe('function');
    });

    it('debería llamar a server.listen', () => {
      const originalListen = server.listen;
      let listenCalled = false;
      let callback = null;
      server.listen = (...args) => {
        listenCalled = true;
        callback = args[2];
        return server;
      };

      server.startServer('192.168.1.10');

      expect(listenCalled).toBe(true);
      expect(typeof callback).toBe('function');

      callback();
      expect(logger.info).toHaveBeenCalled();

      server.listen = originalListen;
    });
  });

  describe('resetForTests', () => {
    it('debería exportar función resetForTests', () => {
      expect(typeof server.resetForTests).toBe('function');
    });

    it('debería llamar a resetForTests sin errores', () => {
      expect(() => server.resetForTests()).not.toThrow();
    });
  });

  describe('server initialization', () => {
    it('debería ser un servidor http', () => {
      expect(server).toBeInstanceOf(http.Server);
    });
  });

  describe('shutdown', () => {
    it('debería exportar función shutdown', () => {
      expect(typeof server.shutdown).toBe('function');
    });

    it('debería llamar al callback sin errores', (done) => {
      server.shutdown(() => {
        // Vuelve a escuchar para no contaminar otros tests
        server.listen(0, '127.0.0.1', () => done());
      });
    }, 10000);
  });

  afterAll((done) => {
    server.close(done);
  });
});
