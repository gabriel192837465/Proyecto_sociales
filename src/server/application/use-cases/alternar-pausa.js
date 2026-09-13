const { sendDocente, broadcast, iniciarTimer } = require("../game-session");
const { FASES } = require("../../domain/constants");
const { guardarEstado } = require("../app-state");

function ejecutar(state) {
  if (state.estado.fase !== FASES.PREGUNTA) return;

  state.estado.pausado = !state.estado.pausado;
  // Clear auto-pause flag on any manual toggle — manual action takes precedence
  state.autoPausado = false;
  if (state.estado.pausado) {
    clearTimeout(state.timer);
    state.timer = null;
    guardarEstado(state.estado);
    sendDocente(state, { tipo: "juego_pausado" });
    broadcast(state, { tipo: "juego_pausado" });
  } else {
    iniciarTimer(state, true);
    guardarEstado(state.estado);
    sendDocente(state, { tipo: "juego_reanudado", tiempo: state.estado.tiempoRestante });
    broadcast(state, { tipo: "juego_reanudado", tiempo: state.estado.tiempoRestante });
  }
}

module.exports = { ejecutar };
