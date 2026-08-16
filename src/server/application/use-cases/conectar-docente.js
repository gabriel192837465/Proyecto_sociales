const { safeEq } = require("../../infra/security");
const { buildPayload } = require("./reconectar-docente");
const { iniciarTimer, broadcast, sendDocente } = require("../game-session");
const { FASES } = require("../../domain/constants");

function ejecutar(ws, msg, state, ctx) {
  if (!safeEq(msg.token, ctx.adminToken)) {
    ws.send(JSON.stringify({ tipo: "error", msg: "Clave de docente incorrecta." }));
    ws.close();
    return;
  }
  if (state.docente && state.docente !== ws) {
    try { state.docente.close(); } catch { /* ya cerrado */ }
  }
  state.docente = ws;
  ws.esDocenteAutenticado = true;

  // Si la partida fue auto-pausada por desconexión del docente, reanudar
  if (state.autoPausado === true) {
    state.autoPausado = false;
    // Si el juego ya terminó, no reanudar — solo enviar estado final
    if (state.estado.fase === FASES.FIN) {
      const payload = buildPayload(state, ctx);
      ws.send(JSON.stringify(payload));
      return;
    }
    state.estado.pausado = false;
    iniciarTimer(state, true);
    broadcast(state, { tipo: "juego_reanudado", tiempo: state.estado.tiempoRestante });
    const payload = buildPayload(state, ctx);
    ws.send(JSON.stringify(payload));
    return;
  }

  const payload = buildPayload(state, ctx);
  ws.send(JSON.stringify(payload));

  if (state.snapshotRecuperado) {
    ws.send(JSON.stringify({
      tipo: "partida_recuperada",
      fase: state.estado.fase,
      preguntaIdx: state.estado.preguntaIdx,
      preguntaActual: state.estado.preguntasActivas[state.estado.preguntaIdx] || null,
      jugadores: Object.values(state.estado.jugadores).map((j) => ({
        id: j.id,
        nombre: j.nombre,
        puntaje: j.puntaje,
        puntajeGeneral: j.puntajeGeneral,
      })),
    }));
  }
}

module.exports = { ejecutar };
