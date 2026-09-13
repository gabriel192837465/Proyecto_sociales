const { requireDocenteWs } = require("./helpers");
const { ejecutar } = require("../../application/use-cases/crear-partida");

function handleCrearPartida(ws, msg, state) {
  if (!requireDocenteWs(ws, state)) return;
  ejecutar(state, msg);
}

module.exports = { handleCrearPartida };
