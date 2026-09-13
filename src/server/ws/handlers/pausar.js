<<<<<<< HEAD
const { requireDocenteWs } = require("./helpers");
const { ejecutar } = require("../../application/use-cases/alternar-pausa");

function handleAlternarPausa(ws, _msg, state) {
  if (!requireDocenteWs(ws, state)) return;
  ejecutar(state);
}

module.exports = { handleAlternarPausa };
=======
const { requireDocenteWs } = require("./helpers");
const { ejecutar } = require("../../application/use-cases/alternar-pausa");

function handleAlternarPausa(ws, _msg, state) {
  if (!requireDocenteWs(ws, state)) return;
  ejecutar(state);
}

module.exports = { handleAlternarPausa };
>>>>>>> origin/main
