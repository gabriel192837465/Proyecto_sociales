<<<<<<< HEAD
const fs = require("fs");

/**
 * Cierra la conexión SQLite activa (libera el lock del .db en Windows).
 */
function closeDB() {
  try {
    const db = require("../../src/server/infra/db");
    db.closeDB();
  } catch { /* ignore */ }
}

/**
 * Reset de base de datos para tests: cierra la conexión SQLite y borra el
 * archivo .db para que el próximo test parta de cero.
 *
 * @param {string} tmpPath  Ruta al archivo .db temporal
 */
function resetTestDB(tmpPath) {
  closeDB();
  try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
}

module.exports = { closeDB, resetTestDB };
=======
const fs = require("fs");

/**
 * Cierra la conexión SQLite activa (libera el lock del .db en Windows).
 */
function closeDB() {
  try {
    const db = require("../../src/server/infra/db");
    db.closeDB();
  } catch { /* ignore */ }
}

/**
 * Reset de base de datos para tests: cierra la conexión SQLite y borra el
 * archivo .db para que el próximo test parta de cero.
 *
 * @param {string} tmpPath  Ruta al archivo .db temporal
 */
function resetTestDB(tmpPath) {
  closeDB();
  try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
}

module.exports = { closeDB, resetTestDB };
>>>>>>> origin/main
