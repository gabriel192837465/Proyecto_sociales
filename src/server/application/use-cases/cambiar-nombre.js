const { sendDocente, broadcast, buildRankingPayload } = require("../game-session");

function ejecutar(ws, msg, state) {
  const nuevoNombre = (msg.nombre || "").trim();
  if (!nuevoNombre) return;
  if (nuevoNombre.length > 50) return;

  const id = state.alumnos.get(ws);
  if (!id) return;

  const jugador = state.estado.jugadores[id];
  if (!jugador) return;

  // Verificar que el nuevo nombre no esté en uso por otro jugador online
  const nombreEnUso = Object.entries(state.estado.jugadores).some(
    ([jid, j]) => jid !== id && j.nombre.toLowerCase() === nuevoNombre.toLowerCase() && j.online !== false
  );
  if (nombreEnUso) {
    ws.send(JSON.stringify({ tipo: "error_nombre", msg: "Ese nombre ya está en uso. Probá con otro." }));
    return;
  }

  const oldNombre = jugador.nombre;
  jugador.nombre = nuevoNombre;

  // Notificar al alumno
  ws.send(JSON.stringify({
    tipo: "nombre_cambiado",
    oldNombre,
    nombre: nuevoNombre
  }));

  // Notificar al docente
  sendDocente(state, {
    tipo: "nombre_cambiado",
    id,
    oldNombre,
    nuevoNombre,
    ...buildRankingPayload(state.estado.jugadores),
  });

  // Notificar a los demás alumnos (remover viejo, agregar nuevo)
  broadcast(state, { tipo: "jugador_salio_alumno", nombre: oldNombre }, ws);
  broadcast(state, { tipo: "jugador_unido_alumno", nombre: nuevoNombre }, ws);
}

module.exports = { ejecutar };
