const config = require("../../config");

function applyCors(req, res) {
  const origin = req.headers.origin;
  const hasToken = req.headers["x-admin-token"] || req.headers["authorization"];

  if (hasToken) {
    const allowedStr = process.env.CORS_ALLOWED_ORIGINS;
    if (allowedStr !== undefined) {
      const allowedOrigins = allowedStr.split(",").map(o => o.trim()).filter(Boolean);
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }
    } else {
      // Default: same-origin check
      const host = req.headers.host;
      if (origin && host) {
        let isSameOrigin = false;
        try {
          const originUrl = new URL(origin);
          if (originUrl.host === host) {
            isSameOrigin = true;
          }
        } catch {}
        if (isSameOrigin) {
          res.setHeader("Access-Control-Allow-Origin", origin);
          res.setHeader("Access-Control-Allow-Credentials", "true");
        }
      }
    }
  } else {
    // Keep original behavior when no token is present
    if (config.ALLOWED_ORIGINS && config.ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token");
}

function handleOptions(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

module.exports = {
  applyCors,
  handleOptions
};
