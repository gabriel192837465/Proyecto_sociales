<<<<<<< HEAD
const FASES = Object.freeze({
  LOBBY: "lobby",
  PREGUNTA: "pregunta",
  RESULTADO: "resultado",
  FIN: "fin"
});

const PUNTAJE_RESPUESTA_CORRECTA = 100;
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS) || 30000;
const MIN_TIEMPO_PREGUNTA = 5;
const MAX_TIEMPO_PREGUNTA = 120;
const TIEMPO_DEFAULT = 20;
const MAX_BODY_SIZE = 512 * 1024;
const MAX_WS_PAYLOAD = 512 * 1024;
const BROADCAST_BACKPRESSURE_THRESHOLD = 64 * 1024; // 64KB — skip send if bufferedAmount exceeds this
const TIMER_TICK_MS = 1000;
// Sección 15/17: pausa entre RESULTADO y la siguiente pregunta antes del
// autoavance controlado por servidor (no por el navegador).
const AUTO_AVANCE_RESULTADO_MS = 2500;

const LETRAS = ["A", "B", "C", "D"];

// Dominio institucional obligatorio para cuentas de alumno (Trivia ET29).
const EMAIL_DOMINIO_INSTITUCIONAL = "@alu.tecnica29de6.edu.ar";
const PASSWORD_MIN_LENGTH = 8;
const NOMBRE_USUARIO_MIN_LENGTH = 3;
const NOMBRE_USUARIO_MAX_LENGTH = 24;

module.exports = {
  FASES,
  PUNTAJE_RESPUESTA_CORRECTA,
  HEARTBEAT_INTERVAL_MS,
  MIN_TIEMPO_PREGUNTA,
  MAX_TIEMPO_PREGUNTA,
  TIEMPO_DEFAULT,
  MAX_BODY_SIZE,
  MAX_WS_PAYLOAD,
  BROADCAST_BACKPRESSURE_THRESHOLD,
  TIMER_TICK_MS,
  AUTO_AVANCE_RESULTADO_MS,
  LETRAS,
  EMAIL_DOMINIO_INSTITUCIONAL,
  PASSWORD_MIN_LENGTH,
  NOMBRE_USUARIO_MIN_LENGTH,
  NOMBRE_USUARIO_MAX_LENGTH
};
=======
const FASES = Object.freeze({
  LOBBY: "lobby",
  PREGUNTA: "pregunta",
  RESULTADO: "resultado",
  FIN: "fin"
});

const PUNTAJE_RESPUESTA_CORRECTA = 100;
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS) || 30000;
const MIN_TIEMPO_PREGUNTA = 5;
const MAX_TIEMPO_PREGUNTA = 120;
const TIEMPO_DEFAULT = 20;
const MAX_BODY_SIZE = 512 * 1024;
const MAX_WS_PAYLOAD = 512 * 1024;
const BROADCAST_BACKPRESSURE_THRESHOLD = 64 * 1024; // 64KB — skip send if bufferedAmount exceeds this
const TIMER_TICK_MS = 1000;

const LETRAS = ["A", "B", "C", "D"];

module.exports = {
  FASES,
  PUNTAJE_RESPUESTA_CORRECTA,
  HEARTBEAT_INTERVAL_MS,
  MIN_TIEMPO_PREGUNTA,
  MAX_TIEMPO_PREGUNTA,
  TIEMPO_DEFAULT,
  MAX_BODY_SIZE,
  MAX_WS_PAYLOAD,
  BROADCAST_BACKPRESSURE_THRESHOLD,
  TIMER_TICK_MS,
  LETRAS
};
>>>>>>> origin/main
