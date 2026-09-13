const fs = require("node:fs");
const path = require("node:path");

const dbPath = path.resolve(__dirname, "../../data/e2e-test.db");
process.env.HISTORIA_DB_PATH = dbPath;

for (const suffix of ["", "-wal", "-shm"]) {
  try { fs.unlinkSync(`${dbPath}${suffix}`); } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

const server = require("../../src/server");
const shutdown = () => server.shutdown(() => process.exit(0));
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
server.startServer("127.0.0.1");
