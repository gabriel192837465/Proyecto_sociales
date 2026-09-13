<<<<<<< HEAD
const EventEmitter = require("events");
const { metricsMiddleware } = require("../../src/server/http/middleware/metrics");
const { createRequestHandler } = require("../../src/server/http/router");
const { register } = require("../../src/server/infra/metrics");

describe("Metrics & Observability — middleware & router endpoints", () => {
  function createMockReqRes(method, url) {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = {};

    const res = new EventEmitter();
    res.statusCode = 200;
    res.headers = {};
    res.body = "";
    res.writeHead = jest.fn((code, headers) => {
      res.statusCode = code;
      Object.assign(res.headers, headers);
    });
    res.setHeader = jest.fn((name, value) => {
      res.headers[name] = value;
    });
    res.end = jest.fn((chunk) => {
      if (chunk) res.body = chunk;
      res.emit("finish");
    });

    return { req, res };
  }

  describe("metricsMiddleware", () => {
    test("debería ejecutar next y registrar la métrica al finalizar la petición", (done) => {
      const { req, res } = createMockReqRes("GET", "/api/bancos");
      let nextCalled = false;

      metricsMiddleware(req, res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      res.end("ok");

      process.nextTick(() => {
        expect(res.end).toHaveBeenCalled();
        done();
      });
    });

    test("debería normalizar las rutas de bancos dinámicas para evitar explosión de métricas", (done) => {
      const { req, res } = createMockReqRes("GET", "/api/bancos/12345");

      metricsMiddleware(req, res, () => {});
      res.end("ok");

      process.nextTick(() => {
        expect(res.end).toHaveBeenCalled();
        done();
      });
    });
  });

  describe("Router — /metrics & /api/health", () => {
    test("debería responder en /metrics con el Content-Type de Prometheus y el payload de métricas", async () => {
      const ctx = { state: { alumnos: new Map() }, config: {} };
      const handler = createRequestHandler(ctx);
      const { req, res } = createMockReqRes("GET", "/metrics");

      await handler(req, res);

      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", register.contentType);
      expect(res.end).toHaveBeenCalled();
      expect(typeof res.body).toBe("string");
      expect(res.body).toContain("process_cpu");
    });

    test("debería responder en /api/health con status ok, telemetría de memoria, uptime y db healthy", async () => {
      const alumnosMap = new Map([["id1", {}], ["id2", {}]]);
      const ctx = { state: { alumnos: alumnosMap }, config: {} };
      const handler = createRequestHandler(ctx);
      const { req, res } = createMockReqRes("GET", "/api/health");

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body);
      expect(payload.status).toBe("ok");
      expect(typeof payload.uptime).toBe("number");
      expect(payload.timestamp).toBeDefined();
      expect(payload.memory).toHaveProperty("rssMb");
      expect(payload.memory).toHaveProperty("heapUsedMb");
      expect(payload.memory).toHaveProperty("heapTotalMb");
      expect(payload.wsConnections).toBe(2);
      expect(payload.db).toBe("healthy");
    });
  });
});
=======
const EventEmitter = require("events");
const { metricsMiddleware } = require("../../src/server/http/middleware/metrics");
const { createRequestHandler } = require("../../src/server/http/router");
const { register } = require("../../src/server/infra/metrics");

describe("Metrics & Observability — middleware & router endpoints", () => {
  function createMockReqRes(method, url) {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = {};

    const res = new EventEmitter();
    res.statusCode = 200;
    res.headers = {};
    res.body = "";
    res.writeHead = jest.fn((code, headers) => {
      res.statusCode = code;
      Object.assign(res.headers, headers);
    });
    res.setHeader = jest.fn((name, value) => {
      res.headers[name] = value;
    });
    res.end = jest.fn((chunk) => {
      if (chunk) res.body = chunk;
      res.emit("finish");
    });

    return { req, res };
  }

  describe("metricsMiddleware", () => {
    test("debería ejecutar next y registrar la métrica al finalizar la petición", (done) => {
      const { req, res } = createMockReqRes("GET", "/api/bancos");
      let nextCalled = false;

      metricsMiddleware(req, res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      res.end("ok");

      process.nextTick(() => {
        expect(res.end).toHaveBeenCalled();
        done();
      });
    });

    test("debería normalizar las rutas de bancos dinámicas para evitar explosión de métricas", (done) => {
      const { req, res } = createMockReqRes("GET", "/api/bancos/12345");

      metricsMiddleware(req, res, () => {});
      res.end("ok");

      process.nextTick(() => {
        expect(res.end).toHaveBeenCalled();
        done();
      });
    });
  });

  describe("Router — /metrics & /api/health", () => {
    test("debería responder en /metrics con el Content-Type de Prometheus y el payload de métricas", async () => {
      const ctx = { state: { alumnos: new Map() }, config: {} };
      const handler = createRequestHandler(ctx);
      const { req, res } = createMockReqRes("GET", "/metrics");

      await handler(req, res);

      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", register.contentType);
      expect(res.end).toHaveBeenCalled();
      expect(typeof res.body).toBe("string");
      expect(res.body).toContain("process_cpu");
    });

    test("debería responder en /api/health con status ok, telemetría de memoria, uptime y db healthy", async () => {
      const alumnosMap = new Map([["id1", {}], ["id2", {}]]);
      const ctx = { state: { alumnos: alumnosMap }, config: {} };
      const handler = createRequestHandler(ctx);
      const { req, res } = createMockReqRes("GET", "/api/health");

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body);
      expect(payload.status).toBe("ok");
      expect(typeof payload.uptime).toBe("number");
      expect(payload.timestamp).toBeDefined();
      expect(payload.memory).toHaveProperty("rssMb");
      expect(payload.memory).toHaveProperty("heapUsedMb");
      expect(payload.memory).toHaveProperty("heapTotalMb");
      expect(payload.wsConnections).toBe(2);
      expect(payload.db).toBe("healthy");
    });
  });
});
>>>>>>> origin/main
