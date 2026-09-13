const { requireDocenteWs } = require("./helpers");
const { siguiente, mostrarResultadoManual } = require("../../application/use-cases/avanzar-pregunta");

function handleSiguientePregunta(ws, _msg, state) {
  if (!requireDocenteWs(ws, state)) return;
  siguiente(state);
}

function handleMostrarResultadoManual(ws, _msg, state) {
  if (!requireDocenteWs(ws, state)) return;
  mostrarResultadoManual(state);
}

module.exports = { handleSiguientePregunta, handleMostrarResultadoManual };
