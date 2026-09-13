const { HEARTBEAT_INTERVAL_MS } = require("../domain/constants");

function startHeartbeat(wss, state) {
  wss.on("connection", (ws) => {
    ws._isAlive = true;
    ws.on("pong", () => { ws._isAlive = true; });
  });

  if (state.hbTimer) clearInterval(state.hbTimer);
  state.hbTimer = setInterval(() => {
    if (!wss.clients || typeof wss.clients.forEach !== 'function') return;
    wss.clients.forEach((ws) => {
      if (ws._isAlive === false) {
        ws.terminate();
        return;
      }
      ws._isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL_MS).unref();
}

module.exports = {
  startHeartbeat,
};
