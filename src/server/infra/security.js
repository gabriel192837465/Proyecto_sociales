const crypto = require("node:crypto");

function safeEq(a, b) {
  if (Buffer.isBuffer(a) && Buffer.isBuffer(b)) {
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
  const ab = Buffer.from(String(a ?? ""));
  const bb = Buffer.from(String(b ?? ""));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// R4-001: la cookie de identidad del alumno se firma con HMAC-SHA256 para que
// un UUID público (viaja en los rankings) no pueda forjarse a mano como cookie
// de otro jugador. Formato del valor de cookie: `<id>.<sig base64url>`.
function signId(id, secret) {
  const sig = crypto.createHmac("sha256", secret).update(String(id)).digest("base64url");
  return `${id}.${sig}`;
}

// Devuelve el id si `value` es `<id>.<sig>` con firma HMAC válida (timing-safe
// compare), null si la firma falta, está corrupta o fue generada con otro
// secret. La cookie vieja sin firma cae en null → identidad nueva.
function verifySignedId(value, secret) {
  if (typeof value !== "string") return null;
  const dot = value.indexOf(".");
  if (dot <= 0 || dot === value.length - 1) return null;
  const id = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret).update(id).digest("base64url");
  return safeEq(sig, expected) ? id : null;
}

module.exports = { safeEq, signId, verifySignedId };
