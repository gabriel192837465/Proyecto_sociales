const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const defaultBancos = require("./default-bancos.json");
const logger = require("./logger");

const DEFAULT_SQLITE_PATH = path.join(__dirname, "..", "..", "..", "data", "historia-quiz.db");

let _db = null;

function _getDbPath() {
  return process.env.HISTORIA_DB_PATH || DEFAULT_SQLITE_PATH;
}

function _initDB() {
  if (_db) return _db;
  const dbPath = _getDbPath();
  const isNew = !fs.existsSync(dbPath);

  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("busy_timeout = 5000");
  _db.pragma("foreign_keys = ON");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS bancos (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      nivel TEXT DEFAULT '',
      anio TEXT DEFAULT '',
      tema TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS preguntas (
      id TEXT PRIMARY KEY,
      banco_id TEXT NOT NULL REFERENCES bancos(id) ON DELETE CASCADE,
      pregunta TEXT NOT NULL,
      opciones TEXT NOT NULL,
      correcta INTEGER NOT NULL,
      epoca TEXT DEFAULT 'General'
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sesiones (
      id INTEGER PRIMARY KEY,
      fase TEXT NOT NULL,
      pregunta_idx INTEGER NOT NULL,
      tiempo_restante INTEGER NOT NULL,
      tiempo_por_pregunta INTEGER NOT NULL,
      pausado INTEGER NOT NULL,
      total_jugadores_pregunta INTEGER NOT NULL,
      jugadores TEXT NOT NULL,
      respuestas_actuales TEXT NOT NULL,
      preguntas_activas TEXT NOT NULL
    );
  `);

  const isEmpty = _db.prepare("SELECT COUNT(*) AS c FROM bancos").get().c === 0;
  if (isNew || isEmpty) {
    _seedFromBancos(defaultBancos.bancos);
  }

  return _db;
}

function _seedFromBancos(bancos) {
  const insertBanco = _db.prepare(
    "INSERT OR REPLACE INTO bancos(id, nombre, nivel, anio, tema) VALUES (?, ?, ?, ?, ?)"
  );
  const insertPregunta = _db.prepare(
    "INSERT OR REPLACE INTO preguntas(id, banco_id, pregunta, opciones, correcta, epoca) VALUES (?, ?, ?, ?, ?, ?)"
  );

  const seedTx = _db.transaction(() => {
    for (const b of bancos) {
      insertBanco.run(b.id, b.nombre, b.nivel || "", b.anio || "", b.tema || "");
      for (const p of (b.preguntas || [])) {
        insertPregunta.run(p.id, b.id, p.pregunta, JSON.stringify(p.opciones), p.correcta, p.epoca || "General");
      }
    }
  });
  seedTx();
}

/**
 * Reconstruye el objeto { bancos: [...] } desde SQLite,
 * manteniendo la misma estructura que devolvía cargarDB() con JSON.
 */
function _buildBancosFromDB() {
  const db = _initDB();
  const bancos = db.prepare("SELECT * FROM bancos ORDER BY id").all();
  const preguntas = db.prepare("SELECT * FROM preguntas ORDER BY banco_id, id").all();

  const preguntasPorBanco = {};
  for (const p of preguntas) {
    p.opciones = JSON.parse(p.opciones);
    if (!preguntasPorBanco[p.banco_id]) {
      preguntasPorBanco[p.banco_id] = [];
    }
    preguntasPorBanco[p.banco_id].push(p);
  }

  for (const banco of bancos) {
    banco.preguntas = preguntasPorBanco[banco.id] || [];
  }

  return { bancos };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Carga la base de datos desde SQLite (o desde JSON legacy en primera ejecución).
 * Si la base de datos SQLite no existe, la crea y la seedea desde default-bancos.json.
 */
function cargarDB() {
  _initDB();
  return _buildBancosFromDB();
}

/**
 * Guarda la base de datos de preguntas en SQLite (transacción atómica).
 */
function guardarDB(data) {
  if (data == null) throw new Error("guardarDB: data es null/undefined");
  const db = _initDB();

  const insertBanco = db.prepare(
    "INSERT OR REPLACE INTO bancos(id, nombre, nivel, anio, tema) VALUES (?, ?, ?, ?, ?)"
  );
  const insertPregunta = db.prepare(
    "INSERT OR REPLACE INTO preguntas(id, banco_id, pregunta, opciones, correcta, epoca) VALUES (?, ?, ?, ?, ?, ?)"
  );

  const saveTx = db.transaction(() => {
    const bankIds = [];
    const questionIds = [];
    for (const b of data.bancos) {
      bankIds.push(b.id);
      insertBanco.run(b.id, b.nombre, b.nivel || "", b.anio || "", b.tema || "");
      for (const p of (b.preguntas || [])) {
        questionIds.push(p.id);
        insertPregunta.run(p.id, b.id, p.pregunta, JSON.stringify(p.opciones), p.correcta, p.epoca || "General");
      }
    }

    if (bankIds.length > 0) {
      const bankPlaceholders = bankIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM bancos WHERE id NOT IN (${bankPlaceholders})`).run(...bankIds);
    } else {
      db.prepare("DELETE FROM bancos").run();
    }

    if (questionIds.length > 0) {
      const questionPlaceholders = questionIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM preguntas WHERE id NOT IN (${questionPlaceholders})`).run(...questionIds);
    } else {
      db.prepare("DELETE FROM preguntas").run();
    }
  });
  try {
    saveTx();
  } catch (err) {
    logger.error({ err }, "guardarDB: fallo al escribir, recargando desde disco");
    const reloaded = _buildBancosFromDB();
    data.bancos.length = 0;
    data.bancos.push(...reloaded.bancos);
    throw err;
  }
}

/**
 * Cierra la conexión a SQLite. Útil en tests para liberar el archivo .db
 * antes de borrarlo (requerido en Windows, donde better-sqlite3 lockea el archivo).
 */
function closeDB() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/**
 * Ejecuta un checkpoint WAL con modo TRUNCATE.
 * Reduce el tamaño del archivo -wal liberando páginas ya persistidas en el DB principal.
 * Seguro de llamar durante graceful shutdown o mantenimiento.
 */
function checkpointWAL() {
  if (!_db) return;
  try {
    _db.pragma("wal_checkpoint(TRUNCATE)");
    logger.info("checkpointWAL: WAL checkpoint completado");
  } catch (err) {
    logger.warn({ err }, "checkpointWAL: error al hacer checkpoint, continuando");
  }
}

// ── Session State (sesiones table) ────────────────────────────────────────────

/**
 * Lee la sesión activa desde SQLite.
 * @returns {object|null} Estado con camelCase, o null si no hay sesión.
 */
function cargarEstado() {
  const db = _initDB();
  try {
    const row = db.prepare("SELECT * FROM sesiones WHERE id = 1").get();
    if (!row) return null;
    const jugadores = JSON.parse(row.jugadores);
    const tokens = {};
    for (const [id, j] of Object.entries(jugadores)) {
      if (j.token) {
        tokens[id] = j.token;
      }
    }
    return {
      fase: row.fase,
      preguntaIdx: row.pregunta_idx,
      tiempoRestante: row.tiempo_restante,
      tiempoPorPregunta: row.tiempo_por_pregunta,
      pausado: row.pausado === 1,
      totalJugadoresPregunta: row.total_jugadores_pregunta,
      jugadores,
      respuestasActuales: JSON.parse(row.respuestas_actuales),
      preguntasActivas: JSON.parse(row.preguntas_activas),
      tokens
    };
  } catch (err) {
    logger.error({ err }, "cargarEstado: error al leer sesion");
    return null;
  }
}

/**
 * Persiste el estado de sesión en SQLite con INSERT OR REPLACE.
 * @param {object} estado — el estado a persistir (debe tener todos los campos).
 * @throws {Error} si estado es null/undefined o si falla la escritura.
 */
function guardarEstado(estado) {
  if (estado == null) throw new Error("guardarEstado: estado es null/undefined");
  const db = _initDB();
  try {
    if (estado.tokens) {
      for (const [id, t] of Object.entries(estado.tokens)) {
        if (estado.jugadores && estado.jugadores[id]) {
          estado.jugadores[id].token = t;
        }
      }
    }
    const upsert = db.transaction(() => {
      db.prepare(`
        INSERT OR REPLACE INTO sesiones(
          id, fase, pregunta_idx, tiempo_restante, tiempo_por_pregunta,
          pausado, total_jugadores_pregunta, jugadores, respuestas_actuales, preguntas_activas
        ) VALUES (
          1, @fase, @preguntaIdx, @tiempoRestante, @tiempoPorPregunta,
          @pausado, @totalJugadoresPregunta, @jugadores, @respuestasActuales, @preguntasActivas
        )
      `).run({
        fase: estado.fase,
        preguntaIdx: estado.preguntaIdx,
        tiempoRestante: estado.tiempoRestante,
        tiempoPorPregunta: estado.tiempoPorPregunta,
        pausado: estado.pausado ? 1 : 0,
        totalJugadoresPregunta: estado.totalJugadoresPregunta,
        jugadores: JSON.stringify(estado.jugadores),
        respuestasActuales: JSON.stringify(estado.respuestasActuales),
        preguntasActivas: JSON.stringify(estado.preguntasActivas),
      });
    });
    upsert();
    logger.info("guardarEstado: sesion persistida");
  } catch (err) {
    logger.error({ err }, "guardarEstado: fallo al persistir sesion");
    throw err;
  }
}

/**
 * Elimina la fila de sesión activa (útil en tests).
 */
function clearSesion() {
  const db = _initDB();
  try {
    db.prepare("DELETE FROM sesiones WHERE id = 1").run();
  } catch { /* ignore si la tabla no existe */ }
}

module.exports = {
  cargarDB,
  guardarDB,
  closeDB,
  checkpointWAL,
  cargarEstado,
  guardarEstado,
  clearSesion,
};
