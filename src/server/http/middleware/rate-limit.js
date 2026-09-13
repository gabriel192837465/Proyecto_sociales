<<<<<<< HEAD
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 120;

const hits = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, { windowStart }] of hits) {
    if (now - windowStart > WINDOW_MS) {
      hits.delete(key);
    }
  }
}, 30 * 1000).unref();

function rateLimit(req, res, options = {}) {
  const trustProxy = options.trustProxy === true;
  const key = trustProxy && req.headers["x-forwarded-for"]
    ? String(req.headers["x-forwarded-for"]).split(",")[0].trim()
    : req.socket.remoteAddress || "unknown";
  const now = Date.now();
  let entry = hits.get(key);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    hits.set(key, entry);
  }

  entry.count++;
  res.setHeader("X-RateLimit-Limit", MAX_REQUESTS);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, MAX_REQUESTS - entry.count));
  res.setHeader("X-RateLimit-Reset", Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000));

  if (entry.count > MAX_REQUESTS) {
    res.writeHead(429, { "Content-Type": "application/json; charset=utf-8", "Retry-After": "60" });
    res.end(JSON.stringify({ error: "Demasiadas solicitudes. Intentá de nuevo en 60 segundos." }));
    return false;
  }
  return true;
}

module.exports = { rateLimit };
=======
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 120;

const hits = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, { windowStart }] of hits) {
    if (now - windowStart > WINDOW_MS) {
      hits.delete(key);
    }
  }
}, 30 * 1000).unref();

function rateLimit(req, res, options = {}) {
  const trustProxy = options.trustProxy === true;
  const key = trustProxy && req.headers["x-forwarded-for"]
    ? String(req.headers["x-forwarded-for"]).split(",")[0].trim()
    : req.socket.remoteAddress || "unknown";
  const now = Date.now();
  let entry = hits.get(key);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    hits.set(key, entry);
  }

  entry.count++;
  res.setHeader("X-RateLimit-Limit", MAX_REQUESTS);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, MAX_REQUESTS - entry.count));
  res.setHeader("X-RateLimit-Reset", Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000));

  if (entry.count > MAX_REQUESTS) {
    res.writeHead(429, { "Content-Type": "application/json; charset=utf-8", "Retry-After": "60" });
    res.end(JSON.stringify({ error: "Demasiadas solicitudes. Intentá de nuevo en 60 segundos." }));
    return false;
  }
  return true;
}

module.exports = { rateLimit };
>>>>>>> origin/main
