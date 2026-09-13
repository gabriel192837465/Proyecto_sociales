<<<<<<< HEAD
const { LETRAS, TIEMPO_DEFAULT, FASES } = require("./constants");

/**
 * Estado inicial del juego
 */
function crearEstadoInicial() {
  return {
    fase: FASES.LOBBY,
    preguntaIdx: -1,
    tiempoRestante: 0,
    jugadores: {},
    respuestasActuales: {},
    preguntasActivas: [],
    tiempoPorPregunta: TIEMPO_DEFAULT,
    pausado: false,
    totalJugadoresPregunta: 0,
    // Código de 6 dígitos que identifica la PARTIDA (distinto de la cuenta,
    // que identifica al ALUMNO). null = todavía no se creó ninguna partida
    // con este mecanismo (compatibilidad con el flujo histórico de entrada
    // libre, usado por el conjunto de tests existente).
    codigoPartida: null,
    cursoSeleccionado: null,
    bancoIdSeleccionado: null
  };
}

/**
 * Genera un código de partida de 6 dígitos, evitando códigos "obvios"
 * (todos los dígitos iguales, p. ej. 000000 o 111111) y evitando colisión
 * con un código ya activo.
 */
function generarCodigoPartida(codigoActivo) {
  let codigo;
  do {
    codigo = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
  } while (/^(\d)\1{5}$/.test(codigo) || codigo === codigoActivo);
  return codigo;
}

/**
 * Obtiene el ranking de jugadores ordenado por puntaje descendente.
 * Solo incluye jugadores online (los offline no aparecen en la ronda actual).
 */
function getRanking(jugadores) {
  return Object.entries(jugadores)
    .filter(([, j]) => j.online !== false)
    .map(([id, j]) => ({ id, nombre: j.nombre, puntaje: j.puntaje }))
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, 20);
}

function getRankingCompleto(jugadores) {
  return Object.entries(jugadores)
    .map(([id, j]) => ({ id, nombre: j.nombre, puntaje: j.puntaje }))
    .sort((a, b) => b.puntaje - a.puntaje);
}

/**
 * Obtiene el ranking general acumulado
 */
function getRankingGeneral(jugadores) {
  return Object.entries(jugadores)
    .map(([id, j]) => ({ id, nombre: j.nombre, puntajeGeneral: j.puntajeGeneral || 0 }))
    .sort((a, b) => b.puntajeGeneral - a.puntajeGeneral)
    .slice(0, 20);
}

/**
 * Registra el historial de respuestas de una pregunta
 */
function registrarHistorialPregunta(estado, preguntaIdx) {
  const p = estado.preguntasActivas[preguntaIdx];
  if (!p) return;
  Object.keys(estado.jugadores).forEach(id => {
    const j = estado.jugadores[id];
    if (!j.historial) j.historial = [];
    const resp = estado.respuestasActuales[id];
    const respondio = resp !== undefined;
    j.historial.push({
      n: preguntaIdx + 1,
      pregunta: p.pregunta,
      correctaLetra: LETRAS[p.correcta],
      opcionLetra: respondio ? LETRAS[resp] : null,
      opcionTexto: respondio ? p.opciones[resp] : null,
      respondio,
      acerto: respondio && resp === p.correcta,
    });
  });
}

/**
 * Obtiene el informe detallado para el docente
 */
function getInformeDocente(estado) {
  return getRankingCompleto(estado.jugadores).map(j => ({
    id: j.id,
    nombre: j.nombre,
    puntaje: j.puntaje,
    detalle: (estado.jugadores[j.id]?.historial || []).map(h => ({ ...h })),
  }));
}

/**
 * Valida si una opción de respuesta es válida
 */
function esOpcionValida(opcion) {
  return Number.isInteger(opcion) && opcion >= 0 && opcion <= 3;
}

module.exports = {
  crearEstadoInicial,
  generarCodigoPartida,
  getRanking,
  getRankingGeneral,
  registrarHistorialPregunta,
  getInformeDocente,
  esOpcionValida
};
=======
const { LETRAS, TIEMPO_DEFAULT, FASES } = require("./constants");

/**
 * Estado inicial del juego
 */
function crearEstadoInicial() {
  return {
    fase: FASES.LOBBY,
    preguntaIdx: -1,
    tiempoRestante: 0,
    jugadores: {},
    respuestasActuales: {},
    preguntasActivas: [],
    tiempoPorPregunta: TIEMPO_DEFAULT,
    pausado: false,
    totalJugadoresPregunta: 0
  };
}

/**
 * Obtiene el ranking de jugadores ordenado por puntaje descendente.
 * Solo incluye jugadores online (los offline no aparecen en la ronda actual).
 */
function getRanking(jugadores) {
  return Object.entries(jugadores)
    .filter(([, j]) => j.online !== false)
    .map(([id, j]) => ({ id, nombre: j.nombre, puntaje: j.puntaje }))
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, 20);
}

function getRankingCompleto(jugadores) {
  return Object.entries(jugadores)
    .map(([id, j]) => ({ id, nombre: j.nombre, puntaje: j.puntaje }))
    .sort((a, b) => b.puntaje - a.puntaje);
}

/**
 * Obtiene el ranking general acumulado
 */
function getRankingGeneral(jugadores) {
  return Object.entries(jugadores)
    .map(([id, j]) => ({ id, nombre: j.nombre, puntajeGeneral: j.puntajeGeneral || 0 }))
    .sort((a, b) => b.puntajeGeneral - a.puntajeGeneral)
    .slice(0, 20);
}

/**
 * Registra el historial de respuestas de una pregunta
 */
function registrarHistorialPregunta(estado, preguntaIdx) {
  const p = estado.preguntasActivas[preguntaIdx];
  if (!p) return;
  Object.keys(estado.jugadores).forEach(id => {
    const j = estado.jugadores[id];
    if (!j.historial) j.historial = [];
    const resp = estado.respuestasActuales[id];
    const respondio = resp !== undefined;
    j.historial.push({
      n: preguntaIdx + 1,
      pregunta: p.pregunta,
      correctaLetra: LETRAS[p.correcta],
      opcionLetra: respondio ? LETRAS[resp] : null,
      opcionTexto: respondio ? p.opciones[resp] : null,
      respondio,
      acerto: respondio && resp === p.correcta,
    });
  });
}

/**
 * Obtiene el informe detallado para el docente
 */
function getInformeDocente(estado) {
  return getRankingCompleto(estado.jugadores).map(j => ({
    id: j.id,
    nombre: j.nombre,
    puntaje: j.puntaje,
    detalle: (estado.jugadores[j.id]?.historial || []).map(h => ({ ...h })),
  }));
}

/**
 * Valida si una opción de respuesta es válida
 */
function esOpcionValida(opcion) {
  return Number.isInteger(opcion) && opcion >= 0 && opcion <= 3;
}

module.exports = {
  crearEstadoInicial,
  getRanking,
  getRankingGeneral,
  registrarHistorialPregunta,
  getInformeDocente,
  esOpcionValida
};
>>>>>>> origin/main
