const fs = require("fs");

module.exports = async (config) => {
  const dbDir = config.webServer.env.HISTORIA_E2E_DB_DIR;
  fs.mkdirSync(dbDir, { recursive: true });
};
