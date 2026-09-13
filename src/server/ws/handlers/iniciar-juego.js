<<<<<<< HEAD
const { requireDocenteWs } = require("./helpers");
const { ejecutar } = require("../../application/use-cases/iniciar-juego");

function handleIniciarJuego(ws, msg, state) {
  if (!requireDocenteWs(ws, state)) return;
  ejecutar(state, msg);
}

module.exports = { handleIniciarJuego };
=======
const { requireDocenteWs } = require("./helpers");
const { ejecutar } = require("../../application/use-cases/iniciar-juego");

function handleIniciarJuego(ws, msg, state) {
  if (!requireDocenteWs(ws, state)) return;
  ejecutar(state, msg);
}

module.exports = { handleIniciarJuego };
>>>>>>> origin/main
