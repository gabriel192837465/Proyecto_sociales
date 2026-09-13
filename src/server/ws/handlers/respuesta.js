const { ejecutar } = require("../../application/use-cases/registrar-respuesta");

function handleRespuesta(ws, msg, state) {
  ejecutar(ws, msg, state);
}

module.exports = { handleRespuesta };
