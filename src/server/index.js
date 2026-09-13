<<<<<<< HEAD
const { createApp } = require("./app");
const { handleServerError } = require("./startup/banner");
const logger = require("./infra/logger");

const app = createApp();
app.httpServer.on("error", handleServerError);

// Graceful shutdown on signals (only in production, tests don't register)
if (require.main === module) {
  const onShutdown = () => app.shutdown(() => process.exit(0));
  process.on("SIGTERM", onShutdown);
  process.on("SIGINT", onShutdown);

  process.on("uncaughtException", (err) => {
    logger.error({ err }, "uncaughtException — shutting down");
    app.shutdown(() => process.exit(1));
  });

  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "unhandledRejection — shutting down");
    app.shutdown(() => process.exit(1));
  });

  (async () => {
    if (app.state.snapshotRecuperado) {
      const { preguntarPorSnapshot } = require("./net/picker");
      const { borrarSnapshot } = require("./application/app-state");
      const { crearEstadoInicial } = require("./domain/game");
      
      const useSnapshot = await preguntarPorSnapshot();
      if (!useSnapshot) {
        borrarSnapshot();
        app.state.estado = crearEstadoInicial();
        app.state.snapshotRecuperado = false;
        logger.info("Snapshot descartado. Iniciando partida nueva.");
      }
    }
    const ip = await app.elegirInterfaz();
    app.startServer(ip);
  })();
}

// Backward-compat: tests existentes importan este archivo como si fuera el antiguo server.js.
// El http.Server conserva los mismos métodos que antes.
const server = app.httpServer;
server.app = app;
server.resetForTests = app.resetForTests;
server.logServerInfo = app.logServerInfo;
server.startServer = app.startServer;
server.handleServerError = app.handleServerError;
server.shutdown = app.shutdown;

module.exports = server;
=======
const { createApp } = require("./app");
const { handleServerError } = require("./startup/banner");
const logger = require("./infra/logger");

const app = createApp();
app.httpServer.on("error", handleServerError);

// Graceful shutdown on signals (only in production, tests don't register)
if (require.main === module) {
  const onShutdown = () => app.shutdown(() => process.exit(0));
  process.on("SIGTERM", onShutdown);
  process.on("SIGINT", onShutdown);

  process.on("uncaughtException", (err) => {
    logger.error({ err }, "uncaughtException — shutting down");
    app.shutdown(() => process.exit(1));
  });

  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "unhandledRejection — shutting down");
    app.shutdown(() => process.exit(1));
  });

  (async () => {
    if (app.state.snapshotRecuperado) {
      const { preguntarPorSnapshot } = require("./net/picker");
      const { borrarSnapshot } = require("./application/app-state");
      const { crearEstadoInicial } = require("./domain/game");
      
      const useSnapshot = await preguntarPorSnapshot();
      if (!useSnapshot) {
        borrarSnapshot();
        app.state.estado = crearEstadoInicial();
        app.state.snapshotRecuperado = false;
        logger.info("Snapshot descartado. Iniciando partida nueva.");
      }
    }
    const ip = await app.elegirInterfaz();
    app.startServer(ip);
  })();
}

// Backward-compat: tests existentes importan este archivo como si fuera el antiguo server.js.
// El http.Server conserva los mismos métodos que antes.
const server = app.httpServer;
server.app = app;
server.resetForTests = app.resetForTests;
server.logServerInfo = app.logServerInfo;
server.startServer = app.startServer;
server.handleServerError = app.handleServerError;
server.shutdown = app.shutdown;

module.exports = server;
>>>>>>> origin/main
