<<<<<<< HEAD
const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
  ".woff2":"font/woff2"
};

const PUBLIC_DIR = path.join(__dirname, "..", "..", "..", "public");
const CLIENT_DIR = path.join(__dirname, "..", "..", "..", "src", "client");

function safeResolve(pathname) {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const isJs = rel.startsWith("/js/");
  const root = isJs ? CLIENT_DIR : PUBLIC_DIR;
  const adjustedRel = isJs ? rel.slice(4) : rel; // strip "/js/"
  const resolved = path.normalize(path.join(root, adjustedRel));
  if (resolved === root) return null;
  return resolved.startsWith(root + path.sep) ? resolved : null;
}

function handleStatic(req, res, pathname) {
  const filePath = safeResolve(pathname);
  if (!filePath) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ error: "No encontrado" }));
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=3600"
    });
    res.end(data);
  });
}

module.exports = {
  handleStatic
};
=======
const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
  ".woff2":"font/woff2"
};

const PUBLIC_DIR = path.join(__dirname, "..", "..", "..", "public");
const CLIENT_DIR = path.join(__dirname, "..", "..", "..", "src", "client");

function safeResolve(pathname) {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const isJs = rel.startsWith("/js/");
  const root = isJs ? CLIENT_DIR : PUBLIC_DIR;
  const adjustedRel = isJs ? rel.slice(4) : rel; // strip "/js/"
  const resolved = path.normalize(path.join(root, adjustedRel));
  if (resolved === root) return null;
  return resolved.startsWith(root + path.sep) ? resolved : null;
}

function handleStatic(req, res, pathname) {
  const filePath = safeResolve(pathname);
  if (!filePath) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ error: "No encontrado" }));
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=3600"
    });
    res.end(data);
  });
}

module.exports = {
  handleStatic
};
>>>>>>> origin/main
