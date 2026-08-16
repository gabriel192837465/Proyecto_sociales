const { sendDocente, broadcast, lanzarNuevaPregunta, buildRankingPayload } = require("../game-session");
const { FASES, MIN_TIEMPO_PREGUNTA, MAX_TIEMPO_PREGUNTA, TIEMPO_DEFAULT } = require("../../domain/constants");
const { borrarSnapshot, guardarEstado } = require("../app-state");

function ejecutar(state, msg) {
  if (!msg.bancoId) {
    sendDocente(state, { tipo: "error", msg: "Seleccioná un banco de preguntas." });
    return false;
  }
  // Purge stale players before starting — remove any player whose WS connection
  // is no longer active (not in state.alumnos map), explicitly marked offline,
  // or whose WS readyState is not OPEN (connection silently dropped).
  const OPEN = 1; // WebSocket.OPEN
  const wsById = new Map();
  state.alumnos.forEach((id, ws) => { wsById.set(id, ws); });
  for (const [id, j] of Object.entries(state.estado.jugadores)) {
    const ws = wsById.get(id);
    const wsAlive = ws && ws.readyState === OPEN;
    if (j.online === false || !wsAlive) {
      delete state.estado.jugadores[id];
      state.alumnos.forEach((v, k) => { if (v === id) state.alumnos.delete(k); });
      // R4-002: el jugador purgado ya no tiene socket vigente
      state.alumnoSocketPorId.delete(id);
    }
  }
  const onlineCount = Object.values(state.estado.jugadores).filter((j) => j.online !== false).length;
  if (!onlineCount) {
    sendDocente(state, { tipo: "error", msg: "No hay alumnos conectados. Esperá a que se conecten antes de iniciar." });
    return false;
  }
  borrarSnapshot();
  const banco = state.db.bancos.find((b) => b.id === msg.bancoId);
  if (!banco || banco.preguntas.length === 0) {
    sendDocente(state, { tipo: "error", msg: "El banco seleccionado está vacío." });
    return false;
  }

  const tNum = Number(msg.tiempoPorPregunta);
  state.estado.tiempoPorPregunta =
    Number.isInteger(tNum) && tNum >= MIN_TIEMPO_PREGUNTA && tNum <= MAX_TIEMPO_PREGUNTA
      ? tNum
      : TIEMPO_DEFAULT;
  state.estado.pausado = false;
  state.estado.respuestasActuales = {};
  for (const j of Object.values(state.estado.jugadores)) {
    j.puntaje = 0;
    j.respondioActual = false;
    j.historial = [];
  }
  state.estado.preguntasActivas = [...banco.preguntas];

  const payload = {
    ...buildRankingPayload(state.estado.jugadores),
    totalPreguntas: banco.preguntas.length,
    bancoNombre: banco.nombre,
    tiempoPorPregunta: state.estado.tiempoPorPregunta,
  };
  sendDocente(state, { tipo: "juego_reiniciado", ...payload });
  broadcast(state, {
    tipo: "juego_reiniciado",
    tiempoPorPregunta: state.estado.tiempoPorPregunta
  });

  state.estado.totalJugadoresPregunta = Object.values(state.estado.jugadores).filter((j) => j.online !== false).length;
  state.estado.preguntaIdx = 0;
  state.estado.fase = FASES.PREGUNTA;
  lanzarNuevaPregunta(state);
  guardarEstado(state.estado);
  return true;
}

module.exports = { ejecutar };
