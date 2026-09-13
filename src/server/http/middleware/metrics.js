<<<<<<< HEAD
const { httpRequestsTotal, httpRequestDuration } = require('../../infra/metrics');

function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const duration = Number(process.hrtime.bigint() - start) / 1e9;
    const path = normalizePath(req.url);
    httpRequestsTotal.inc({ method: req.method, path, status: res.statusCode });
    httpRequestDuration.observe({ method: req.method, path }, duration);
  });
  next();
}

function normalizePath(url) {
  // Normalize dynamic paths to prevent label explosion
  if (url.startsWith('/api/bancos/')) return '/api/bancos/:id';
  if (!url.startsWith('/api/') && url !== '/login' && url !== '/metrics' && url !== '/api/health') return '/static';
  // Strip query string
  const idx = url.indexOf('?');
  return idx !== -1 ? url.slice(0, idx) : url;
}

module.exports = { metricsMiddleware };
=======
const { httpRequestsTotal, httpRequestDuration } = require('../../infra/metrics');

function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const duration = Number(process.hrtime.bigint() - start) / 1e9;
    const path = normalizePath(req.url);
    httpRequestsTotal.inc({ method: req.method, path, status: res.statusCode });
    httpRequestDuration.observe({ method: req.method, path }, duration);
  });
  next();
}

function normalizePath(url) {
  // Normalize dynamic paths to prevent label explosion
  if (url.startsWith('/api/bancos/')) return '/api/bancos/:id';
  if (!url.startsWith('/api/') && url !== '/login' && url !== '/metrics' && url !== '/api/health') return '/static';
  // Strip query string
  const idx = url.indexOf('?');
  return idx !== -1 ? url.slice(0, idx) : url;
}

module.exports = { metricsMiddleware };
>>>>>>> origin/main
