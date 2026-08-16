const crypto = require("node:crypto");
const logger = require("./infra/logger");

const config = {
  PORT: parseInt(process.env.PORT, 10) || 3000,
  HISTORIA_ADMIN_TOKEN: process.env.HISTORIA_ADMIN_TOKEN || (() => { logger.fatal("HISTORIA_ADMIN_TOKEN no está definido. Asignalo en .env"); process.exit(1); })(),
  // R4-001: secreto para firmar la cookie de identidad (HMAC-SHA256). Si no
  // está definido se genera uno aleatorio por arranque. Eso es aceptable sólo
  // para desarrollo local SIN persistencia: en deploy con crash-recovery cada
  // reinicio invalida las cookies firmadas, los alumnos reciben un id nuevo y
  // el jugador fantasma del snapshot restaurado bloquea el re-registro con
  // error_nombre (lockout del auto-reconnect, partida recuperada sin alumnos).
  // Por eso docker-compose.yml exige la variable (deploy canónico).
  COOKIE_SECRET: process.env.HISTORIA_COOKIE_SECRET || (() => {
    const secret = crypto.randomBytes(32).toString("hex");
    logger.warn("HISTORIA_COOKIE_SECRET no está definido: usando secreto aleatorio por arranque. Las cookies de identidad NO sobrevivirán reinicios: tras un restart (crash-recovery) los alumnos recibirán un id nuevo y chocarán con error_nombre contra el jugador fantasma del snapshot (reconexión y reanudar rotos). Definilo en .env para producción (ej: openssl rand -hex 32)");
    return secret;
  })(),
  TRUST_PROXY: process.env.TRUST_PROXY === "true",
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    : null,
};

module.exports = config;
