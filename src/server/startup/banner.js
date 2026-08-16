const logger = require("../infra/logger");

function handleServerError(err) {
  if (err.code === "EADDRINUSE") {
    logger.error(`\nEl puerto ${process.env.PORT || 3000} ya está en uso.`);
    logger.error("   Probablemente el servidor ya está corriendo o quedó un proceso colgado.");
    logger.error("   Ejecutá: pnpm run stop   y después: pnpm start\n");
    process.exit(1);
  } else {
    logger.error({ err }, "Error al iniciar el servidor");
    process.exit(1);
  }
}

function logServerInfo(port, localIp, adminToken) {
  logger.info(`\nHistoria Quiz Server\n`);
  logger.info(`Panel del DOCENTE:     http://localhost:${port}/docente.html`);
  logger.info(`Los ALUMNOS entran:    http://${localIp}:${port}/alumno.html\n`);

  if (adminToken === "historia") {
    logger.warn("ADVERTENCIA DE SEGURIDAD:");
    logger.warn("   Estás usando la clave predeterminada 'historia'.");
    logger.warn("   Para despliegues de producción, definí la variable de entorno");
    logger.warn("   HISTORIA_ADMIN_TOKEN con una contraseña segura.\n");
  }
}

module.exports = {
  handleServerError,
  logServerInfo,
};
