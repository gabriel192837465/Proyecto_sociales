const path = require("node:path");
const fs = require("node:fs");
const { cargarDB, cargarEstado: dbCargarEstado, guardarEstado: dbGuardarEstado, clearSesion } = require("../infra/db");
const { crearEstadoInicial } = require("../domain/game");
const logger = require("../infra/logger");

/**
 * Persiste el estado de sesión en SQLite.
 */
function guardarEstado(estado) {
  dbGuardarEstado(estado);
}

/**
 * Lee el estado de sesión desde SQLite.
 */
function cargarEstado() {
  return dbCargarEstado();
}

// Backward-compat aliases
const guardarSnapshot = guardarEstado;
const cargarSnapshot = cargarEstado;

/**
 * Borra la sesión persistida (antes borraba el JSON, ahora limpia SQLite).
 */
function borrarSnapshot() {
  clearSesion();
}

/**
 * Crea el estado inicial de la aplicación.
 * Siempre comienza desde cero — no se persiste estado de sesión entre reinicios.
 */
function createAppState() {
  return {
    db: cargarDB(),
    estado: crearEstadoInicial(),
    timer: null,
    docente: null,
    alumnos: new Map(),
    // R4-002: socket VIGENTE por id de alumno. Permite al close handler
    // distinguir el cierre de un socket stale (el alumno ya reconectó con
    // otro socket tras D1) del cierre legítimo — un close zombie NO debe
    // marcar offline al jugador vivo ni decrementar la ronda.
    alumnoSocketPorId: new Map(),
    wss: null,
    snapshotRecuperado: false,
    autoPausado: false
  };
}

function resetForTests(state) {
  clearInterval(state.hbTimer);
  state.hbTimer = null;
  clearTimeout(state.timer);
  state.timer = null;
  clearTimeout(state.autoAvanceTimer);
  state.autoAvanceTimer = null;
  state.docente = null;
  state.alumnos.clear();
  state.alumnoSocketPorId.clear();
  state.estado = crearEstadoInicial();
  state.db = cargarDB(); // reload DB from disk (backup must be restored first)
  state.snapshotRecuperado = false;
  state.autoPausado = false;
  if (state.wss) {
    state.wss.clients.forEach((client) => client.terminate());
  }
  clearSesion(); // limpia la fila de sesión en SQLite
}

module.exports = {
  createAppState,
  resetForTests,
  guardarEstado,
  cargarEstado,
  guardarSnapshot, // alias
  cargarSnapshot,  // alias
  borrarSnapshot,
};
