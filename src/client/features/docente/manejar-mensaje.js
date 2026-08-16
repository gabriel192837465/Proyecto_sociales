import { S, syncJugadoresMap, setPantalla } from "./state.js";
import { esc } from "../../shared/dom.js";
import { generarQR } from "./views/qr-display.js";
import { actualizarRanking, actualizarRankingGeneral } from "./views/ranking-lista.js";
import { mostrarPregunta, actualizarTimer } from "./views/pantalla-pregunta.js";
import { mostrarResultado } from "./views/pantalla-resultado.js";
import { mostrarFin, reiniciarUI } from "./views/pantalla-fin.js";
import { actualizarRespuestasEnPregunta } from "./views/jugadores-chips.js";
import { mostrarError, ocultarError, pedirClave, clearToken } from "./api.js";

// Screen-specific sub-reducers
function reducirLobby(msg) {
  if (msg.tipo === "estado_inicial") {
    const lobbyJugadores = (msg.jugadores || []).filter(j => S.jugadoresOnline[j.id] !== false);
    S.totalJugadores = lobbyJugadores.length;
    document.getElementById("count-jugadores").textContent = S.totalJugadores;
    document.getElementById("lista-jugadores").innerHTML = lobbyJugadores.map(j =>
      `<div class="jugador-chip" id="chip-${j.id}">${esc(j.nombre)}</div>`
    ).join("");
    setPantalla("lobby");
    document.getElementById("btn-siguiente").disabled = true;
    document.getElementById("btn-forzar").disabled = true;
    const btnPausaL = document.getElementById("btn-pausa");
    btnPausaL.disabled = true;
    btnPausaL.textContent = "⏸ Pausar tiempo";
  } else if (msg.tipo === "volver_a_lobby") {
    syncJugadoresMap(msg.jugadores);
    S.totalJugadores = (msg.jugadores || []).length;
    S.idsRespondieronActual = [];
    setPantalla("lobby");
    document.getElementById("count-jugadores").textContent = S.totalJugadores;
    document.getElementById("lista-jugadores").innerHTML = (msg.jugadores || []).map(j =>
      `<div class="jugador-chip" id="chip-${j.id}">${esc(j.nombre)}</div>`
    ).join("");
    actualizarRanking(msg.jugadores || []);
    actualizarRankingGeneral(msg.rankingGeneral || []);
    document.getElementById("btn-siguiente").disabled = true;
    document.getElementById("btn-forzar").disabled = true;
    const btnPausa = document.getElementById("btn-pausa");
    btnPausa.disabled = true;
    btnPausa.textContent = "⏸ Pausar tiempo";
  }
}

function reducirPregunta(msg) {
  if (msg.tipo === "estado_inicial") {
    const respondieron = Object.keys(msg.respuestasActuales || {});
    mostrarPregunta(msg.pregunta, respondieron);
    actualizarTimer(msg.tiempoRestante ?? msg.pregunta.tiempo);
    if (msg.pausado) {
      document.getElementById("btn-pausa").textContent = "▶ Reanudar tiempo";
    }
  } else if (msg.tipo === "nueva_pregunta") {
    S.TIEMPO_MAX = msg.tiempo || 20;
    mostrarPregunta(msg);
  } else if (msg.tipo === "tick") {
    actualizarTimer(msg.tiempo);
  } else if (msg.tipo === "juego_pausado") {
    document.getElementById("btn-pausa").textContent = "▶ Reanudar tiempo";
  } else if (msg.tipo === "juego_reanudado") {
    document.getElementById("btn-pausa").textContent = "⏸ Pausar tiempo";
    actualizarTimer(msg.tiempo);
  } else if (msg.tipo === "progreso_respuestas") {
    S.idsRespondieronActual = msg.respondieronIds || [];
    actualizarRespuestasEnPregunta(S.idsRespondieronActual);
  }
}

function reducirResultado(msg) {
  if (msg.tipo === "estado_inicial") {
    mostrarResultado({
      correcta: msg.resultado.correcta,
      respuestas: msg.resultado.respuestas,
      ranking: msg.jugadores,
      rankingGeneral: msg.rankingGeneral
    });
  } else if (msg.tipo === "resultado") {
    mostrarResultado(msg);
  }
}

function reducirFin(msg) {
  if (msg.tipo === "estado_inicial") {
    mostrarFin(msg.informe, msg.rankingGeneral);
  } else if (msg.tipo === "juego_reiniciado") {
    S.TIEMPO_MAX = msg.tiempoPorPregunta || 20;
    reiniciarUI(msg.totalPreguntas, msg.bancoNombre, msg.jugadores, msg.rankingGeneral);
  } else if (msg.tipo === "fin_juego") {
    mostrarFin(msg.ranking, msg.rankingGeneral);
  }
}

// Connectivity & Player sub-reducers
function reducirJugadorUnido(msg) {
  S.jugadoresMap[msg.id] = msg.nombre;
  S.jugadoresOnline[msg.id] = true;
  S.totalJugadores++;
  document.getElementById("count-jugadores").textContent = S.totalJugadores;
  const chip = document.createElement("div");
  chip.className = "jugador-chip";
  chip.id = "chip-" + msg.id;
  chip.textContent = msg.nombre;
  document.getElementById("lista-jugadores").appendChild(chip);
  // REQ-DUI-02: el panel deriva de msg.jugadores (buildRankingPayload);
  // ausente → no-op, el panel NO se limpia.
  if (msg.jugadores) actualizarRanking(msg.jugadores);
  if (msg.rankingGeneral) actualizarRankingGeneral(msg.rankingGeneral);
  if (S.pantallaActual === "pregunta") actualizarRespuestasEnPregunta(S.idsRespondieronActual);
}

function reducirJugadorReconectado(msg) {
  S.jugadoresMap[msg.id] = msg.nombre;
  S.jugadoresOnline[msg.id] = true;
  if (msg.jugadores) actualizarRanking(msg.jugadores);
  if (msg.rankingGeneral) actualizarRankingGeneral(msg.rankingGeneral);
  if (S.pantallaActual === "pregunta") actualizarRespuestasEnPregunta(S.idsRespondieronActual);
  if (S.pantallaActual === "lobby") {
    const chipExistente = document.getElementById("chip-" + msg.id);
    if (!chipExistente) {
      S.totalJugadores++;
      document.getElementById("count-jugadores").textContent = S.totalJugadores;
      const newChip = document.createElement("div");
      newChip.className = "jugador-chip";
      newChip.id = "chip-" + msg.id;
      newChip.textContent = msg.nombre;
      document.getElementById("lista-jugadores").appendChild(newChip);
    }
  }
}

function reducirJugadorDesconectado(msg) {
  S.jugadoresOnline[msg.id] = false;
  if (msg.jugadores) actualizarRanking(msg.jugadores);
  if (msg.rankingGeneral) actualizarRankingGeneral(msg.rankingGeneral);
  if (S.pantallaActual === "pregunta") actualizarRespuestasEnPregunta(S.idsRespondieronActual);
  if (S.pantallaActual === "lobby") {
    const chipDescon = document.getElementById("chip-" + msg.id);
    if (chipDescon) {
      chipDescon.remove();
      S.totalJugadores = Math.max(0, S.totalJugadores - 1);
      document.getElementById("count-jugadores").textContent = S.totalJugadores;
    }
  }
}

function reducirJugadorSalio(msg) {
  delete S.jugadoresMap[msg.id];
  delete S.jugadoresOnline[msg.id];
  const chipSalio = document.getElementById("chip-" + msg.id);
  if (chipSalio) chipSalio.remove();
  S.totalJugadores = Math.max(0, S.totalJugadores - 1);
  document.getElementById("count-jugadores").textContent = S.totalJugadores;
  if (msg.jugadores) actualizarRanking(msg.jugadores);
  if (msg.rankingGeneral) actualizarRankingGeneral(msg.rankingGeneral);
  if (S.pantallaActual === "pregunta") actualizarRespuestasEnPregunta(S.idsRespondieronActual);
}

function reducirNombreCambiado(msg) {
  S.jugadoresMap[msg.id] = msg.nuevoNombre;
  const chipCambio = document.getElementById("chip-" + msg.id);
  if (chipCambio) chipCambio.textContent = msg.nuevoNombre;
  if (msg.jugadores) actualizarRanking(msg.jugadores);
  if (msg.rankingGeneral) actualizarRankingGeneral(msg.rankingGeneral);
  if (S.pantallaActual === "pregunta") actualizarRespuestasEnPregunta(S.idsRespondieronActual);
}

// Action Dispatch Table
const DISPATCH_TABLE = {
  estado_inicial(msg) {
    S.fase = msg.fase;
    generarQR(msg.serverIP, msg.port);
    syncJugadoresMap(msg.jugadores);
    actualizarRanking(msg.jugadores);
    actualizarRankingGeneral(msg.rankingGeneral);
    if (msg.tiempoPorPregunta) S.TIEMPO_MAX = msg.tiempoPorPregunta;

    if (msg.fase === "lobby") {
      reducirLobby(msg);
    } else if (msg.fase === "pregunta") {
      reducirPregunta(msg);
    } else if (msg.fase === "resultado") {
      reducirResultado(msg);
    } else if (msg.fase === "fin") {
      reducirFin(msg);
    }
  },
  jugador_unido: reducirJugadorUnido,
  jugador_reconectado: reducirJugadorReconectado,
  jugador_desconectado: reducirJugadorDesconectado,
  jugador_salio: reducirJugadorSalio,
  nueva_pregunta: reducirPregunta,
  tick: reducirPregunta,
  juego_pausado: reducirPregunta,
  juego_reanudado: reducirPregunta,
  progreso_respuestas: reducirPregunta,
  resultado: reducirResultado,
  juego_reiniciado: reducirFin,
  fin_juego: reducirFin,
  volver_a_lobby: reducirLobby,
  ranking_general_reiniciado(msg) {
    actualizarRankingGeneral(msg.rankingGeneral);
  },
  nombre_cambiado: reducirNombreCambiado,
  error(msg) {
    if (!msg || !msg.msg) return;
    mostrarError(msg.msg);
    const errorText = msg.msg.toLowerCase();
    if (errorText.includes("clave") || errorText.includes("autenticado") || errorText.includes("token")) {
      if (S.ws) S.ws.close();
      clearToken();
      pedirClave("Clave incorrecta o sesión expirada.");
    }
  }
};

export function manejarMensaje(msg) {
  const handler = DISPATCH_TABLE[msg.tipo];
  if (handler) {
    handler(msg);
  }
}
