const client = require('prom-client');
const register = new client.Registry();

// Default metrics (process CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register]
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register]
});

const wsConnections = new client.Gauge({
  name: 'ws_connections_active',
  help: 'Active WebSocket connections',
  registers: [register]
});

const wsMessagesTotal = new client.Counter({
  name: 'ws_messages_total',
  help: 'Total WebSocket messages received',
  labelNames: ['tipo'],
  registers: [register]
});

const gamePhase = new client.Gauge({
  name: 'game_phase',
  help: 'Current game phase (0=lobby, 1=pregunta, 2=resultado, 3=fin)',
  registers: [register]
});

const gamePlayers = new client.Gauge({
  name: 'game_players',
  help: 'Number of connected players',
  registers: [register]
});

const broadcastDropsTotal = new client.Counter({
  name: 'broadcast_drops_total',
  help: 'Total broadcast messages dropped due to backpressure',
  registers: [register]
});

module.exports = {
  register,
  httpRequestsTotal,
  httpRequestDuration,
  wsConnections,
  wsMessagesTotal,
  gamePhase,
  gamePlayers,
  broadcastDropsTotal
};
