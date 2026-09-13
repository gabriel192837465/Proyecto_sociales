const { ejecutar } = require("../../application/use-cases/recuperar-partida");

function handleRecuperarPartida(ws, msg, state) {
  ejecutar(ws, msg, state);
}

module.exports = { ejecutar: handleRecuperarPartida, handleRecuperarPartida };
