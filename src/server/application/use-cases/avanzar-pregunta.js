const { sendDocente, mostrarResultado, lanzarNuevaPregunta, buildRankingPayload } = require("../game-session");
const { getInformeDocente } = require("../../domain/game");
const { FASES, BROADCAST_BACKPRESSURE_THRESHOLD } = require("../../domain/constants");
const { guardarEstado } = require("../app-state");
const { broadcastDropsTotal } = require("../../infra/metrics");
const logger = require("../../infra/logger");
const crypto = require("node:crypto");

// REQ-WS-12: fin_juego personalizado. En lugar de un broadcast con rankings
// compartidos (que revelaría cada historial a todos), cada socket de alumno
// recibe SÓLO su propio `miHistorial`. El guard de backpressure y la identidad
// vía `state.alumnos.get(socket)` replican exactamente el patrón de
// `lanzarNuevaPregunta` en game-session.js.
function enviarFinPorSocket(state, msgBase) {
  if (!state.wss) return;
  const data = JSON.stringify(msgBase);
  state.wss.clients.forEach((c) => {
    if (c === state.docente) return;
    if (c.readyState !== 1) return;
    if (c.bufferedAmount >= BROADCAST_BACKPRESSURE_THRESHOLD) {
      broadcastDropsTotal.inc();
      logger.warn({ bufferedAmount: c.bufferedAmount }, "fin_juego: terminando conexion por backpressure");
      c.terminate();
      return;
    }
    const id = state.alumnos.get(c);
    const jugador = id ? state.estado.jugadores[id] : undefined;
    c.send(JSON.stringify({ ...msgBase, miHistorial: (jugador && jugador.historial) || [] }));
  });
}

function siguiente(state) {
  // REQ-GF-01 (D5): sólo se avanza desde RESULTADO. Fuera de esa fase la
  // llamada es no-op: sin mutación, sin emisiones, sin guardarEstado.
  // Evita corrupción tipo LOBBY→FIN y fin_juego duplicado.
  if (state.estado.fase !== FASES.RESULTADO) return;

  // El docente puede adelantar el autoavance con "Siguiente pregunta"
  // manualmente (control avanzado, sección 20) — cancelar el timer
  // pendiente para no avanzar dos veces.
  clearTimeout(state.autoAvanceTimer);
  state.autoAvanceTimer = null;

  state.estado.preguntaIdx++;
  if (state.estado.preguntaIdx >= state.estado.preguntasActivas.length) {
    state.estado.fase = FASES.FIN;
    const rp = buildRankingPayload(state.estado.jugadores);
    sendDocente(state, {
      tipo: "fin_juego",
      ranking: getInformeDocente(state.estado),
      rankingGeneral: rp.rankingGeneral,
    });
    enviarFinPorSocket(state, { tipo: "fin_juego", ...rp });
    guardarEstado(state.estado);
    return;
  }
  state.estado.pausado = false;
  state.estado.fase = FASES.PREGUNTA;
  state.estado.respuestasActuales = {};
  state.estado.totalJugadoresPregunta = Object.values(state.estado.jugadores).filter((j) => j.online !== false).length;
  for (const j of Object.values(state.estado.jugadores)) j.respondioActual = false;

  state.estado.tokens = state.estado.tokens || {};
  for (const [id, j] of Object.entries(state.estado.jugadores)) {
    if (j.online !== false) {
      state.estado.tokens[id] = crypto.randomBytes(24).toString("base64url");
    }
  }

  lanzarNuevaPregunta(state);
  guardarEstado(state.estado);
}

function mostrarResultadoManual(state) {
  if (state.estado.fase !== FASES.PREGUNTA) return;
  clearTimeout(state.timer);
  state.timer = null;
  mostrarResultado(state);
}

module.exports = { siguiente, mostrarResultadoManual };
