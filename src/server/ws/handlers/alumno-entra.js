const { reconstruirEstado, registrarNuevo } = require("../../application/use-cases/reconectar-alumno");

function handleAlumnoEntra(ws, msg, state) {
  if (state.estado._shuttingDown) {
    ws.send(JSON.stringify({ tipo: "auth_rechazada", razon: "server_shutting_down" }));
    return;
  }
  const nombre = (msg.nombre || "").trim();
  if (!nombre) return;

  const existing = Object.hasOwn(state.estado.jugadores, msg.id)
    ? state.estado.jugadores[msg.id]
    : undefined;
  if (msg.id && existing && existing.nombre && existing.nombre.toLowerCase() === nombre.toLowerCase()) {
    reconstruirEstado(ws, state, msg.id, nombre, msg.token);
    return;
  }

  registrarNuevo(ws, msg, state);
}

module.exports = { handleAlumnoEntra };
