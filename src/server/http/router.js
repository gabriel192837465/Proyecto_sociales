<<<<<<< HEAD
const { applyCors, handleOptions } = require("./middleware/cors");
const { rateLimit } = require("./middleware/rate-limit");
const { applySecurityHeaders } = require("./middleware/security-headers");
const { metricsMiddleware } = require("./middleware/metrics");
const { handleBancosApi } = require("./controllers/bancos.controller");
const { handleAuthApi } = require("./controllers/auth.controller");
const { handleStatic } = require("./static");
const { register } = require("../infra/metrics");

function json(res, data, code = 200) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function createRequestHandler(ctx) {
  return async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname;

    applyCors(req, res);
    applySecurityHeaders(res);

    if (handleOptions(req, res)) return;

    if (handleAuthApi(req, res, pathname, ctx)) return;

    // /metrics endpoint — no auth required, Prometheus scrapes it
    if (pathname === "/metrics") {
      res.setHeader("Content-Type", register.contentType);
      res.end(await register.metrics());
      return;
    }



    if (pathname === "/api/health") {
      const mem = process.memoryUsage();
      const wsCount = ctx?.state?.alumnos ? ctx.state.alumnos.size : 0;
      return json(res, {
        status: "ok",
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        memory: {
          rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
          heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
          heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
        },
        wsConnections: wsCount,
        db: "healthy"
      });
    }

    if (pathname.startsWith("/api/")) {
      metricsMiddleware(req, res, () => {
        if (!rateLimit(req, res, { trustProxy: ctx.config?.TRUST_PROXY })) return;
        return handleBancosApi(req, res, pathname, ctx);
      });
      return;
    }

    handleStatic(req, res, pathname);
  };
}

module.exports = {
  createRequestHandler
};
=======
const { applyCors, handleOptions } = require("./middleware/cors");
const { rateLimit } = require("./middleware/rate-limit");
const { applySecurityHeaders } = require("./middleware/security-headers");
const { metricsMiddleware } = require("./middleware/metrics");
const { handleBancosApi } = require("./controllers/bancos.controller");
const { handleAuthApi } = require("./controllers/auth.controller");
const { handleStatic } = require("./static");
const { register } = require("../infra/metrics");

function json(res, data, code = 200) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function createRequestHandler(ctx) {
  return async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname;

    applyCors(req, res);
    applySecurityHeaders(res);

    if (handleOptions(req, res)) return;

    if (handleAuthApi(req, res, pathname)) return;

    // /metrics endpoint — no auth required, Prometheus scrapes it
    if (pathname === "/metrics") {
      res.setHeader("Content-Type", register.contentType);
      res.end(await register.metrics());
      return;
    }



    if (pathname === "/api/health") {
      const mem = process.memoryUsage();
      const wsCount = ctx?.state?.alumnos ? ctx.state.alumnos.size : 0;
      return json(res, {
        status: "ok",
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        memory: {
          rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
          heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
          heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
        },
        wsConnections: wsCount,
        db: "healthy"
      });
    }

    if (pathname.startsWith("/api/")) {
      metricsMiddleware(req, res, () => {
        if (!rateLimit(req, res, { trustProxy: ctx.config?.TRUST_PROXY })) return;
        return handleBancosApi(req, res, pathname, ctx);
      });
      return;
    }

    handleStatic(req, res, pathname);
  };
}

module.exports = {
  createRequestHandler
};
>>>>>>> origin/main
