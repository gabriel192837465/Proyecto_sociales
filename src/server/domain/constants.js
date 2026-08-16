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
