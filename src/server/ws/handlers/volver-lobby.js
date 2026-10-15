const { requireDocenteWs } = require("./helpers");
const { ejecutar: volverLobby } = require("../../application/use-cases/volver-lobby");

function handleVolverALobby(ws, _msg, state) {
  if (!requireDocenteWs(ws, state)) return;
  volverLobby(state);
}

module.exports = { handleVolverALobby };
