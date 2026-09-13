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

// ── Password hashing (cuentas de alumno) ──────────────────────────────────
// Usamos scrypt (nativo de Node, sin dependencias nuevas) en vez de bcrypt/argon2
// para no agregar paquetes al proyecto. Formato de almacenamiento:
// `scrypt:<saltHex>:<hashHex>`. N=16384 (2^14) es el default recomendado por
// Node para scrypt interactivo (balance costo/latencia razonable en server).
const SCRYPT_KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== "string") return false;
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  try {
    const candidate = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN);
    const expected = Buffer.from(hashHex, "hex");
    if (candidate.length !== expected.length) return false;
    return crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

module.exports = { safeEq, signId, verifySignedId, hashPassword, verifyPassword };
