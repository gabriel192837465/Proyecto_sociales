<<<<<<< HEAD
const {
  getRanking,
  getRankingGeneral,
  registrarHistorialPregunta
} = require("../domain/game");
const { PUNTAJE_RESPUESTA_CORRECTA, BROADCAST_BACKPRESSURE_THRESHOLD } = require("../domain/constants");
const { TIMER_TICK_MS, FASES, AUTO_AVANCE_RESULTADO_MS } = require("../domain/constants");
const { guardarEstado } = require("./app-state");
const logger = require("../infra/logger");
const { broadcastDropsTotal } = require("../infra/metrics");

function buildRankingPayload(jugadores) {
  return {
    jugadores: getRanking(jugadores),
    rankingGeneral: getRankingGeneral(jugadores),
  };
}

function broadcast(state, msg, sender) {
  const data = JSON.stringify(msg);
  if (!state.wss) return;
  state.wss.clients.forEach((c) => {
    if (c === state.docente) return;
    if (sender && c === sender) return;
    if (c.readyState === 1) {
      if (c.bufferedAmount >= BROADCAST_BACKPRESSURE_THRESHOLD) {
        broadcastDropsTotal.inc();
        logger.warn({ bufferedAmount: c.bufferedAmount }, "broadcast: terminando conexion por backpressure");
        c.terminate();
        return;
      }
      c.send(data);
    }
  });
}

function sendDocente(state, msg) {
  if (state.docente && state.docente.readyState === 1) {
    if (state.docente.bufferedAmount >= BROADCAST_BACKPRESSURE_THRESHOLD) {
      broadcastDropsTotal.inc();
      logger.warn({ bufferedAmount: state.docente.bufferedAmount }, "sendDocente: terminando conexion docente por backpressure");
      state.docente.terminate();
      return;
    }
    state.docente.send(JSON.stringify(msg));
  }
}

function mostrarResultado(state) {
  // R3-002: re-entrancy guard. Si la fase ya es RESULTADO, una llamada previa
  // (respuesta tardía + timer, o doble click del docente) ya emitió el
  // broadcast. Depende de la asignación a FASES.RESULTADO más abajo (línea 47)
  // que se ejecuta antes del broadcast.
  if (state.estado.fase === FASES.RESULTADO) return;

  const p = state.estado.preguntasActivas[state.estado.preguntaIdx];
  if (!p) {
    logger.error("mostrarResultado: no hay pregunta activa disponible");
    return;
  }
  for (const [id, resp] of Object.entries(state.estado.respuestasActuales)) {
    const j = state.estado.jugadores[id];
    if (resp === p.correcta && j) {
      j.puntaje += PUNTAJE_RESPUESTA_CORRECTA;
      j.puntajeGeneral = (j.puntajeGeneral || 0) + PUNTAJE_RESPUESTA_CORRECTA;
    }
  }
  registrarHistorialPregunta(state.estado, state.estado.preguntaIdx);
  state.estado.fase = FASES.RESULTADO;
  guardarEstado(state.estado);
  const msgBase = {
    tipo: "resultado",
    correcta: p.correcta,
    ...buildRankingPayload(state.estado.jugadores),
  };
  sendDocente(state, { ...msgBase, respuestas: state.estado.respuestasActuales });
  broadcast(state, msgBase);

  // Sección 15/17 — autoavance controlado por servidor: el docente NO tiene
  // que apretar "Siguiente pregunta" en el flujo normal. A los 2-3s de
  // mostrar el resultado, el servidor mismo pasa a la próxima pregunta (o a
  // fin_juego si era la última). El docente conserva `siguiente_pregunta`
  // como control manual/avanzado (sección 20): si lo usa antes de que este
  // timer dispare, `siguiente()` limpia este timeout para no avanzar dos
  // veces.
  clearTimeout(state.autoAvanceTimer);
  state.autoAvanceTimer = setTimeout(() => {
    state.autoAvanceTimer = null;
    try {
      // Require diferido (no en el top del módulo) para evitar el ciclo
      // game-session.js <-> avanzar-pregunta.js, que sí se requieren
      // mutuamente a nivel de módulo (avanzar-pregunta.js importa de
      // game-session.js).
      const { siguiente } = require("./use-cases/avanzar-pregunta");
      siguiente(state);
    } catch (err) {
      logger.error({ err }, "autoavance: fallo al avanzar automáticamente a la siguiente pregunta");
    }
  }, AUTO_AVANCE_RESULTADO_MS).unref();
}

function iniciarTimer(state, continuar = false) {
  clearTimeout(state.timer);
  state.timer = null;
  if (!continuar) state.estado.tiempoRestante = state.estado.tiempoPorPregunta;
  if (state.estado.pausado) return;

  const duracionTotal = state.estado.tiempoPorPregunta;
  const inicio = Date.now();
  const transcurridosAlArrancar = continuar
    ? duracionTotal - state.estado.tiempoRestante
    : 0;

  function tick() {
    if (state.estado.pausado) { state.timer = null; return; }
    const transcurrido = Math.floor((Date.now() - inicio) / 1000) + transcurridosAlArrancar;
    const restante = Math.max(0, duracionTotal - transcurrido);
    state.estado.tiempoRestante = restante;
    sendDocente(state, { tipo: "tick", tiempo: restante });
    broadcast(state, { tipo: "tick", tiempo: restante });
    if (restante <= 0) { state.timer = null; mostrarResultado(state); return; }
    // Drift = sub-second remainder para alinear el próximo tick al segundo.
    // `inicio` es el arranque de este tick (no el inicio absoluto de la
    // pregunta), así que `transcurrido` ya está absorbido en `restante`.
    const drift = (Date.now() - inicio) % 1000;
    state.timer = setTimeout(tick, TIMER_TICK_MS - drift).unref();
  }
  state.timer = setTimeout(tick, TIMER_TICK_MS).unref();
}

function jugadoresOnline(estado) {
  return Object.values(estado.jugadores)
    .filter((j) => j.online !== false)
    .map((j) => ({ nombre: j.nombre }));
}

function buildNuevaPreguntaMsg(state) {
  const p = state.estado.preguntasActivas[state.estado.preguntaIdx];
  return {
    tipo: "nueva_pregunta",
    idx: state.estado.preguntaIdx,
    total: state.estado.preguntasActivas.length,
    pregunta: p.pregunta,
    opciones: p.opciones,
    epoca: p.epoca,
    ...(p.tipo ? {
      tipoPregunta: p.tipo,
      materia: p.materia || "Historia",
      mediaTipo: p.mediaTipo || "",
      mediaUrl: p.mediaUrl || ""
    } : {}),
    tiempo: state.estado.tiempoPorPregunta
  };
}

function lanzarNuevaPregunta(state) {
  const mp = buildNuevaPreguntaMsg(state);
  sendDocente(state, mp);

  if (state.wss) {
    state.wss.clients.forEach((c) => {
      if (c === state.docente) return;
      if (c.readyState === 1) {
        if (c.bufferedAmount >= BROADCAST_BACKPRESSURE_THRESHOLD) {
          broadcastDropsTotal.inc();
          logger.warn({ bufferedAmount: c.bufferedAmount }, "lanzarNuevaPregunta: terminando conexion por backpressure");
          c.terminate();
          return;
        }
        const studentMsg = { ...mp };
        const id = state.alumnos.get(c);
        if (id && state.estado.tokens && state.estado.tokens[id]) {
          studentMsg.tokensPorAlumno = { [id]: state.estado.tokens[id] };
        }
        c.send(JSON.stringify(studentMsg));
      }
    });
  }

  iniciarTimer(state);
}

module.exports = {
  broadcast,
  sendDocente,
  mostrarResultado,
  iniciarTimer,
  jugadoresOnline,
  lanzarNuevaPregunta,
  buildRankingPayload,
  buildNuevaPreguntaMsg,
};
=======
const {
  getRanking,
  getRankingGeneral,
  registrarHistorialPregunta
} = require("../domain/game");
const { PUNTAJE_RESPUESTA_CORRECTA, BROADCAST_BACKPRESSURE_THRESHOLD } = require("../domain/constants");
const { TIMER_TICK_MS, FASES } = require("../domain/constants");
const { guardarEstado } = require("./app-state");
const logger = require("../infra/logger");
const { broadcastDropsTotal } = require("../infra/metrics");

function buildRankingPayload(jugadores) {
  return {
    jugadores: getRanking(jugadores),
    rankingGeneral: getRankingGeneral(jugadores),
  };
}

function broadcast(state, msg, sender) {
  const data = JSON.stringify(msg);
  if (!state.wss) return;
  state.wss.clients.forEach((c) => {
    if (c === state.docente) return;
    if (sender && c === sender) return;
    if (c.readyState === 1) {
      if (c.bufferedAmount >= BROADCAST_BACKPRESSURE_THRESHOLD) {
        broadcastDropsTotal.inc();
        logger.warn({ bufferedAmount: c.bufferedAmount }, "broadcast: terminando conexion por backpressure");
        c.terminate();
        return;
      }
      c.send(data);
    }
  });
}

function sendDocente(state, msg) {
  if (state.docente && state.docente.readyState === 1) {
    if (state.docente.bufferedAmount >= BROADCAST_BACKPRESSURE_THRESHOLD) {
      broadcastDropsTotal.inc();
      logger.warn({ bufferedAmount: state.docente.bufferedAmount }, "sendDocente: terminando conexion docente por backpressure");
      state.docente.terminate();
      return;
    }
    state.docente.send(JSON.stringify(msg));
  }
}

function mostrarResultado(state) {
  // R3-002: re-entrancy guard. Si la fase ya es RESULTADO, una llamada previa
  // (respuesta tardía + timer, o doble click del docente) ya emitió el
  // broadcast. Depende de la asignación a FASES.RESULTADO más abajo (línea 47)
  // que se ejecuta antes del broadcast.
  if (state.estado.fase === FASES.RESULTADO) return;

  const p = state.estado.preguntasActivas[state.estado.preguntaIdx];
  if (!p) {
    logger.error("mostrarResultado: no hay pregunta activa disponible");
    return;
  }
  for (const [id, resp] of Object.entries(state.estado.respuestasActuales)) {
    const j = state.estado.jugadores[id];
    if (resp === p.correcta && j) {
      j.puntaje += PUNTAJE_RESPUESTA_CORRECTA;
      j.puntajeGeneral = (j.puntajeGeneral || 0) + PUNTAJE_RESPUESTA_CORRECTA;
    }
  }
  registrarHistorialPregunta(state.estado, state.estado.preguntaIdx);
  state.estado.fase = FASES.RESULTADO;
  guardarEstado(state.estado);
  const msgBase = {
    tipo: "resultado",
    correcta: p.correcta,
    ...buildRankingPayload(state.estado.jugadores),
  };
  sendDocente(state, { ...msgBase, respuestas: state.estado.respuestasActuales });
  broadcast(state, msgBase);
}

function iniciarTimer(state, continuar = false) {
  clearTimeout(state.timer);
  state.timer = null;
  if (!continuar) state.estado.tiempoRestante = state.estado.tiempoPorPregunta;
  if (state.estado.pausado) return;

  const duracionTotal = state.estado.tiempoPorPregunta;
  const inicio = Date.now();
  const transcurridosAlArrancar = continuar
    ? duracionTotal - state.estado.tiempoRestante
    : 0;

  function tick() {
    if (state.estado.pausado) { state.timer = null; return; }
    const transcurrido = Math.floor((Date.now() - inicio) / 1000) + transcurridosAlArrancar;
    const restante = Math.max(0, duracionTotal - transcurrido);
    state.estado.tiempoRestante = restante;
    sendDocente(state, { tipo: "tick", tiempo: restante });
    broadcast(state, { tipo: "tick", tiempo: restante });
    if (restante <= 0) { state.timer = null; mostrarResultado(state); return; }
    // Drift = sub-second remainder para alinear el próximo tick al segundo.
    // `inicio` es el arranque de este tick (no el inicio absoluto de la
    // pregunta), así que `transcurrido` ya está absorbido en `restante`.
    const drift = (Date.now() - inicio) % 1000;
    state.timer = setTimeout(tick, TIMER_TICK_MS - drift).unref();
  }
  state.timer = setTimeout(tick, TIMER_TICK_MS).unref();
}

function jugadoresOnline(estado) {
  return Object.values(estado.jugadores)
    .filter((j) => j.online !== false)
    .map((j) => ({ nombre: j.nombre }));
}

function buildNuevaPreguntaMsg(state) {
  const p = state.estado.preguntasActivas[state.estado.preguntaIdx];
  return {
    tipo: "nueva_pregunta",
    idx: state.estado.preguntaIdx,
    total: state.estado.preguntasActivas.length,
    pregunta: p.pregunta,
    opciones: p.opciones,
    epoca: p.epoca,
    tiempo: state.estado.tiempoPorPregunta
  };
}

function lanzarNuevaPregunta(state) {
  const mp = buildNuevaPreguntaMsg(state);
  sendDocente(state, mp);

  if (state.wss) {
    state.wss.clients.forEach((c) => {
      if (c === state.docente) return;
      if (c.readyState === 1) {
        if (c.bufferedAmount >= BROADCAST_BACKPRESSURE_THRESHOLD) {
          broadcastDropsTotal.inc();
          logger.warn({ bufferedAmount: c.bufferedAmount }, "lanzarNuevaPregunta: terminando conexion por backpressure");
          c.terminate();
          return;
        }
        const studentMsg = { ...mp };
        const id = state.alumnos.get(c);
        if (id && state.estado.tokens && state.estado.tokens[id]) {
          studentMsg.tokensPorAlumno = { [id]: state.estado.tokens[id] };
        }
        c.send(JSON.stringify(studentMsg));
      }
    });
  }

  iniciarTimer(state);
}

module.exports = {
  broadcast,
  sendDocente,
  mostrarResultado,
  iniciarTimer,
  jugadoresOnline,
  lanzarNuevaPregunta,
  buildRankingPayload,
  buildNuevaPreguntaMsg,
};
>>>>>>> origin/main
