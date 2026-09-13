<<<<<<< HEAD
const { sendDocente, broadcast, buildRankingPayload, mostrarResultado } = require("../application/game-session");
const { guardarEstado } = require("../application/app-state");
const { FASES } = require("../domain/constants");
const logger = require("../infra/logger");
const config = require("../config");
const { verifySignedId } = require("../infra/security");
const db = require("../infra/db");
const { wsConnections, wsMessagesTotal } = require("../infra/metrics");
const { handleDocenteConecta } = require("./handlers/docente-conecta");
const { handleIniciarJuego } = require("./handlers/iniciar-juego");
const { handleSiguientePregunta, handleMostrarResultadoManual } = require("./handlers/siguiente-pregunta");
const { handleAlumnoEntra } = require("./handlers/alumno-entra");
const { handleRespuesta } = require("./handlers/respuesta");
const { handleAlternarPausa } = require("./handlers/pausar");
const { handleVolverALobby, handleReiniciarRankingGeneral } = require("./handlers/volver-lobby");
const { ejecutar: handleCambiarNombre } = require("./handlers/cambiar-nombre");
const { handleRecuperarPartida } = require("./handlers/recuperar-partida");
const { handleCrearPartida } = require("./handlers/crear-partida");

// R3-001: un id de cookie que no sea UUIDv4 NUNCA se asigna como identidad
// (gatekeeper fix): si se aceptara, llegaría a reconstruirEstado/registrarNuevo
// como identidad forzada sin pasar por la validación de msg.id.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const handlers = {
  docente_conecta:           handleDocenteConecta,
  iniciar_juego:             handleIniciarJuego,
  siguiente_pregunta:        handleSiguientePregunta,
  mostrar_resultado_manual:  handleMostrarResultadoManual,
  alumno_entra:              handleAlumnoEntra,
  respuesta:                 handleRespuesta,
  alternar_pausa:            handleAlternarPausa,
  volver_a_lobby:            handleVolverALobby,
  reiniciar_ranking_general: handleReiniciarRankingGeneral,
  cambiar_nombre:            handleCambiarNombre,
  recuperar_partida:         handleRecuperarPartida,
  crear_partida:             handleCrearPartida
};

const validTipos = new Set(Object.keys(handlers));

function attachWebSocketHandlers(wss, ctx) {
  const { state } = ctx;

  wss.on("connection", (ws, req) => {
    wsConnections.inc();

    // R1-001: Extraer ID de la cookie HttpOnly. R3-001 (gatekeeper fix): sólo
    // se acepta si es UUIDv4 — un id no-UUID nunca llega como identidad.
    // R4-001 (fix cookie): la cookie debe estar FIRMADA (HMAC-SHA256 con
    // COOKIE_SECRET). Los UUID de los jugadores viajan públicos en los
    // rankings; sin firma, cualquiera podría forjar `historia_quiz_id=<uuid>`
    // a mano y ligar la sesión de la víctima. Firma inválida/ausente → el
    // socket se trata como si no trajera cookie legítima (nunca ws.alumnoId).
    if (req && req.headers && req.headers.cookie) {
      const match = req.headers.cookie.match(/historia_quiz_id=([^;]+)/);
      if (match && match[1]) {
        const id = verifySignedId(match[1], config.COOKIE_SECRET);
        if (id && UUID_RE.test(id)) {
          ws.alumnoId = id;
        }
      }

      // Cuenta de alumno (cookie separada `historia_quiz_uid`, ver
      // auth.controller.js): si viene una sesión de cuenta válida, el
      // nombre visible del jugador pasa a ser el nombre de usuario de la
      // cuenta — ver alumno-entra.js. No reemplaza a `ws.alumnoId` (cookie
      // anónima de partida), son identidades distintas (cuenta vs. jugador).
      const matchUid = req.headers.cookie.match(/historia_quiz_uid=([^;]+)/);
      if (matchUid && matchUid[1]) {
        const usuarioId = verifySignedId(matchUid[1], config.COOKIE_SECRET);
        if (usuarioId) {
          try {
            const usuario = db.buscarUsuarioPorId(usuarioId);
            if (usuario && usuario.activo) {
              ws.usuarioId = usuario.id;
              ws.usuarioNombre = usuario.nombreUsuario;
            }
          } catch (err) {
            logger.warn({ err }, "WS: error al resolver cuenta de alumno desde cookie");
          }
        }
      }
    }

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        const preview = typeof raw === "string" ? raw.slice(0, 200) : String(raw).slice(0, 200);
        logger.warn({ preview }, "WS: mensaje no JSON recibida, ignorado");
        return;
      }

      const tipoParaMetrica = validTipos.has(msg.tipo) ? msg.tipo : "unknown";
      wsMessagesTotal.inc({ tipo: tipoParaMetrica });

      // R1-001: Si es un mensaje de alumno, forzar el ID desde la cookie autenticada
      if (ws.alumnoId && msg.tipo !== "admin_login" && msg.tipo !== "docente_login") {
        msg.id = ws.alumnoId;
      }

      const id = state.alumnos.get(ws);
      if (id && msg.tipo !== "alumno_entra") {
        state.estado.tokens = state.estado.tokens || {};
        const expectedToken = state.estado.tokens[id];
        const crypto = require("node:crypto");
        let valid = false;
        
        if (expectedToken && msg.token) {
          if (typeof msg.token !== 'string') {
            ws.send(JSON.stringify({
              tipo: "auth_rechazada",
              razon: "token_invalido"
            }));
            return;
          }
          const a = Buffer.from(expectedToken, 'utf8');
          const b = Buffer.from(msg.token, 'utf8');
          if (a.length === b.length) {
            valid = crypto.timingSafeEqual(a, b);
          }
        }
        
        if (!valid) {
          ws.send(JSON.stringify({
            tipo: "auth_rechazada",
            razon: "token_invalido"
          }));
          return;
        }
      }

      const handler = handlers[msg.tipo];
      if (handler) {
        handler(ws, msg, state, ctx);
      }
    });

    ws.on("close", () => {
      wsConnections.dec();
      const id = state.alumnos.get(ws);
      if (id) {
        // R4-002 (fix stale close): la entrada del socket que cierra se
        // remueve SIEMPRE (evita leaks en state.alumnos), pero el resto de la
        // mutación (online=false, decrement de totalJugadoresPregunta, cierre
        // de ronda) SOLO corre si este socket es el VIGENTE del id. Con D1 el
        // id de jugador ES el id de cookie: si B se cayó y ya reconectó, el
        // close tardío del socket viejo (zombie hasta el heartbeat) NO debe
        // marcar offline al jugador vivo, ni decrementar, ni cerrar la ronda.
        // El close stale tampoco borra alumnoSocketPorId — el socket vigente
        // sigue vivo. La reconexión ya reemplazó al vigente, así que el close
        // viejo no decrementa y no hace falta re-incrementar el total en
        // reconstruirEstado (la ronda ya contó al alumno reconectado).
        state.alumnos.delete(ws);
        const esSocketVigente = state.alumnoSocketPorId.get(id) === ws;
        if (!esSocketVigente) return;
        state.alumnoSocketPorId.delete(id);
        const jugador = state.estado.jugadores[id];
        const nombre = jugador ? jugador.nombre : "";
        if (jugador) {
          // R3-003: si el alumno cierra mid-pregunta SIN haber respondido,
          // decrementar totalJugadoresPregunta y notificar al docente para
          // que la ronda pueda cerrar cuando los restantes respondan.
          // Si ya respondió (respondioActual === true), su respuesta ya
          // contaba en respondieron — no se decrementa.
          if (
            state.estado.fase === FASES.PREGUNTA &&
            jugador.respondioActual !== true
          ) {
            if (state.estado.totalJugadoresPregunta > 0) {
              state.estado.totalJugadoresPregunta -= 1;
            }
            const respondieron = Object.keys(state.estado.respuestasActuales).length;
            sendDocente(state, {
              tipo: "progreso_respuestas",
              respondieron,
              total: state.estado.totalJugadoresPregunta,
              respondieronIds: Object.keys(state.estado.respuestasActuales)
            });
            // R3-003: si al desconectarse el alumno, ya nadie puede responder
            // (total=0) o los que ya respondieron completaron el set, cerrar
            // la ronda manualmente en vez de esperar al timer absoluto.
            if (respondieron >= state.estado.totalJugadoresPregunta) {
              clearTimeout(state.timer);
              state.timer = null;
              mostrarResultado(state);
            }
          }
          jugador.online = false;
          sendDocente(state, {
            tipo: "jugador_desconectado",
            id,
            nombre,
            ...buildRankingPayload(state.estado.jugadores),
          });
          if (nombre) {
            broadcast(state, { tipo: "jugador_desconectado_alumno", nombre });
          }
        }
      }
      if (ws === state.docente) {
        // Auto-pausar si el docente se desconecta durante una pregunta activa
        if (state.estado.fase === FASES.PREGUNTA && !state.estado.pausado) {
          state.estado.pausado = true;
          state.autoPausado = true;
          clearTimeout(state.timer);
          state.timer = null;
          broadcast(state, { tipo: "juego_pausado", razon: "docente_desconectado" });
          logger.info("Auto-pausa: docente desconectado durante pregunta");
          guardarEstado(state.estado);
        }
        state.docente = null;
      }
    });
  });
}

module.exports = { attachWebSocketHandlers };
=======
const { sendDocente, broadcast, buildRankingPayload, mostrarResultado } = require("../application/game-session");
const { guardarEstado } = require("../application/app-state");
const { FASES } = require("../domain/constants");
const logger = require("../infra/logger");
const config = require("../config");
const { verifySignedId } = require("../infra/security");
const { wsConnections, wsMessagesTotal } = require("../infra/metrics");
const { handleDocenteConecta } = require("./handlers/docente-conecta");
const { handleIniciarJuego } = require("./handlers/iniciar-juego");
const { handleSiguientePregunta, handleMostrarResultadoManual } = require("./handlers/siguiente-pregunta");
const { handleAlumnoEntra } = require("./handlers/alumno-entra");
const { handleRespuesta } = require("./handlers/respuesta");
const { handleAlternarPausa } = require("./handlers/pausar");
const { handleVolverALobby, handleReiniciarRankingGeneral } = require("./handlers/volver-lobby");
const { ejecutar: handleCambiarNombre } = require("./handlers/cambiar-nombre");
const { handleRecuperarPartida } = require("./handlers/recuperar-partida");

// R3-001: un id de cookie que no sea UUIDv4 NUNCA se asigna como identidad
// (gatekeeper fix): si se aceptara, llegaría a reconstruirEstado/registrarNuevo
// como identidad forzada sin pasar por la validación de msg.id.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const handlers = {
  docente_conecta:           handleDocenteConecta,
  iniciar_juego:             handleIniciarJuego,
  siguiente_pregunta:        handleSiguientePregunta,
  mostrar_resultado_manual:  handleMostrarResultadoManual,
  alumno_entra:              handleAlumnoEntra,
  respuesta:                 handleRespuesta,
  alternar_pausa:            handleAlternarPausa,
  volver_a_lobby:            handleVolverALobby,
  reiniciar_ranking_general: handleReiniciarRankingGeneral,
  cambiar_nombre:            handleCambiarNombre,
  recuperar_partida:         handleRecuperarPartida
};

const validTipos = new Set(Object.keys(handlers));

function attachWebSocketHandlers(wss, ctx) {
  const { state } = ctx;

  wss.on("connection", (ws, req) => {
    wsConnections.inc();

    // R1-001: Extraer ID de la cookie HttpOnly. R3-001 (gatekeeper fix): sólo
    // se acepta si es UUIDv4 — un id no-UUID nunca llega como identidad.
    // R4-001 (fix cookie): la cookie debe estar FIRMADA (HMAC-SHA256 con
    // COOKIE_SECRET). Los UUID de los jugadores viajan públicos en los
    // rankings; sin firma, cualquiera podría forjar `historia_quiz_id=<uuid>`
    // a mano y ligar la sesión de la víctima. Firma inválida/ausente → el
    // socket se trata como si no trajera cookie legítima (nunca ws.alumnoId).
    if (req && req.headers && req.headers.cookie) {
      const match = req.headers.cookie.match(/historia_quiz_id=([^;]+)/);
      if (match && match[1]) {
        const id = verifySignedId(match[1], config.COOKIE_SECRET);
        if (id && UUID_RE.test(id)) {
          ws.alumnoId = id;
        }
      }
    }

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        const preview = typeof raw === "string" ? raw.slice(0, 200) : String(raw).slice(0, 200);
        logger.warn({ preview }, "WS: mensaje no JSON recibida, ignorado");
        return;
      }

      const tipoParaMetrica = validTipos.has(msg.tipo) ? msg.tipo : "unknown";
      wsMessagesTotal.inc({ tipo: tipoParaMetrica });

      // R1-001: Si es un mensaje de alumno, forzar el ID desde la cookie autenticada
      if (ws.alumnoId && msg.tipo !== "admin_login" && msg.tipo !== "docente_login") {
        msg.id = ws.alumnoId;
      }

      const id = state.alumnos.get(ws);
      if (id && msg.tipo !== "alumno_entra") {
        state.estado.tokens = state.estado.tokens || {};
        const expectedToken = state.estado.tokens[id];
        const crypto = require("node:crypto");
        let valid = false;
        
        if (expectedToken && msg.token) {
          if (typeof msg.token !== 'string') {
            ws.send(JSON.stringify({
              tipo: "auth_rechazada",
              razon: "token_invalido"
            }));
            return;
          }
          const a = Buffer.from(expectedToken, 'utf8');
          const b = Buffer.from(msg.token, 'utf8');
          if (a.length === b.length) {
            valid = crypto.timingSafeEqual(a, b);
          }
        }
        
        if (!valid) {
          ws.send(JSON.stringify({
            tipo: "auth_rechazada",
            razon: "token_invalido"
          }));
          return;
        }
      }

      const handler = handlers[msg.tipo];
      if (handler) {
        handler(ws, msg, state, ctx);
      }
    });

    ws.on("close", () => {
      wsConnections.dec();
      const id = state.alumnos.get(ws);
      if (id) {
        // R4-002 (fix stale close): la entrada del socket que cierra se
        // remueve SIEMPRE (evita leaks en state.alumnos), pero el resto de la
        // mutación (online=false, decrement de totalJugadoresPregunta, cierre
        // de ronda) SOLO corre si este socket es el VIGENTE del id. Con D1 el
        // id de jugador ES el id de cookie: si B se cayó y ya reconectó, el
        // close tardío del socket viejo (zombie hasta el heartbeat) NO debe
        // marcar offline al jugador vivo, ni decrementar, ni cerrar la ronda.
        // El close stale tampoco borra alumnoSocketPorId — el socket vigente
        // sigue vivo. La reconexión ya reemplazó al vigente, así que el close
        // viejo no decrementa y no hace falta re-incrementar el total en
        // reconstruirEstado (la ronda ya contó al alumno reconectado).
        state.alumnos.delete(ws);
        const esSocketVigente = state.alumnoSocketPorId.get(id) === ws;
        if (!esSocketVigente) return;
        state.alumnoSocketPorId.delete(id);
        const jugador = state.estado.jugadores[id];
        const nombre = jugador ? jugador.nombre : "";
        if (jugador) {
          // R3-003: si el alumno cierra mid-pregunta SIN haber respondido,
          // decrementar totalJugadoresPregunta y notificar al docente para
          // que la ronda pueda cerrar cuando los restantes respondan.
          // Si ya respondió (respondioActual === true), su respuesta ya
          // contaba en respondieron — no se decrementa.
          if (
            state.estado.fase === FASES.PREGUNTA &&
            jugador.respondioActual !== true
          ) {
            if (state.estado.totalJugadoresPregunta > 0) {
              state.estado.totalJugadoresPregunta -= 1;
            }
            const respondieron = Object.keys(state.estado.respuestasActuales).length;
            sendDocente(state, {
              tipo: "progreso_respuestas",
              respondieron,
              total: state.estado.totalJugadoresPregunta,
              respondieronIds: Object.keys(state.estado.respuestasActuales)
            });
            // R3-003: si al desconectarse el alumno, ya nadie puede responder
            // (total=0) o los que ya respondieron completaron el set, cerrar
            // la ronda manualmente en vez de esperar al timer absoluto.
            if (respondieron >= state.estado.totalJugadoresPregunta) {
              clearTimeout(state.timer);
              state.timer = null;
              mostrarResultado(state);
            }
          }
          jugador.online = false;
          sendDocente(state, {
            tipo: "jugador_desconectado",
            id,
            nombre,
            ...buildRankingPayload(state.estado.jugadores),
          });
          if (nombre) {
            broadcast(state, { tipo: "jugador_desconectado_alumno", nombre });
          }
        }
      }
      if (ws === state.docente) {
        // Auto-pausar si el docente se desconecta durante una pregunta activa
        if (state.estado.fase === FASES.PREGUNTA && !state.estado.pausado) {
          state.estado.pausado = true;
          state.autoPausado = true;
          clearTimeout(state.timer);
          state.timer = null;
          broadcast(state, { tipo: "juego_pausado", razon: "docente_desconectado" });
          logger.info("Auto-pausa: docente desconectado durante pregunta");
          guardarEstado(state.estado);
        }
        state.docente = null;
      }
    });
  });
}

module.exports = { attachWebSocketHandlers };
>>>>>>> origin/main
