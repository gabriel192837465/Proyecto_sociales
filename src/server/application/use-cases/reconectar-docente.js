<<<<<<< HEAD
const { buildRankingPayload } = require("../game-session");
const { getInformeDocente } = require("../../domain/game");
const { FASES } = require("../../domain/constants");

function buildPayload(state, ctx) {
  const rp = buildRankingPayload(state.estado.jugadores);
  const payload = {
    tipo: "estado_inicial",
    jugadores: rp.jugadores,
    rankingGeneral: rp.rankingGeneral,
    fase: state.estado.fase,
    serverIP: ctx.localIp,
    port: ctx.port,
    tiempoPorPregunta: state.estado.tiempoPorPregunta,
    codigoPartida: state.estado.codigoPartida || null
  };

  if (state.estado.fase === FASES.PREGUNTA) {
    const p = state.estado.preguntasActivas[state.estado.preguntaIdx];
    if (!p) return payload;
    payload.pregunta = {
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
    payload.tiempoRestante = state.estado.tiempoRestante;
    payload.pausado = state.estado.pausado;
    payload.respuestasActuales = state.estado.respuestasActuales;
  } else if (state.estado.fase === FASES.RESULTADO) {
    const p = state.estado.preguntasActivas[state.estado.preguntaIdx];
    payload.resultado = {
      idx: state.estado.preguntaIdx,
      total: state.estado.preguntasActivas.length,
      correcta: p.correcta,
      respuestas: state.estado.respuestasActuales
    };
  } else if (state.estado.fase === FASES.FIN) {
    payload.informe = getInformeDocente(state.estado);
  }

  return payload;
}

module.exports = { buildPayload };
=======
const { buildRankingPayload } = require("../game-session");
const { getInformeDocente } = require("../../domain/game");
const { FASES } = require("../../domain/constants");

function buildPayload(state, ctx) {
  const rp = buildRankingPayload(state.estado.jugadores);
  const payload = {
    tipo: "estado_inicial",
    jugadores: rp.jugadores,
    rankingGeneral: rp.rankingGeneral,
    fase: state.estado.fase,
    serverIP: ctx.localIp,
    port: ctx.port,
    tiempoPorPregunta: state.estado.tiempoPorPregunta
  };

  if (state.estado.fase === FASES.PREGUNTA) {
    const p = state.estado.preguntasActivas[state.estado.preguntaIdx];
    if (!p) return payload;
    payload.pregunta = {
      idx: state.estado.preguntaIdx,
      total: state.estado.preguntasActivas.length,
      pregunta: p.pregunta,
      opciones: p.opciones,
      epoca: p.epoca,
      tiempo: state.estado.tiempoPorPregunta
    };
    payload.tiempoRestante = state.estado.tiempoRestante;
    payload.pausado = state.estado.pausado;
    payload.respuestasActuales = state.estado.respuestasActuales;
  } else if (state.estado.fase === FASES.RESULTADO) {
    const p = state.estado.preguntasActivas[state.estado.preguntaIdx];
    payload.resultado = {
      idx: state.estado.preguntaIdx,
      total: state.estado.preguntasActivas.length,
      correcta: p.correcta,
      respuestas: state.estado.respuestasActuales
    };
  } else if (state.estado.fase === FASES.FIN) {
    payload.informe = getInformeDocente(state.estado);
  }

  return payload;
}

module.exports = { buildPayload };
>>>>>>> origin/main
