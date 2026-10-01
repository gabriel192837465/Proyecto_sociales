const fs = require("node:fs");
const path = require("node:path");

const dbDir = process.env.HISTORIA_E2E_DB_DIR || path.join(__dirname, "../../.playwright-tmp");
fs.mkdirSync(dbDir, { recursive: true });
const dbPath = path.join(dbDir, "e2e-test.db");
process.env.HISTORIA_DB_PATH = dbPath;

for (const suffix of ["", "-wal", "-shm"]) {
  try { fs.unlinkSync(`${dbPath}${suffix}`); } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

const server = require("../../src/server");
const shutdown = () => server.shutdown(() => {
  try { fs.rmSync(dbDir, { recursive: true, force: true }); } catch { /* Windows puede liberar el WAL al salir */ }
  process.exit(0);
});
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
server.startServer("127.0.0.1");
