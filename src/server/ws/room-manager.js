const { createAppState } = require("../application/app-state");
const { crearEstadoInicial } = require("../domain/game");
const { cargarSesionesAulas, clearSesionAula } = require("../infra/db");

function createRoomManager(defaultState) {
  const roomsByCode = new Map();
  const states = new Set([defaultState]);
  const stateBySocket = new Map();

  function prepareState(state) {
    state.wss = { clients: new Set() };
    state.timer = null;
    state.autoAvanceTimer = null;
    state.docente = null;
    state.alumnos = new Map();
    state.alumnoSocketPorId = new Map();
    state._teacherClaimed = Boolean(state.estado.codigoPartida);
    states.add(state);
    if (state.estado.codigoPartida) roomsByCode.set(state.estado.codigoPartida, state);
    return state;
  }

  prepareState(defaultState);
  for (const snapshot of cargarSesionesAulas()) {
    if (!snapshot.codigoPartida || roomsByCode.has(snapshot.codigoPartida)) continue;
    const room = createAppState();
    room.db = defaultState.db;
    room.estado = { ...crearEstadoInicial(), ...snapshot };
    room.estado.tokens = room.estado.tokens || Object.fromEntries(
      Object.entries(room.estado.jugadores || {}).filter(([, jugador]) => jugador.token).map(([id, jugador]) => [id, jugador.token])
    );
    room.snapshotRecuperado = true;
    prepareState(room);
  }

  function createRoomState() {
    const room = createAppState();
    room.db = defaultState.db;
    room.estado = crearEstadoInicial();
    room.snapshotRecuperado = false;
    room.autoPausado = false;
    return prepareState(room);
  }

  function attach(ws, state) {
    const previous = stateBySocket.get(ws);
    if (previous && previous !== state) previous.wss.clients.delete(ws);
    stateBySocket.set(ws, state);
    state.wss.clients.add(ws);
    return state;
  }

  function resolve(ws, msg) {
    const current = stateBySocket.get(ws);
    if (msg.tipo === "docente_conecta") {
      const requestedRoom = msg.codigoPartida && roomsByCode.get(msg.codigoPartida);
      if (requestedRoom && requestedRoom.estado.codigoPartida === msg.codigoPartida) return attach(ws, requestedRoom);
      if (current && current.docente === ws) return current;
      const legacyRooms = [...states].filter((room) =>
        room._teacherClaimed && !room.docente && !room.estado.codigoPartida
      );
      if (legacyRooms.length === 1) return attach(ws, legacyRooms[0]);
      const availableDefault = !defaultState._teacherClaimed && !defaultState.docente && !defaultState.estado.codigoPartida;
      const room = availableDefault ? defaultState : createRoomState();
      return attach(ws, room);
    }

    if (msg.tipo === "alumno_entra") {
      if (typeof msg.codigo === "string" && msg.codigo) {
        const room = roomsByCode.get(msg.codigo);
        return room && room.estado.codigoPartida === msg.codigo ? attach(ws, room) : null;
      }
      if (current) return current;
      const awaitingCode = [...states].filter((room) => room.docente && !room.estado.codigoPartida);
      if (awaitingCode.length === 1) return attach(ws, awaitingCode[0]);
      const occupied = [...states].filter((room) => room.docente || room.estado.codigoPartida);
      if (occupied.length === 0) return attach(ws, defaultState);
      return null;
    }

    return current || defaultState;
  }

  function closeCurrentGame(state) {
    const oldCode = state.estado.codigoPartida;
    if (oldCode) roomsByCode.delete(oldCode);
    const message = JSON.stringify({
      tipo: "partida_eliminada",
      mensaje: "El docente creó una nueva partida. La anterior se cerró; volvé al inicio para ingresar el nuevo código."
    });
    for (const ws of [...state.alumnos.keys()]) {
      if (ws.readyState === 1) {
        try { ws.send(message); } catch { /* conexión en cierre */ }
      }
      stateBySocket.delete(ws);
      state.wss.clients.delete(ws);
      try { ws.close(1000, "partida eliminada"); } catch { /* conexión en cierre */ }
    }
    clearTimeout(state.timer);
    clearTimeout(state.autoAvanceTimer);
    state.timer = null;
    state.autoAvanceTimer = null;
    state.alumnos.clear();
    state.alumnoSocketPorId.clear();
    state.estado = crearEstadoInicial();
    state.autoPausado = false;
    state.snapshotRecuperado = false;
    if (oldCode) clearSesionAula(oldCode);
    if (state === defaultState) require("../application/app-state").borrarSnapshot();
  }

  function eliminarUsuarioDeSalas(usuarioId, nombreUsuario) {
    let eliminados = 0;
    const nombreNormalizado = String(nombreUsuario || "").toLowerCase();
    for (const state of states) {
      const jugadoresEliminados = [];
      for (const [id, jugador] of Object.entries(state.estado.jugadores || {})) {
        if (jugador.usuarioId !== usuarioId && String(jugador.nombre || "").toLowerCase() !== nombreNormalizado) continue;
        jugadoresEliminados.push({ id, nombre: jugador.nombre, online: jugador.online !== false });
        delete state.estado.jugadores[id];
        delete state.estado.respuestasActuales[id];
        delete state.estado.tokens?.[id];
        if (state.estado.fase === "pregunta" && jugador.online !== false) {
          state.estado.totalJugadoresPregunta = Math.max(0, state.estado.totalJugadoresPregunta - 1);
        }
        for (const [ws, jugadorId] of state.alumnos) {
          if (jugadorId !== id) continue;
          state.alumnos.delete(ws);
          state.alumnoSocketPorId.delete(id);
          stateBySocket.delete(ws);
          state.wss.clients.delete(ws);
          try { ws.close(4001, "Cuenta eliminada"); } catch { /* conexión en cierre */ }
        }
      }

      if (!jugadoresEliminados.length) continue;
      eliminados += jugadoresEliminados.length;
      const { sendDocente, broadcast, buildRankingPayload } = require("../application/game-session");
      for (const jugador of jugadoresEliminados) {
        sendDocente(state, {
          tipo: "jugador_salio",
          id: jugador.id,
          nombre: jugador.nombre,
          ...buildRankingPayload(state.estado.jugadores),
        });
        broadcast(state, { tipo: "jugador_salio_alumno", nombre: jugador.nombre });
      }
      try { require("../application/app-state").guardarEstado(state.estado); } catch { /* la baja ya fue aplicada en memoria y DB */ }
    }
    return eliminados;
  }

  function registerRoom(state, codigo) {
    state.codigosPartidaEnUso = new Set(roomsByCode.keys());
    if (codigo) roomsByCode.set(codigo, state);
  }

  function reset() {
    for (const room of states) {
      clearTimeout(room.timer);
      clearTimeout(room.autoAvanceTimer);
      for (const ws of room.wss.clients) {
        try { ws.terminate(); } catch { /* conexión cerrada */ }
      }
      room.wss.clients.clear();
    }
    roomsByCode.clear();
    stateBySocket.clear();
    clearSesionAula();
    for (const room of [...states]) if (room !== defaultState) states.delete(room);
    defaultState.wss = { clients: new Set() };
    defaultState._teacherClaimed = false;
    if (defaultState.estado.codigoPartida) roomsByCode.set(defaultState.estado.codigoPartida, defaultState);
  }

  function detach(ws) {
    stateBySocket.delete(ws);
  }

  return {
    resolve,
    closeCurrentGame,
    eliminarUsuarioDeSalas,
    registerRoom,
    getState(ws) { return stateBySocket.get(ws) || null; },
    detach,
    getStates() { return [...states]; },
    reset,
  };
}

module.exports = { createRoomManager };
