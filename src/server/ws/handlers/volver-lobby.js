const { requireDocenteWs } = require("./helpers");
const { ejecutar: volverLobby } = require("../../application/use-cases/volver-lobby");
const { ejecutar: reiniciarRanking } = require("../../application/use-cases/reiniciar-ranking");

function handleVolverALobby(ws, _msg, state) {
  if (!requireDocenteWs(ws, state)) return;
  volverLobby(state);
}

function handleReiniciarRankingGeneral(ws, _msg, state) {
  if (!requireDocenteWs(ws, state)) return;
  reiniciarRanking(state);
}

module.exports = { handleVolverALobby, handleReiniciarRankingGeneral };
