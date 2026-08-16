const fs = require("fs");
const path = require("path");
const { resetTestDB } = require("../helpers/db");

module.exports = async () => {
  // Limpiar estado del juego de ejecuciones anteriores
  const statePath = path.resolve(__dirname, "../../data/estado-juego.json");
  if (fs.existsSync(statePath)) {
    fs.unlinkSync(statePath);
  }

  // Limpiar base de datos SQLite si existe (cierra conexión primero en Windows)
  const dbPath = path.resolve(__dirname, "../../data/historia-quiz.db");
  resetTestDB(dbPath);

  // También limpiar posibles archivos .db de tests anteriores
  const rootDir = path.resolve(__dirname, "../..");
  const files = fs.readdirSync(rootDir);
  for (const f of files) {
    if (f.startsWith("tmp-test") && (f.endsWith(".db") || f.endsWith(".json"))) {
      try { fs.unlinkSync(path.join(rootDir, f)); } catch { /* ignore */ }
    }
    if (f.startsWith("tmp-load") && (f.endsWith(".db") || f.endsWith(".json"))) {
      try { fs.unlinkSync(path.join(rootDir, f)); } catch { /* ignore */ }
    }
  }

  // Restaurar DB de preguntas al estado inicial (legacy — copia los defaults)
  // para los tests de integración que cargan server antes de que resetForTests
  // corra cargarDB() que seedea desde defaults.
  const dbPathLegacy = path.resolve(__dirname, "../../data/preguntas.json");
  const defaultDbPath = path.resolve(__dirname, "../../src/server/infra/default-bancos.json");
  if (fs.existsSync(dbPathLegacy)) {
    fs.unlinkSync(dbPathLegacy);
  }
  fs.copyFileSync(defaultDbPath, dbPathLegacy);
};
