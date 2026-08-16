const http = require("node:http");
const WebSocket = require("ws");
const config = require("./config");
const { getLocalIP } = require("./infra/utils");
const { createAppState, resetForTests, cargarEstado, guardarEstado } = require("./application/app-state");
const { FASES } = require("./domain/constants");
const { createRequestHandler } = require("./http/router");
const { attachWebSocketHandlers } = require("./ws/dispatcher");
const { closeDB, checkpointWAL } = require("./infra/db");
const logger = require("./infra/logger");
const { HEARTBEAT_INTERVAL_MS, MAX_WS_PAYLOAD } = require("./domain/constants");
const { startHeartbeat } = require("./ws/heartbeat");
const { handleServerError, logServerInfo } = require("./startup/banner");
const { elegirInterfaz, parseInterfaceArg, startServer } = require("./net/picker");
const metrics = require("./infra/metrics");

/**
 * Factory que arma el servidor HTTP + WebSocket con sus handlers.
 *
 * @param {object} [deps] - Dependencias inyectables (útil para tests).
 * @param {object} [deps.state]     - Estado de aplicación pre-armado.
 * @param {string} [deps.adminToken] - Token admin. Default: config.
 * @param {number} [deps.port]       - Puerto. Default: config.PORT.
 * @param {string} [deps.localIp]   - IP local. Default: getLocalIP().
 *
 * @returns {{
 *   httpServer: import('http').Server,
 *   wss: import('ws').WebSocketServer,
 *   state: object,
 *   ctx: object,
 *   config: { adminToken: string, port: number, localIp: string },
 *   resetForTests: () => void,
 *   handleServerError: (err: NodeJS.ErrnoException) => void,
 *   logServerInfo: (port: number, ip: string, token: string) => void,
 *   elegirInterfaz: () => Promise<string>,
 *   parseInterfaceArg: () => string|null,
 *   startServer: (localIp?: string) => void,
 * }}
 */
function createApp(deps = {}) {
  const state = deps.state || createAppState();

  const snapshot = cargarEstado();
  if (snapshot) {
    state.estado.fase = snapshot.fase;
    state.estado.preguntaIdx = snapshot.preguntaIdx;
    state.estado.tiempoRestante = snapshot.tiempoRestante;
    state.estado.tiempoPorPregunta = snapshot.tiempoPorPregunta;
    state.estado.pausado = snapshot.pausado;
    state.estado.totalJugadoresPregunta = snapshot.totalJugadoresPregunta;
    state.estado.jugadores = snapshot.jugadores;
    state.estado.respuestasActuales = snapshot.respuestasActuales;
    state.estado.preguntasActivas = snapshot.preguntasActivas;
    state.estado.tokens = snapshot.tokens || {};
    state.snapshotRecuperado = true;
    logger.info("Snapshot recuperado: partida pendiente en fase %s (pregunta %d)", snapshot.fase, snapshot.preguntaIdx);
  }

  const adminToken = deps.adminToken || config.HISTORIA_ADMIN_TOKEN;
  const port = deps.port || config.PORT;
  const localIp = deps.localIp || getLocalIP();

  // ctx.db es un getter: resetForTests() reasigna state.db y los handlers
  // deben leer la referencia actual (no una copia capturada al crear ctx).
  const ctx = { state, get db() { return state.db; }, adminToken, localIp, port, config, metrics };

  const httpServer = http.createServer(createRequestHandler(ctx));
  const wss = new WebSocket.Server({
    server: httpServer,
    maxPayload: MAX_WS_PAYLOAD,
    verifyClient: config.ALLOWED_ORIGINS
      ? (info, cb) => {
          // Allow connections with no origin header (non-browser clients)
          if (!info.origin) { cb(true); return; }
          if (config.ALLOWED_ORIGINS.includes(info.origin)) { cb(true); return; }
          logger.warn("WS origin rejected: %s", info.origin);
          cb(false, 403, "Origin not allowed");
        }
      : undefined,
  });
  state.wss = wss;

  startHeartbeat(wss, state);
  attachWebSocketHandlers(wss, ctx);

  const app = {
    httpServer,
    wss,
    state,
    ctx,
    config: { adminToken, port, localIp },
    resetForTests: () => {
      resetForTests(state);
    },
    handleServerError,
    logServerInfo,
    elegirInterfaz,
    parseInterfaceArg,
    startServer: (localIpOverride) => startServer(app, localIpOverride),
    /**
     * Graceful shutdown — secuencia de 8 pasos:
     * 1. httpServer.close() — dejar de aceptar nuevas conexiones HTTP
     * 2. Broadcast servidor_cerrando a todos los WS clientes
     * 3. Esperar ~500ms para drenar mensajes WS in-flight
     * 4. guardarEstado() si hay partida activa (fase !== lobby)
     * 5. checkpointWAL() — comprimir WAL de SQLite
     * 6. Cerrar todas las conexiones WS con code 1001
     * 7. Esperar a que HTTP server drene (callback de httpServer.close)
     * 8. closeDB() — cerrar conexión SQLite
     */
    shutdown(done) {
      logger.info("Apagando servidor…");
      state.estado._shuttingDown = true;

      // Paso 1: dejar de aceptar nuevas conexiones HTTP
      httpServer.close();

      // Paso 2: broadcast servidor_cerrando para que clientes deshabiliten reconexión
      const shutdownMsg = JSON.stringify({ tipo: "servidor_cerrando" });
      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          try { client.send(shutdownMsg); } catch { /* ignore */ }
        }
      });

      // Paso 3: esperar que los WS clients se cierren solos tras el shutdownMsg, max 500ms
      setTimeout(() => {
        // Paso 4: guardar snapshot si hay partida activa
        if (state.estado.fase !== FASES.LOBBY) {
          try { guardarEstado(state.estado); } catch (err) {
            logger.warn({ err }, "shutdown: error al guardar estado, continuando");
          }
        }

        // Paso 5: checkpoint WAL
        checkpointWAL();

        // Paso 6: cerrar todas las conexiones WS
        wss.clients.forEach((client) => {
          try { client.close(1001, "Server shutting down"); } catch { /* ignore */ }
        });

        // Paso 7 y 8: esperar HTTP drain → cerrar SQLite
        httpServer.closeAllConnections?.();
        httpServer.close(() => {
          closeDB();
          logger.info("Servidor apagado.");
          done?.();
        });
      }, 500);
    },
  };

  return app;
}

module.exports = { createApp };
