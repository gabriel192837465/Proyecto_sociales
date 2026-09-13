const pino = require("pino");

const isDev = process.stdout.isTTY && process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" },
        },
      }
    : {}),
});

module.exports = logger;
