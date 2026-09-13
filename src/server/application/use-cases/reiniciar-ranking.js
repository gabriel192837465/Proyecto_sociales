<<<<<<< HEAD
const { sendDocente, broadcast } = require("../game-session");
const { getRankingGeneral } = require("../../domain/game");
const { guardarEstado } = require("../app-state");

function ejecutar(state) {
  for (const j of Object.values(state.estado.jugadores)) j.puntajeGeneral = 0;
  const rg = getRankingGeneral(state.estado.jugadores);
  sendDocente(state, { tipo: "ranking_general_reiniciado", rankingGeneral: rg });
  broadcast(state, { tipo: "ranking_general_reiniciado", rankingGeneral: rg });
  guardarEstado(state.estado);
}

module.exports = { ejecutar };
=======
const { sendDocente, broadcast } = require("../game-session");
const { getRankingGeneral } = require("../../domain/game");
const { guardarEstado } = require("../app-state");

function ejecutar(state) {
  for (const j of Object.values(state.estado.jugadores)) j.puntajeGeneral = 0;
  const rg = getRankingGeneral(state.estado.jugadores);
  sendDocente(state, { tipo: "ranking_general_reiniciado", rankingGeneral: rg });
  broadcast(state, { tipo: "ranking_general_reiniciado", rankingGeneral: rg });
  guardarEstado(state.estado);
}

module.exports = { ejecutar };
>>>>>>> origin/main
