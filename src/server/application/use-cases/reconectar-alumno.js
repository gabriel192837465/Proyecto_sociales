<<<<<<< HEAD
const crypto = require("node:crypto");
const { sendDocente, broadcast, jugadoresOnline, buildRankingPayload } = require("../game-session");
const { FASES } = require("../../domain/constants");

// R3-001: UUIDv4 estricto (versión 4 + variant 8/9/a/b en el tercer grupo).
// crypto.randomUUID() siempre produce v4 canónico. La forma laxa de 8-4-4-4-12
// aceptaba cualquier hex-shaped, lo que dejaba superficie para ids no-v4.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reconstruirEstado(ws, state, id, nombre, token) {
  // R3-001: Object.hasOwn reemplaza el `in` o acceso directo — previene
  // prototype pollution si el id viene manipulado (aunque UUID_RE ya lo filtra).
  if (!Object.hasOwn(state.estado.jugadores, id)) return;

  state.estado.tokens = state.estado.tokens || {};
  const expectedToken = state.estado.tokens[id];
  // Gatekeeper fix: el token fresco (que repara la sesión) SOLO se entrega al
  // socket cuyo id de cookie coincide con el id presentado (ws.alumnoId === id).
  // Un socket raw o con cookie ajena recibe el rechazo muerto SIN token —
  // si no, cualquiera que conozca id+nombre obtendría una sesión y kickearía
  // a la víctima rotando su token. El fallback N=3 del cliente cubre el caso.
  const rechazarTokenRotado = () => {
    if (ws.alumnoId === id) {
      state.estado.tokens[id] = crypto.randomBytes(24).toString("base64url");
      ws.send(JSON.stringify({ tipo: "auth_rechazada", razon: "token_rotado", token: state.estado.tokens[id] }));
    } else {
      ws.send(JSON.stringify({ tipo: "auth_rechazada", razon: "token_rotado" }));
    }
  };
  if (expectedToken !== undefined) {
    if (!token || typeof token !== 'string') {
      rechazarTokenRotado();
      return;
    }
    const a = Buffer.from(expectedToken, 'utf8');
    const b = Buffer.from(token, 'utf8');
    let valid = false;
    if (a.length === b.length) {
      valid = crypto.timingSafeEqual(a, b);
    }
    if (!valid) {
      rechazarTokenRotado();
      return;
    }
  } else {
    // Grace window: issue a secondary token
    state.estado.tokens[id] = crypto.randomBytes(24).toString("base64url");
  }

  const j = state.estado.jugadores[id];
  j.online = true;
  state.alumnos.set(ws, id);
  // R4-002: este socket pasa a ser el VIGENTE del id — el close del socket
  // viejo (zombie OPEN hasta el heartbeat) se ignora como stale.
  state.alumnoSocketPorId.set(id, ws);

  const extra = {
    respondioActual: j.respondioActual,
    respuestaAnterior: state.estado.respuestasActuales[id] ?? null
  };
  if (state.estado.fase === FASES.PREGUNTA) {
    const p = state.estado.preguntasActivas[state.estado.preguntaIdx];
    extra.pregunta = p.pregunta;
    extra.opciones = p.opciones;
    if (p.tipo) {
      extra.tipoPregunta = p.tipo;
      extra.materia = p.materia || "Historia";
      extra.mediaTipo = p.mediaTipo || "";
      extra.mediaUrl = p.mediaUrl || "";
    }
    extra.idx = state.estado.preguntaIdx;
    extra.total = state.estado.preguntasActivas.length;
    extra.tiempo = state.estado.tiempoRestante;
    extra.pausado = state.estado.pausado;
  }
  if (state.estado.fase === FASES.RESULTADO) {
    const p = state.estado.preguntasActivas[state.estado.preguntaIdx];
    extra.correcta = p.correcta;
    extra.respuestas = state.estado.respuestasActuales;
    Object.assign(extra, buildRankingPayload(state.estado.jugadores));
  }
  if (state.estado.fase === FASES.FIN) {
    Object.assign(extra, buildRankingPayload(state.estado.jugadores));
    // REQ-WS-12: el bienvenido en FIN lleva SÓLO el historial de este alumno.
    extra.miHistorial = j.historial || [];
  }

  ws.send(JSON.stringify({
    tipo: "bienvenido",
    id,
    fase: state.estado.fase,
    jugadores: jugadoresOnline(state.estado),
    reconectado: true,
    token: state.estado.tokens[id],
    ...extra
  }));
  sendDocente(state, {
    tipo: "jugador_reconectado",
    id,
    nombre,
    ...buildRankingPayload(state.estado.jugadores),
  });
  broadcast(state, { tipo: "jugador_reconectado_alumno", nombre });
}

function registrarNuevo(ws, msg, state) {
  const nombre = (msg.nombre || "").trim();
  if (!nombre) return null;
  if (nombre.length > 50) return null;

  // R3-001: si el cliente mandó un id, validar que sea UUIDv4 antes de
  // cualquier lookup. Un id malformado se rechaza sin tocar el state —
  // antes hacía `delete state.estado.jugadores["__proto__"]` que
  // corrompía Object.prototype.
  if (msg.id !== undefined && msg.id !== null && msg.id !== "") {
    if (!UUID_RE.test(msg.id)) {
      ws.send(JSON.stringify({ tipo: "auth_rechazada", razon: "id_invalido" }));
      return null;
    }
    if (Object.hasOwn(state.estado.jugadores, msg.id)) {
      const existing = state.estado.jugadores[msg.id];
      // R3-001: reconexión con el mismo nombre → restaurar (preserva
      // respondioActual y evita segundo voto mid-pregunta).
      // Si el nombre difiere, el alumno está tomando un slot huérfano
      // (otro jugador con ese id lo dejó): reemplazar limpio.
      if (existing.nombre && existing.nombre.toLowerCase() === nombre.toLowerCase()) {
        return reconstruirEstado(ws, state, msg.id, nombre, msg.token);
      }
      // Gatekeeper #2: el reemplazo de un slot EXISTENTE requiere ligadura de
      // cookie (ws.alumnoId === id). Sin ella, un socket raw/ajeno podría
      // tomar la identidad de otro jugador (ids públicos en los rankings)
      // con un nombre distinto: rechazo limpio, slot y token intactos.
      if (ws.alumnoId !== msg.id) {
        ws.send(JSON.stringify({ tipo: "auth_rechazada", razon: "id_ajeno" }));
        return null;
      }
      const oldId = msg.id;
      const oldNombre = existing.nombre;
      delete state.estado.jugadores[oldId];
      // W1: la respuesta del slot huérfano no debe contar como crédito
      // fantasma al cerrar la ronda (mostrarResultado recorre respuestasActuales).
      delete state.estado.respuestasActuales[oldId];
      sendDocente(state, {
        tipo: "jugador_salio",
        id: oldId,
        nombre: oldNombre,
        ...buildRankingPayload(state.estado.jugadores),
      });
      broadcast(state, { tipo: "jugador_salio_alumno", nombre: oldNombre }, ws);
    }
  }

  const nombreEnUso = Object.values(state.estado.jugadores)
    .some((j) => j.nombre.toLowerCase() === nombre.toLowerCase());
  if (nombreEnUso) {
    ws.send(JSON.stringify({ tipo: "error_nombre", msg: "Ese nombre ya está en uso. Probá con otro." }));
    return null;
  }

  // D1 (REQ-WS-08): la cookie (msg.id, ya validado por UUID_RE y forzado por
  // el dispatcher) ES la identidad del jugador. randomUUID queda sólo para
  // sockets sin cookie (crash-recovery, tooling de carga).
  const id = msg.id && UUID_RE.test(msg.id) ? msg.id : crypto.randomUUID();
    
  state.estado.jugadores[id] = {
    nombre,
    puntaje: 0,
    puntajeGeneral: 0,
    respondioActual: false,
    historial: [],
    online: true
  };
  state.alumnos.set(ws, id);
  // R4-002: registrar el socket como VIGENTE del id (ver reconstruirEstado).
  state.alumnoSocketPorId.set(id, ws);

  state.estado.tokens = state.estado.tokens || {};
  const token = crypto.randomBytes(24).toString("base64url");
  state.estado.tokens[id] = token;

  ws.send(JSON.stringify({
    tipo: "bienvenido",
    id,
    fase: state.estado.fase,
    jugadores: jugadoresOnline(state.estado),
    reconectado: false,
    token
  }));
  sendDocente(state, {
    tipo: "jugador_unido",
    id,
    nombre,
    ...buildRankingPayload(state.estado.jugadores),
  });
  broadcast(state, { tipo: "jugador_unido_alumno", nombre }, ws);
  return id;
}

module.exports = { reconstruirEstado, registrarNuevo };
=======
const crypto = require("node:crypto");
const { sendDocente, broadcast, jugadoresOnline, buildRankingPayload } = require("../game-session");
const { FASES } = require("../../domain/constants");

// R3-001: UUIDv4 estricto (versión 4 + variant 8/9/a/b en el tercer grupo).
// crypto.randomUUID() siempre produce v4 canónico. La forma laxa de 8-4-4-4-12
// aceptaba cualquier hex-shaped, lo que dejaba superficie para ids no-v4.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reconstruirEstado(ws, state, id, nombre, token) {
  // R3-001: Object.hasOwn reemplaza el `in` o acceso directo — previene
  // prototype pollution si el id viene manipulado (aunque UUID_RE ya lo filtra).
  if (!Object.hasOwn(state.estado.jugadores, id)) return;

  state.estado.tokens = state.estado.tokens || {};
  const expectedToken = state.estado.tokens[id];
  // Gatekeeper fix: el token fresco (que repara la sesión) SOLO se entrega al
  // socket cuyo id de cookie coincide con el id presentado (ws.alumnoId === id).
  // Un socket raw o con cookie ajena recibe el rechazo muerto SIN token —
  // si no, cualquiera que conozca id+nombre obtendría una sesión y kickearía
  // a la víctima rotando su token. El fallback N=3 del cliente cubre el caso.
  const rechazarTokenRotado = () => {
    if (ws.alumnoId === id) {
      state.estado.tokens[id] = crypto.randomBytes(24).toString("base64url");
      ws.send(JSON.stringify({ tipo: "auth_rechazada", razon: "token_rotado", token: state.estado.tokens[id] }));
    } else {
      ws.send(JSON.stringify({ tipo: "auth_rechazada", razon: "token_rotado" }));
    }
  };
  if (expectedToken !== undefined) {
    if (!token || typeof token !== 'string') {
      rechazarTokenRotado();
      return;
    }
    const a = Buffer.from(expectedToken, 'utf8');
    const b = Buffer.from(token, 'utf8');
    let valid = false;
    if (a.length === b.length) {
      valid = crypto.timingSafeEqual(a, b);
    }
    if (!valid) {
      rechazarTokenRotado();
      return;
    }
  } else {
    // Grace window: issue a secondary token
    state.estado.tokens[id] = crypto.randomBytes(24).toString("base64url");
  }

  const j = state.estado.jugadores[id];
  j.online = true;
  state.alumnos.set(ws, id);
  // R4-002: este socket pasa a ser el VIGENTE del id — el close del socket
  // viejo (zombie OPEN hasta el heartbeat) se ignora como stale.
  state.alumnoSocketPorId.set(id, ws);

  const extra = {
    respondioActual: j.respondioActual,
    respuestaAnterior: state.estado.respuestasActuales[id] ?? null
  };
  if (state.estado.fase === FASES.PREGUNTA) {
    const p = state.estado.preguntasActivas[state.estado.preguntaIdx];
    extra.pregunta = p.pregunta;
    extra.opciones = p.opciones;
    extra.idx = state.estado.preguntaIdx;
    extra.total = state.estado.preguntasActivas.length;
    extra.tiempo = state.estado.tiempoRestante;
    extra.pausado = state.estado.pausado;
  }
  if (state.estado.fase === FASES.RESULTADO) {
    const p = state.estado.preguntasActivas[state.estado.preguntaIdx];
    extra.correcta = p.correcta;
    extra.respuestas = state.estado.respuestasActuales;
    Object.assign(extra, buildRankingPayload(state.estado.jugadores));
  }
  if (state.estado.fase === FASES.FIN) {
    Object.assign(extra, buildRankingPayload(state.estado.jugadores));
    // REQ-WS-12: el bienvenido en FIN lleva SÓLO el historial de este alumno.
    extra.miHistorial = j.historial || [];
  }

  ws.send(JSON.stringify({
    tipo: "bienvenido",
    id,
    fase: state.estado.fase,
    jugadores: jugadoresOnline(state.estado),
    reconectado: true,
    token: state.estado.tokens[id],
    ...extra
  }));
  sendDocente(state, {
    tipo: "jugador_reconectado",
    id,
    nombre,
    ...buildRankingPayload(state.estado.jugadores),
  });
  broadcast(state, { tipo: "jugador_reconectado_alumno", nombre });
}

function registrarNuevo(ws, msg, state) {
  const nombre = (msg.nombre || "").trim();
  if (!nombre) return null;
  if (nombre.length > 50) return null;

  // R3-001: si el cliente mandó un id, validar que sea UUIDv4 antes de
  // cualquier lookup. Un id malformado se rechaza sin tocar el state —
  // antes hacía `delete state.estado.jugadores["__proto__"]` que
  // corrompía Object.prototype.
  if (msg.id !== undefined && msg.id !== null && msg.id !== "") {
    if (!UUID_RE.test(msg.id)) {
      ws.send(JSON.stringify({ tipo: "auth_rechazada", razon: "id_invalido" }));
      return null;
    }
    if (Object.hasOwn(state.estado.jugadores, msg.id)) {
      const existing = state.estado.jugadores[msg.id];
      // R3-001: reconexión con el mismo nombre → restaurar (preserva
      // respondioActual y evita segundo voto mid-pregunta).
      // Si el nombre difiere, el alumno está tomando un slot huérfano
      // (otro jugador con ese id lo dejó): reemplazar limpio.
      if (existing.nombre && existing.nombre.toLowerCase() === nombre.toLowerCase()) {
        return reconstruirEstado(ws, state, msg.id, nombre, msg.token);
      }
      // Gatekeeper #2: el reemplazo de un slot EXISTENTE requiere ligadura de
      // cookie (ws.alumnoId === id). Sin ella, un socket raw/ajeno podría
      // tomar la identidad de otro jugador (ids públicos en los rankings)
      // con un nombre distinto: rechazo limpio, slot y token intactos.
      if (ws.alumnoId !== msg.id) {
        ws.send(JSON.stringify({ tipo: "auth_rechazada", razon: "id_ajeno" }));
        return null;
      }
      const oldId = msg.id;
      const oldNombre = existing.nombre;
      delete state.estado.jugadores[oldId];
      // W1: la respuesta del slot huérfano no debe contar como crédito
      // fantasma al cerrar la ronda (mostrarResultado recorre respuestasActuales).
      delete state.estado.respuestasActuales[oldId];
      sendDocente(state, {
        tipo: "jugador_salio",
        id: oldId,
        nombre: oldNombre,
        ...buildRankingPayload(state.estado.jugadores),
      });
      broadcast(state, { tipo: "jugador_salio_alumno", nombre: oldNombre }, ws);
    }
  }

  const nombreEnUso = Object.values(state.estado.jugadores)
    .some((j) => j.nombre.toLowerCase() === nombre.toLowerCase());
  if (nombreEnUso) {
    ws.send(JSON.stringify({ tipo: "error_nombre", msg: "Ese nombre ya está en uso. Probá con otro." }));
    return null;
  }

  // D1 (REQ-WS-08): la cookie (msg.id, ya validado por UUID_RE y forzado por
  // el dispatcher) ES la identidad del jugador. randomUUID queda sólo para
  // sockets sin cookie (crash-recovery, tooling de carga).
  const id = msg.id && UUID_RE.test(msg.id) ? msg.id : crypto.randomUUID();
    
  state.estado.jugadores[id] = {
    nombre,
    puntaje: 0,
    puntajeGeneral: 0,
    respondioActual: false,
    historial: [],
    online: true
  };
  state.alumnos.set(ws, id);
  // R4-002: registrar el socket como VIGENTE del id (ver reconstruirEstado).
  state.alumnoSocketPorId.set(id, ws);

  state.estado.tokens = state.estado.tokens || {};
  const token = crypto.randomBytes(24).toString("base64url");
  state.estado.tokens[id] = token;

  ws.send(JSON.stringify({
    tipo: "bienvenido",
    id,
    fase: state.estado.fase,
    jugadores: jugadoresOnline(state.estado),
    reconectado: false,
    token
  }));
  sendDocente(state, {
    tipo: "jugador_unido",
    id,
    nombre,
    ...buildRankingPayload(state.estado.jugadores),
  });
  broadcast(state, { tipo: "jugador_unido_alumno", nombre }, ws);
  return id;
}

module.exports = { reconstruirEstado, registrarNuevo };
>>>>>>> origin/main
