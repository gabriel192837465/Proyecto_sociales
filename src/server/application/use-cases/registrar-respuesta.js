const { esOpcionValida } = require("../../domain/game");
const { sendDocente, broadcast, mostrarResultado } = require("../game-session");
const { FASES } = require("../../domain/constants");

function enviarRechazo(ws, razon) {
  ws.send(JSON.stringify({ tipo: "respuesta_rechazada", razon }));
}

function ejecutar(ws, msg, state) {
  const id = state.alumnos.get(ws);
  const j = id && state.estado.jugadores[id];
  if (!j)                                  { enviarRechazo(ws, "no_sesion");        return false; }
  if (state.estado.fase !== FASES.PREGUNTA) { enviarRechazo(ws, "fase_invalida");   return false; }
  if (state.estado.pausado)                { enviarRechazo(ws, "pausado");          return false; }
  if (j.respondioActual)                   { enviarRechazo(ws, "ya_respondio");     return false; }
  const opcion = Number(msg.opcion);
  if (!esOpcionValida(opcion)) {
    enviarRechazo(ws, "opcion_invalida");
    return false;
  }
  j.respondioActual = true;
  state.estado.respuestasActuales[id] = opcion;
  const total = state.estado.totalJugadoresPregunta;
  const respondieron = Object.keys(state.estado.respuestasActuales).length;
  ws.send(JSON.stringify({ tipo: "respuesta_ok" }));
  sendDocente(state, {
    tipo: "progreso_respuestas",
    respondieron,
    total,
    respondieronIds: Object.keys(state.estado.respuestasActuales)
  });
  if (respondieron >= total) {
    clearTimeout(state.timer);
    state.timer = null;
    mostrarResultado(state);
  }
  return true;
}

module.exports = { ejecutar };
