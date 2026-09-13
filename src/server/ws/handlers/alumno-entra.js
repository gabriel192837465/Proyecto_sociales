<<<<<<< HEAD
const { reconstruirEstado, registrarNuevo } = require("../../application/use-cases/reconectar-alumno");

function handleAlumnoEntra(ws, msg, state) {
  if (state.estado._shuttingDown) {
    ws.send(JSON.stringify({ tipo: "auth_rechazada", razon: "server_shutting_down" }));
    return;
  }

  // Código de partida (secciones 6/8/11 del pedido): una vez que el docente
  // creó una partida con `crear_partida`, el código de 6 dígitos es
  // obligatorio para entrar. Si todavía no se creó ninguna (codigoPartida
  // null), se mantiene el flujo histórico de entrada libre — compatibilidad
  // hacia atrás con el conjunto de tests existente y con partidas que no
  // usan este mecanismo todavía.
  if (state.estado.codigoPartida) {
    if (typeof msg.codigo !== "string" || msg.codigo !== state.estado.codigoPartida) {
      ws.send(JSON.stringify({ tipo: "codigo_invalido", mensaje: "Código de partida inválido o finalizado." }));
      return;
    }
  }

  // Una vez autenticado con cuenta, el alumno no vuelve a escribir su
  // nombre: se usa el nombre de usuario de la cuenta (sección 7).
  const nombre = ws.usuarioNombre || (msg.nombre || "").trim();
  if (!nombre) return;

  const existing = Object.hasOwn(state.estado.jugadores, msg.id)
    ? state.estado.jugadores[msg.id]
    : undefined;
  if (msg.id && existing && existing.nombre && existing.nombre.toLowerCase() === nombre.toLowerCase()) {
    reconstruirEstado(ws, state, msg.id, nombre, msg.token);
    return;
  }

  registrarNuevo(ws, { ...msg, nombre }, state);
}

module.exports = { handleAlumnoEntra };
=======
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
>>>>>>> origin/main
