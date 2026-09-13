<<<<<<< HEAD
const { borrarSnapshot } = require("../app-state");
const { sendDocente, broadcast, buildRankingPayload, buildNuevaPreguntaMsg, iniciarTimer } = require("../game-session");
const { crearEstadoInicial } = require("../../domain/game");
const { FASES } = require("../../domain/constants");
const logger = require("../../infra/logger");

function ejecutar(ws, msg, state) {
  if (ws !== state.docente) return;

  if (msg.accion === "descartar") {
    borrarSnapshot();
    state.estado = crearEstadoInicial();
    state.snapshotRecuperado = false;
    sendDocente(state, {
      tipo: "partida_descartada",
      ...buildRankingPayload(state.estado.jugadores),
    });
    logger.info("Docente descartó la partida recuperada");
    return;
  }

  if (msg.accion === "reanudar") {
    state.snapshotRecuperado = false;
    const rankingPayload = buildRankingPayload(state.estado.jugadores);

    sendDocente(state, {
      tipo: "partida_reanudada",
      fase: state.estado.fase,
      preguntaIdx: state.estado.preguntaIdx,
      ...rankingPayload,
    });

    broadcast(state, {
      tipo: "partida_reanudada",
      mensaje: "La partida se ha reanudado. Tus puntos se han conservado.",
      ...rankingPayload,
    });

    // Si había una pregunta activa, reenviarla con el shape canónico
    // (REQ-WS-10): idx/epoca, sin `nro` — pantalla-pregunta renderiza
    // `idx+1/total` y el tag de época.
    if (state.estado.fase === FASES.PREGUNTA || state.estado.fase === FASES.RESULTADO) {
      const p = state.estado.preguntasActivas[state.estado.preguntaIdx];
      if (p) {
        const msgPregunta = buildNuevaPreguntaMsg(state);
        broadcast(state, msgPregunta);
        sendDocente(state, {
          ...msgPregunta,
          correcta: p.correcta,
          totalJugadores: state.estado.totalJugadoresPregunta,
        });
      }
    }

    // D2 (REQ-SP-08): tras un SIGKILL mid-round el timer reinicia desde el
    // último tiempo persistido. guardarEstado no persiste por tick, así que
    // normalmente es la duración completa — decisión aceptada, no se persigue
    // el remanente por tick. Pausado o RESULTADO → sin timer.
    if (state.estado.fase === FASES.PREGUNTA && !state.estado.pausado) {
      iniciarTimer(state, true);
    }

    logger.info("Docente reanudó la partida recuperada (fase=%s)", state.estado.fase);
    return;
  }

  sendDocente(state, { tipo: "error", msg: 'Acción inválida. Usá "reanudar" o "descartar".' });
}

module.exports = { ejecutar };
=======
const { borrarSnapshot } = require("../app-state");
const { sendDocente, broadcast, buildRankingPayload, buildNuevaPreguntaMsg, iniciarTimer } = require("../game-session");
const { crearEstadoInicial } = require("../../domain/game");
const { FASES } = require("../../domain/constants");
const logger = require("../../infra/logger");

function ejecutar(ws, msg, state) {
  if (ws !== state.docente) return;

  if (msg.accion === "descartar") {
    borrarSnapshot();
    state.estado = crearEstadoInicial();
    state.snapshotRecuperado = false;
    sendDocente(state, {
      tipo: "partida_descartada",
      ...buildRankingPayload(state.estado.jugadores),
    });
    logger.info("Docente descartó la partida recuperada");
    return;
  }

  if (msg.accion === "reanudar") {
    state.snapshotRecuperado = false;
    const rankingPayload = buildRankingPayload(state.estado.jugadores);

    sendDocente(state, {
      tipo: "partida_reanudada",
      fase: state.estado.fase,
      preguntaIdx: state.estado.preguntaIdx,
      ...rankingPayload,
    });

    broadcast(state, {
      tipo: "partida_reanudada",
      mensaje: "La partida se ha reanudado. Tus puntos se han conservado.",
      ...rankingPayload,
    });

    // Si había una pregunta activa, reenviarla con el shape canónico
    // (REQ-WS-10): idx/epoca, sin `nro` — pantalla-pregunta renderiza
    // `idx+1/total` y el tag de época.
    if (state.estado.fase === FASES.PREGUNTA || state.estado.fase === FASES.RESULTADO) {
      const p = state.estado.preguntasActivas[state.estado.preguntaIdx];
      if (p) {
        const msgPregunta = buildNuevaPreguntaMsg(state);
        broadcast(state, msgPregunta);
        sendDocente(state, {
          ...msgPregunta,
          correcta: p.correcta,
          totalJugadores: state.estado.totalJugadoresPregunta,
        });
      }
    }

    // D2 (REQ-SP-08): tras un SIGKILL mid-round el timer reinicia desde el
    // último tiempo persistido. guardarEstado no persiste por tick, así que
    // normalmente es la duración completa — decisión aceptada, no se persigue
    // el remanente por tick. Pausado o RESULTADO → sin timer.
    if (state.estado.fase === FASES.PREGUNTA && !state.estado.pausado) {
      iniciarTimer(state, true);
    }

    logger.info("Docente reanudó la partida recuperada (fase=%s)", state.estado.fase);
    return;
  }

  sendDocente(state, { tipo: "error", msg: 'Acción inválida. Usá "reanudar" o "descartar".' });
}

module.exports = { ejecutar };
>>>>>>> origin/main
