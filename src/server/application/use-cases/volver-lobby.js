const { sendDocente, broadcast, buildRankingPayload } = require("../game-session");
const { FASES } = require("../../domain/constants");
const { borrarSnapshot } = require("../app-state");

function ejecutar(state) {
  clearTimeout(state.timer);
  state.timer = null;
  clearTimeout(state.autoAvanceTimer);
  state.autoAvanceTimer = null;
  state.estado.fase = FASES.LOBBY;
  state.estado.preguntaIdx = -1;
  state.estado.respuestasActuales = {};
  state.estado.pausado = false;
  // Purge offline players — they accumulated from previous games
  // and their WS connections are already closed.
  for (const [id, j] of Object.entries(state.estado.jugadores)) {
    if (j.online === false) {
      delete state.estado.jugadores[id];
      state.alumnos.forEach((v, k) => { if (v === id) state.alumnos.delete(k); });
      // R4-002: el jugador purgado ya no tiene socket vigente
      state.alumnoSocketPorId.delete(id);
    }
  }
  for (const j of Object.values(state.estado.jugadores)) {
    j.puntaje = 0;
    j.respondioActual = false;
    j.historial = [];
  }
  sendDocente(state, {
    tipo: "volver_a_lobby",
    ...buildRankingPayload(state.estado.jugadores),
  });
  broadcast(state, { tipo: "volver_a_lobby" });
  borrarSnapshot();
}

module.exports = { ejecutar };
