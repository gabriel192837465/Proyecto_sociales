<<<<<<< HEAD
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
      epoca TEXT DEFAULT 'General',
      tipo TEXT DEFAULT 'multiple_choice',
      materia TEXT DEFAULT 'Historia',
      media_tipo TEXT DEFAULT '',
      media_url TEXT DEFAULT ''
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

    CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      nombre_usuario TEXT NOT NULL UNIQUE,
      rol TEXT NOT NULL DEFAULT 'alumno',
      creado_en TEXT NOT NULL,
      activo INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
    CREATE INDEX IF NOT EXISTS idx_usuarios_nombre_usuario ON usuarios(nombre_usuario);
  `);

  // Migración aditiva: agregar codigo_partida a `sesiones` si la tabla ya
  // existía sin esa columna (bases creadas antes de esta feature).
  const columnas = _db.prepare("PRAGMA table_info(sesiones)").all().map(c => c.name);
  if (!columnas.includes("codigo_partida")) {
    _db.exec("ALTER TABLE sesiones ADD COLUMN codigo_partida TEXT");
  }
  if (!columnas.includes("curso_seleccionado")) {
    _db.exec("ALTER TABLE sesiones ADD COLUMN curso_seleccionado TEXT");
  }
  if (!columnas.includes("banco_id_seleccionado")) {
    _db.exec("ALTER TABLE sesiones ADD COLUMN banco_id_seleccionado TEXT");
  }

  const columnasPreguntas = _db.prepare("PRAGMA table_info(preguntas)").all().map(c => c.name);
  if (!columnasPreguntas.includes("tipo")) _db.exec("ALTER TABLE preguntas ADD COLUMN tipo TEXT DEFAULT 'multiple_choice'");
  if (!columnasPreguntas.includes("materia")) _db.exec("ALTER TABLE preguntas ADD COLUMN materia TEXT DEFAULT 'Historia'");
  if (!columnasPreguntas.includes("media_tipo")) _db.exec("ALTER TABLE preguntas ADD COLUMN media_tipo TEXT DEFAULT ''");
  if (!columnasPreguntas.includes("media_url")) _db.exec("ALTER TABLE preguntas ADD COLUMN media_url TEXT DEFAULT ''");

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
    "INSERT OR REPLACE INTO preguntas(id, banco_id, pregunta, opciones, correcta, epoca, tipo, materia, media_tipo, media_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );

  const seedTx = _db.transaction(() => {
    for (const b of bancos) {
      insertBanco.run(b.id, b.nombre, b.nivel || "", b.anio || "", b.tema || "");
      for (const p of (b.preguntas || [])) {
        insertPregunta.run(p.id, b.id, p.pregunta, JSON.stringify(p.opciones), p.correcta, p.epoca || "General", p.tipo || "multiple_choice", p.materia || "Historia", p.mediaTipo || "", p.mediaUrl || "");
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
    p.tipo = p.tipo || "multiple_choice";
    p.materia = p.materia || "Historia";
    p.mediaTipo = p.media_tipo || "";
    p.mediaUrl = p.media_url || "";
    delete p.media_tipo;
    delete p.media_url;
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
    "INSERT OR REPLACE INTO preguntas(id, banco_id, pregunta, opciones, correcta, epoca, tipo, materia, media_tipo, media_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );

  const saveTx = db.transaction(() => {
    const bankIds = [];
    const questionIds = [];
    for (const b of data.bancos) {
      bankIds.push(b.id);
      insertBanco.run(b.id, b.nombre, b.nivel || "", b.anio || "", b.tema || "");
      for (const p of (b.preguntas || [])) {
        questionIds.push(p.id);
        insertPregunta.run(p.id, b.id, p.pregunta, JSON.stringify(p.opciones), p.correcta, p.epoca || "General", p.tipo || "multiple_choice", p.materia || "Historia", p.mediaTipo || "", p.mediaUrl || "");
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
      codigoPartida: row.codigo_partida || null,
      cursoSeleccionado: row.curso_seleccionado || null,
      bancoIdSeleccionado: row.banco_id_seleccionado || null,
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
          pausado, total_jugadores_pregunta, jugadores, respuestas_actuales, preguntas_activas,
          codigo_partida, curso_seleccionado, banco_id_seleccionado
        ) VALUES (
          1, @fase, @preguntaIdx, @tiempoRestante, @tiempoPorPregunta,
          @pausado, @totalJugadoresPregunta, @jugadores, @respuestasActuales, @preguntasActivas,
          @codigoPartida, @cursoSeleccionado, @bancoIdSeleccionado
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
        codigoPartida: estado.codigoPartida || null,
        cursoSeleccionado: estado.cursoSeleccionado || null,
        bancoIdSeleccionado: estado.bancoIdSeleccionado || null,
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

// ── Usuarios (cuentas de alumno) ───────────────────────────────────────────

function _rowToUsuario(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    nombreUsuario: row.nombre_usuario,
    rol: row.rol,
    creadoEn: row.creado_en,
    activo: row.activo === 1
  };
}

/**
 * Crea un usuario nuevo. Lanza si el email o nombreUsuario ya existen
 * (constraint UNIQUE de SQLite) — el llamador debe verificar antes con
 * buscarUsuarioPorEmail/buscarUsuarioPorNombreUsuario para dar un mensaje
 * de error claro, pero esta función también es segura ante condiciones de
 * carrera gracias al UNIQUE constraint.
 */
function crearUsuario({ id, email, passwordHash, nombreUsuario, rol = "alumno" }) {
  const db = _initDB();
  const creadoEn = new Date().toISOString();
  db.prepare(`
    INSERT INTO usuarios(id, email, password_hash, nombre_usuario, rol, creado_en, activo)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(id, email, passwordHash, nombreUsuario, rol, creadoEn);
  return _rowToUsuario({ id, email, password_hash: passwordHash, nombre_usuario: nombreUsuario, rol, creado_en: creadoEn, activo: 1 });
}

function buscarUsuarioPorEmail(email) {
  const db = _initDB();
  const row = db.prepare("SELECT * FROM usuarios WHERE email = ?").get(String(email).toLowerCase());
  return _rowToUsuario(row);
}

function buscarUsuarioPorNombreUsuario(nombreUsuario) {
  const db = _initDB();
  const row = db.prepare("SELECT * FROM usuarios WHERE nombre_usuario = ? COLLATE NOCASE").get(nombreUsuario);
  return _rowToUsuario(row);
}

function buscarUsuarioPorId(id) {
  const db = _initDB();
  const row = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(id);
  return _rowToUsuario(row);
}

function listarUsuarios() {
  const db = _initDB();
  const rows = db.prepare("SELECT * FROM usuarios ORDER BY creado_en DESC").all();
  return rows.map(_rowToUsuario);
}

function setUsuarioActivo(id, activo) {
  const db = _initDB();
  db.prepare("UPDATE usuarios SET activo = ? WHERE id = ?").run(activo ? 1 : 0, id);
}

// ── Meta (clave/valor genérico) y mapeo curso → banco ──────────────────────
// Sección 13 del pedido: "1° año → Ciencias Sociales - 1°", etc. Se guarda
// como configuración (tabla `meta`, ya existente en el schema) en vez de
// hardcodear nombres de banco — el admin la configura una vez desde el
// panel administrativo y el flujo normal del docente sólo elige el curso.

function getMeta(key) {
  const db = _initDB();
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return row ? row.value : null;
}

function setMeta(key, value) {
  const db = _initDB();
  db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)").run(key, value);
}

const CURSO_BANCO_META_KEY = "curso_banco_map";

/** @returns {Object<string,string>} mapa curso -> bancoId (vacío si no se configuró nada). */
function getCursoBancoMap() {
  const raw = getMeta(CURSO_BANCO_META_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object") ? parsed : {};
  } catch {
    return {};
  }
}

/** Asocia un curso (p. ej. "1°") a un bancoId. */
function setCursoBanco(curso, bancoId) {
  const mapa = getCursoBancoMap();
  mapa[curso] = bancoId;
  setMeta(CURSO_BANCO_META_KEY, JSON.stringify(mapa));
  return mapa;
}

/** Quita la asociación de un curso (para cuando se borra un banco, por ejemplo). */
function quitarCursoBanco(curso) {
  const mapa = getCursoBancoMap();
  delete mapa[curso];
  setMeta(CURSO_BANCO_META_KEY, JSON.stringify(mapa));
  return mapa;
}

module.exports = {
  cargarDB,
  guardarDB,
  closeDB,
  checkpointWAL,
  cargarEstado,
  guardarEstado,
  clearSesion,
  crearUsuario,
  buscarUsuarioPorEmail,
  buscarUsuarioPorNombreUsuario,
  buscarUsuarioPorId,
  listarUsuarios,
  setUsuarioActivo,
  getMeta,
  setMeta,
  getCursoBancoMap,
  setCursoBanco,
  quitarCursoBanco,
};
=======
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
>>>>>>> origin/main
