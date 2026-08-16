const { ejecutar } = require("../../application/use-cases/cambiar-nombre");

function handleCambiarNombre(ws, msg, state) {
  ejecutar(ws, msg, state);
}

module.exports = { ejecutar: handleCambiarNombre, handleCambiarNombre };
