const { getLocalIP, getInterfacesCandidatas } = require("../infra/utils");
const logger = require("../infra/logger");
const { logServerInfo } = require("../startup/banner");

function parseInterfaceArg() {
  const idx = process.argv.indexOf("--interface");
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
}

async function elegirInterfaz() {
  const preferida = process.env.INTERFACE || parseInterfaceArg();
  if (preferida) {
    return getLocalIP(preferida);
  }

  const candidatas = getInterfacesCandidatas();
  if (candidatas.length === 0) return "localhost";
  if (candidatas.length === 1) return candidatas[0].ip;

  if (!process.stdin.isTTY) {
    logger.info(`\nMultiples interfaces detectadas. Usando ${candidatas[0].ip} (modo no interactivo).`);
    logger.info("   Para elegir otra, definí la env INTERFACE o usá --interface <nombre>.\n");
    return candidatas[0].ip;
  }

  logger.info("\nMultiples interfaces de red detectadas:");
  candidatas.forEach((c, i) => {
    logger.info(`  ${i + 1}) ${c.nombre.padEnd(12)} - ${c.ip.padEnd(15)} - ${c.mac}`);
  });

  const rl = require("readline").createInterface({ input: process.stdin, output: process.stdout });
  const defaultIdx = candidatas.findIndex((c) => c.nombre.startsWith("wl"));
  const defaultPrompt = defaultIdx !== -1 ? defaultIdx + 1 : 1;

  return new Promise((resolve) => {
    const fallback = candidatas[Math.max(0, Math.min((defaultIdx !== -1 ? defaultIdx : 0), candidatas.length - 1))].ip;
    rl.question(`Elegi la interfaz para los alumnos [${defaultPrompt}]: `, (resp) => {
      const idx = (parseInt(resp, 10) || defaultPrompt) - 1;
      resolve(candidatas[Math.max(0, Math.min(idx, candidatas.length - 1))].ip);
      rl.close();
    });
    rl.on("close", () => resolve(fallback));
    rl.on("error", () => { rl.close(); resolve(fallback); });
  });
}

function startServer(app, localIp) {
  if (!app || !app.config) throw new Error('startServer: invalid app instance');
  const { port, adminToken } = app.config;
  if (localIp) app.ctx.localIp = localIp;
  app.httpServer.listen(port, "0.0.0.0", () => {
    logServerInfo(port, app.ctx.localIp, adminToken);
  });
}

module.exports = {
  elegirInterfaz,
  parseInterfaceArg,
  startServer,
  preguntarPorSnapshot,
};

async function preguntarPorSnapshot() {
  if (!process.stdin.isTTY) {
    return true; // En CI o sin TTY, asume usar el snapshot por defecto
  }

  const rl = require("readline").createInterface({ input: process.stdin, output: process.stdout });
  
  return new Promise((resolve) => {
    rl.question(`\nSe detectó una partida inconclusa (snapshot).\n¿Deseas reanudarla? [Y/n]: `, (resp) => {
      const answer = resp.trim().toLowerCase();
      if (answer === 'n' || answer === 'no') {
        resolve(false);
      } else {
        resolve(true);
      }
      rl.close();
    });
    rl.on("close", () => resolve(true));
    rl.on("error", () => { rl.close(); resolve(true); });
  });
}
