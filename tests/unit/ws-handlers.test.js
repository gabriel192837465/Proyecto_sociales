<<<<<<< HEAD
const { ejecutar: handleCambiarNombre } = require("../../src/server/application/use-cases/cambiar-nombre");
const { handleRecuperarPartida } = require("../../src/server/ws/handlers/recuperar-partida");
const { handleDocenteConecta } = require("../../src/server/ws/handlers/docente-conecta");
const { handleAlternarPausa } = require("../../src/server/ws/handlers/pausar");
const { handleSiguientePregunta, handleMostrarResultadoManual } = require("../../src/server/ws/handlers/siguiente-pregunta");
const { handleVolverALobby, handleReiniciarRankingGeneral } = require("../../src/server/ws/handlers/volver-lobby");

jest.mock("../../src/server/application/use-cases/alternar-pausa", () => ({
  ejecutar: jest.fn(),
}));
jest.mock("../../src/server/application/use-cases/avanzar-pregunta", () => ({
  siguiente: jest.fn(),
  mostrarResultadoManual: jest.fn(),
}));
jest.mock("../../src/server/application/use-cases/volver-lobby", () => ({
  ejecutar: jest.fn(),
}));
jest.mock("../../src/server/application/use-cases/reiniciar-ranking", () => ({
  ejecutar: jest.fn(),
}));

jest.mock("../../src/server/application/game-session", () => {
  // buildNuevaPreguntaMsg se usa REAL: es la fuente de verdad del shape canónico
  // (idx/epoca, sin nro) que recuperar-partida re-emite (REQ-WS-10).
  const actual = jest.requireActual("../../src/server/application/game-session");
  return {
    ...actual,
    sendDocente: jest.fn(),
    broadcast: jest.fn(),
    iniciarTimer: jest.fn(),
    buildRankingPayload: jest.fn((jugadores) => ({
      jugadores: require("../../src/server/domain/game").getRanking(jugadores),
      rankingGeneral: require("../../src/server/domain/game").getRankingGeneral(jugadores),
    })),
  };
});

jest.mock("../../src/server/domain/game", () => ({
  getRanking: jest.fn(),
  getRankingGeneral: jest.fn(),
  crearEstadoInicial: jest.fn(() => ({
    fase: "lobby",
    preguntaIdx: -1,
    tiempoRestante: 0,
    jugadores: {},
    respuestasActuales: {},
    preguntasActivas: [],
    tiempoPorPregunta: 20,
    pausado: false,
    totalJugadoresPregunta: 0,
  })),
  getInformeDocente: jest.fn(() => ({})),
}));

jest.mock("../../src/server/application/app-state", () => ({
  borrarSnapshot: jest.fn(),
}));

jest.mock("../../src/server/infra/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { sendDocente, broadcast, iniciarTimer } = require("../../src/server/application/game-session");
const { getRanking, getRankingGeneral, crearEstadoInicial } = require("../../src/server/domain/game");
const { borrarSnapshot } = require("../../src/server/application/app-state");
const { ejecutar: mockAlternarPausa } = require("../../src/server/application/use-cases/alternar-pausa");
const { siguiente: mockSiguiente, mostrarResultadoManual: mockMostrarResultadoManual } = require("../../src/server/application/use-cases/avanzar-pregunta");
const { ejecutar: mockVolverLobby } = require("../../src/server/application/use-cases/volver-lobby");
const { ejecutar: mockReiniciarRanking } = require("../../src/server/application/use-cases/reiniciar-ranking");


function makeWs() {
  return { send: jest.fn(), close: jest.fn(), readyState: 1 };
}

function makeState(overrides = {}) {
  return {
    estado: {
      fase: "lobby",
      preguntaIdx: -1,
      tiempoRestante: 0,
      jugadores: {},
      respuestasActuales: {},
      preguntasActivas: [],
      tiempoPorPregunta: 20,
      pausado: false,
      totalJugadoresPregunta: 0,
      ...overrides,
    },
    docente: null,
    wss: null,
    timer: null,
    alumnos: new Map(),
    snapshotRecuperado: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("cambiar-nombre", () => {
  it("debería ignorar nombre vacío", () => {
    const ws = makeWs();
    const state = makeState();
    handleCambiarNombre(ws, { nombre: "  " }, state);
    expect(ws.send).not.toHaveBeenCalled();
    expect(sendDocente).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("debería ignorar nombre undefined", () => {
    const ws = makeWs();
    const state = makeState();
    handleCambiarNombre(ws, {}, state);
    expect(ws.send).not.toHaveBeenCalled();
    expect(sendDocente).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("debería ignorar si el alumno no está registrado en state.alumnos", () => {
    const ws = makeWs();
    const state = makeState();
    state.estado.jugadores = { id1: { nombre: "Juan", online: true, puntaje: 0 } };
    handleCambiarNombre(ws, { nombre: "Pedro" }, state);
    expect(ws.send).not.toHaveBeenCalled();
    expect(sendDocente).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("debería ignorar si el jugador no existe en state.estado.jugadores", () => {
    const ws = makeWs();
    const state = makeState();
    state.alumnos.set(ws, "id_inexistente");
    handleCambiarNombre(ws, { nombre: "Pedro" }, state);
    expect(ws.send).not.toHaveBeenCalled();
    expect(sendDocente).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("debería enviar error_nombre si ya está en uso por otro online", () => {
    const ws = makeWs();
    const state = makeState({
      jugadores: {
        id1: { nombre: "Pedro", online: true, puntaje: 0 },
        id2: { nombre: "Maria", online: true, puntaje: 0 },
      },
    });
    state.alumnos.set(ws, "id1");

    handleCambiarNombre(ws, { nombre: "  maria  " }, state);

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ tipo: "error_nombre", msg: "Ese nombre ya está en uso. Probá con otro." })
    );
    expect(sendDocente).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("debería permitir nombre en uso si el dueño está offline", () => {
    const ws = makeWs();
    const state = makeState({
      jugadores: {
        id1: { nombre: "Pedro", online: true, puntaje: 0 },
        id2: { nombre: "Maria", online: false, puntaje: 0 },
      },
    });
    state.alumnos.set(ws, "id1");
    getRanking.mockReturnValue([{ id: "id1", nombre: "Pedro", puntaje: 0 }]);
    getRankingGeneral.mockReturnValue([{ id: "id1", nombre: "Pedro", puntajeGeneral: 0 }]);

    handleCambiarNombre(ws, { nombre: "Maria" }, state);

    expect(state.estado.jugadores.id1.nombre).toBe("Maria");
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ tipo: "nombre_cambiado", oldNombre: "Pedro", nombre: "Maria" })
    );
    expect(sendDocente).toHaveBeenCalled();
    expect(broadcast).toHaveBeenCalledTimes(2);
  });

  it("debería cambiar nombre exitosamente", () => {
    const ws = makeWs();
    const state = makeState({
      jugadores: {
        id1: { nombre: "Juan", online: true, puntaje: 0, puntajeGeneral: 10 },
      },
    });
    state.alumnos.set(ws, "id1");
    getRanking.mockReturnValue([{ id: "id1", nombre: "Pedro", puntaje: 0 }]);
    getRankingGeneral.mockReturnValue([{ id: "id1", nombre: "Pedro", puntajeGeneral: 10 }]);

    handleCambiarNombre(ws, { nombre: "Pedro" }, state);

    // Verificar que se actualizó el nombre
    expect(state.estado.jugadores.id1.nombre).toBe("Pedro");

    // Notificar al alumno (targeted self-ack con oldNombre)
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ tipo: "nombre_cambiado", oldNombre: "Juan", nombre: "Pedro" })
    );

    // Notificar al docente con ranking
    expect(sendDocente).toHaveBeenCalledWith(state, {
      tipo: "nombre_cambiado",
      id: "id1",
      oldNombre: "Juan",
      nuevoNombre: "Pedro",
      jugadores: [{ id: "id1", nombre: "Pedro", puntaje: 0 }],
      rankingGeneral: [{ id: "id1", nombre: "Pedro", puntajeGeneral: 10 }],
    });

    // Broadcast a otros alumnos
    expect(broadcast).toHaveBeenCalledWith(state, { tipo: "jugador_salio_alumno", nombre: "Juan" }, ws);
    expect(broadcast).toHaveBeenCalledWith(state, { tipo: "jugador_unido_alumno", nombre: "Pedro" }, ws);
    expect(broadcast).toHaveBeenCalledTimes(2);
  });

  it("debería reflejar oldNombre como el valor previo a la mutación (REQ-WS-07)", () => {
    // Locks the data flow: the targeted self-ack must use the previous name,
    // not the post-mutation name. Two distinct old/new pairs to make the
    // intent obvious.
    const ws = makeWs();
    const state = makeState({
      jugadores: {
        id1: { nombre: "Ana", online: true, puntaje: 0, puntajeGeneral: 0 },
      },
    });
    state.alumnos.set(ws, "id1");
    getRanking.mockReturnValue([]);
    getRankingGeneral.mockReturnValue([]);

    handleCambiarNombre(ws, { nombre: "Anita" }, state);

    // State ya mutado al nuevo nombre
    expect(state.estado.jugadores.id1.nombre).toBe("Anita");

    // Self-ack target: oldNombre es el valor pre-mutación
    const selfAck = ws.send.mock.calls
      .map(([raw]) => JSON.parse(raw))
      .find((m) => m.tipo === "nombre_cambiado");
    expect(selfAck).toBeDefined();
    expect(selfAck.oldNombre).toBe("Ana");
    expect(selfAck.nombre).toBe("Anita");

    // Docente-targeted payload: shape existente, no se rompe
    expect(sendDocente).toHaveBeenCalledWith(
      state,
      expect.objectContaining({ tipo: "nombre_cambiado", oldNombre: "Ana", nuevoNombre: "Anita" })
    );

    // Broadcasts: el filtro del sender pasa ws; el nombre viejo viaja en el salio
    expect(broadcast).toHaveBeenCalledWith(
      state,
      { tipo: "jugador_salio_alumno", nombre: "Ana" },
      ws
    );
    expect(broadcast).toHaveBeenCalledWith(
      state,
      { tipo: "jugador_unido_alumno", nombre: "Anita" },
      ws
    );
  });
});

describe("recuperar-partida", () => {
  it("debería ignorar si no es el docente", () => {
    const ws = makeWs();
    const state = makeState();
    state.docente = makeWs();
    handleRecuperarPartida(ws, { accion: "reanudar" }, state);
    expect(sendDocente).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
    expect(borrarSnapshot).not.toHaveBeenCalled();
  });

  describe("accion: descartar", () => {
    it("debería descartar la partida y crear estado limpio", () => {
      const ws = makeWs();
      const state = makeState({
        jugadores: { id1: { nombre: "Juan", puntaje: 100 } },
        fase: "pregunta",
      });
      state.docente = ws;
      state.snapshotRecuperado = true;
      getRanking.mockReturnValue([]);
      getRankingGeneral.mockReturnValue([]);

      handleRecuperarPartida(ws, { accion: "descartar" }, state);

      expect(borrarSnapshot).toHaveBeenCalledTimes(1);
      expect(crearEstadoInicial).toHaveBeenCalledTimes(1);
      expect(state.snapshotRecuperado).toBe(false);
      expect(state.estado.fase).toBe("lobby");
      expect(sendDocente).toHaveBeenCalledWith(state, {
        tipo: "partida_descartada",
        jugadores: [],
        rankingGeneral: [],
      });
    });
  });

  it("debería enviar error si la acción es inválida", () => {
    const ws = makeWs();
    const state = makeState();
    state.docente = ws;

    handleRecuperarPartida(ws, { accion: "invalidar" }, state);

    expect(sendDocente).toHaveBeenCalledWith(state, {
      tipo: "error",
      msg: 'Acción inválida. Usá "reanudar" o "descartar".',
    });
  });

  describe("accion: reanudar", () => {
    it("debería reanudar en fase lobby sin pregunta activa", () => {
      const ws = makeWs();
      const state = makeState();
      state.docente = ws;
      state.snapshotRecuperado = true;
      getRanking.mockReturnValue([]);
      getRankingGeneral.mockReturnValue([]);

      handleRecuperarPartida(ws, { accion: "reanudar" }, state);

      expect(state.snapshotRecuperado).toBe(false);
      expect(sendDocente).toHaveBeenCalledWith(state, {
        tipo: "partida_reanudada",
        fase: "lobby",
        preguntaIdx: -1,
        jugadores: [],
        rankingGeneral: [],
      });
      expect(broadcast).toHaveBeenCalledWith(state, {
        tipo: "partida_reanudada",
        mensaje: "La partida se ha reanudado. Tus puntos se han conservado.",
        jugadores: [],
        rankingGeneral: [],
      });
    });

    it("debería reenviar pregunta activa si fase es pregunta (shape canónico REQ-WS-10)", () => {
      const ws = makeWs();
      const state = makeState({
        fase: "pregunta",
        preguntaIdx: 0,
        tiempoPorPregunta: 20,
        totalJugadoresPregunta: 5,
        preguntasActivas: [
          { pregunta: "¿Color del cielo?", opciones: ["Rojo", "Azul", "Verde", "Amarillo"], correcta: 1, epoca: "Colonial" },
        ],
      });
      state.docente = ws;
      getRanking.mockReturnValue([{ id: "id1", nombre: "Juan", puntaje: 0 }]);
      getRankingGeneral.mockReturnValue([{ id: "id1", nombre: "Juan", puntajeGeneral: 0 }]);

      handleRecuperarPartida(ws, { accion: "reanudar" }, state);

      // Debería reenviar la pregunta a los alumnos vía broadcast
      expect(broadcast).toHaveBeenCalledWith(state, {
        tipo: "nueva_pregunta",
        idx: 0,
        total: 1,
        pregunta: "¿Color del cielo?",
        opciones: ["Rojo", "Azul", "Verde", "Amarillo"],
        epoca: "Colonial",
        tiempo: 20,
      });

      // Y al docente vía sendDocente con la respuesta correcta
      expect(sendDocente).toHaveBeenCalledWith(state, {
        tipo: "nueva_pregunta",
        idx: 0,
        total: 1,
        pregunta: "¿Color del cielo?",
        opciones: ["Rojo", "Azul", "Verde", "Amarillo"],
        epoca: "Colonial",
        tiempo: 20,
        correcta: 1,
        totalJugadores: 5,
      });

      // REQ-SP-08: en PREGUNTA no pausada el timer se reinicia
      expect(iniciarTimer).toHaveBeenCalledWith(state, true);
    });

    it("no debería reenviar pregunta si no hay pregunta activa en el índice", () => {
      const ws = makeWs();
      const state = makeState({
        fase: "pregunta",
        preguntaIdx: 5,
        preguntasActivas: [{ pregunta: "test", opciones: ["A", "B", "C", "D"], correcta: 0 }],
      });
      state.docente = ws;
      getRanking.mockReturnValue([]);
      getRankingGeneral.mockReturnValue([]);

      handleRecuperarPartida(ws, { accion: "reanudar" }, state);

      // preguntaIdx 5 no existe → no debe enviar nueva_pregunta
      const broadcastCalls = broadcast.mock.calls.filter(
        ([, msg]) => msg.tipo === "nueva_pregunta"
      );
      expect(broadcastCalls).toHaveLength(0);
    });

    it("debería reenviar pregunta activa si fase es resultado (sin timer)", () => {
      const ws = makeWs();
      const state = makeState({
        fase: "resultado",
        preguntaIdx: 0,
        tiempoPorPregunta: 25,
        totalJugadoresPregunta: 3,
        preguntasActivas: [
          { pregunta: "¿Capital de Francia?", opciones: ["Londres", "París", "Berlín", "Madrid"], correcta: 1, epoca: "Revolución" },
        ],
      });
      state.docente = ws;
      getRanking.mockReturnValue([]);
      getRankingGeneral.mockReturnValue([]);

      handleRecuperarPartida(ws, { accion: "reanudar" }, state);

      // Debería reenviar la pregunta a los alumnos vía broadcast
      expect(broadcast).toHaveBeenCalledWith(state, {
        tipo: "nueva_pregunta",
        idx: 0,
        total: 1,
        pregunta: "¿Capital de Francia?",
        opciones: ["Londres", "París", "Berlín", "Madrid"],
        epoca: "Revolución",
        tiempo: 25,
      });

      expect(sendDocente).toHaveBeenCalledWith(state, {
        tipo: "nueva_pregunta",
        idx: 0,
        total: 1,
        pregunta: "¿Capital de Francia?",
        opciones: ["Londres", "París", "Berlín", "Madrid"],
        epoca: "Revolución",
        tiempo: 25,
        correcta: 1,
        totalJugadores: 3,
      });

      // REQ-SP-08: en RESULTADO el timer NO corre
      expect(iniciarTimer).not.toHaveBeenCalled();
    });

    it("no debería iniciar el timer si la pregunta recuperada está pausada (REQ-SP-08)", () => {
      const ws = makeWs();
      const state = makeState({
        fase: "pregunta",
        pausado: true,
        preguntaIdx: 0,
        tiempoPorPregunta: 20,
        totalJugadoresPregunta: 3,
        preguntasActivas: [
          { pregunta: "¿Pausada?", opciones: ["A", "B", "C", "D"], correcta: 0, epoca: "Colonial" },
        ],
      });
      state.docente = ws;
      getRanking.mockReturnValue([]);
      getRankingGeneral.mockReturnValue([]);

      handleRecuperarPartida(ws, { accion: "reanudar" }, state);

      expect(iniciarTimer).not.toHaveBeenCalled();
    });
  });
});

describe("docente-conecta", () => {
  const ctx = { adminToken: "token_secreto", localIp: "127.0.0.1", port: 3000 };

  it("debería rechazar token inválido y cerrar la conexión", () => {
    const ws = makeWs();
    const state = makeState();
    handleDocenteConecta(ws, { token: "malo" }, state, ctx);
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ tipo: "error", msg: "Clave de docente incorrecta." })
    );
    expect(ws.close).toHaveBeenCalled();
    expect(state.docente).toBeNull();
  });

  it("debería conectar exitosamente si el token es válido", () => {
    const ws = makeWs();
    const state = makeState();
    getRanking.mockReturnValue([]);
    getRankingGeneral.mockReturnValue([]);

    handleDocenteConecta(ws, { token: "token_secreto" }, state, ctx);

    expect(state.docente).toBe(ws);
    expect(ws.esDocenteAutenticado).toBe(true);
    expect(ws.send).toHaveBeenCalledWith(
      expect.stringContaining('"tipo":"estado_inicial"')
    );
  });

  it("debería cerrar el docente anterior si ya hay uno conectado", () => {
    const oldWs = makeWs();
    const ws = makeWs();
    const state = makeState();
    state.docente = oldWs;
    getRanking.mockReturnValue([]);
    getRankingGeneral.mockReturnValue([]);

    handleDocenteConecta(ws, { token: "token_secreto" }, state, ctx);

    expect(oldWs.close).toHaveBeenCalled();
    expect(state.docente).toBe(ws);
  });

  it("debería reanudar juego si estaba autoPausado (no FIN)", () => {
    const ws = makeWs();
    const state = makeState({
      fase: "pregunta",
    });
    state.autoPausado = true;
    state.estado.pausado = true;
    getRanking.mockReturnValue([]);
    getRankingGeneral.mockReturnValue([]);

    handleDocenteConecta(ws, { token: "token_secreto" }, state, ctx);

    expect(state.autoPausado).toBe(false);
    expect(state.estado.pausado).toBe(false);
    expect(iniciarTimer).toHaveBeenCalledWith(state, true);
    expect(broadcast).toHaveBeenCalledWith(state, {
      tipo: "juego_reanudado",
      tiempo: state.estado.tiempoRestante,
    });
  });

  it("debería no reanudar si estaba autoPausado pero fase es FIN", () => {
    const ws = makeWs();
    const state = makeState({
      fase: "fin",
    });
    state.autoPausado = true;
    getRanking.mockReturnValue([]);
    getRankingGeneral.mockReturnValue([]);

    handleDocenteConecta(ws, { token: "token_secreto" }, state, ctx);

    expect(state.autoPausado).toBe(false);
    expect(iniciarTimer).not.toHaveBeenCalled();
  });

  it("debería enviar partida_recuperada si snapshotRecuperado es true", () => {
    const ws = makeWs();
    const state = makeState();
    state.snapshotRecuperado = true;
    getRanking.mockReturnValue([]);
    getRankingGeneral.mockReturnValue([]);

    handleDocenteConecta(ws, { token: "token_secreto" }, state, ctx);

    expect(ws.send).toHaveBeenCalledWith(
      expect.stringContaining('"tipo":"partida_recuperada"')
    );
  });
});

describe("US1 - Secure Docente WS Actions", () => {
  it("debería retornar temprano y enviar error no autorizado (401) en handleAlternarPausa si falla requireDocenteWs", () => {
    const ws = makeWs();
    const state = makeState();
    handleAlternarPausa(ws, {}, state);
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ tipo: "error", msg: "No autorizado." })
    );
    expect(mockAlternarPausa).not.toHaveBeenCalled();
  });

  it("debería ejecutar alternar-pausa si requireDocenteWs tiene éxito", () => {
    const ws = makeWs();
    ws.esDocenteAutenticado = true;
    const state = makeState({ docente: ws });
    handleAlternarPausa(ws, {}, state);
    expect(mockAlternarPausa).toHaveBeenCalledWith(state);
  });

  it("debería retornar temprano en handleSiguientePregunta si falla requireDocenteWs", () => {
    const ws = makeWs();
    const state = makeState();
    handleSiguientePregunta(ws, {}, state);
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ tipo: "error", msg: "No autorizado." })
    );
    expect(mockSiguiente).not.toHaveBeenCalled();
  });

  it("debería ejecutar siguiente-pregunta si requireDocenteWs tiene éxito", () => {
    const ws = makeWs();
    ws.esDocenteAutenticado = true;
    const state = makeState({ docente: ws });
    handleSiguientePregunta(ws, {}, state);
    expect(mockSiguiente).toHaveBeenCalledWith(state);
  });

  it("debería retornar temprano en handleMostrarResultadoManual si falla requireDocenteWs", () => {
    const ws = makeWs();
    const state = makeState();
    handleMostrarResultadoManual(ws, {}, state);
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ tipo: "error", msg: "No autorizado." })
    );
    expect(mockMostrarResultadoManual).not.toHaveBeenCalled();
  });

  it("debería ejecutar mostrarResultadoManual si requireDocenteWs tiene éxito", () => {
    const ws = makeWs();
    ws.esDocenteAutenticado = true;
    const state = makeState({ docente: ws });
    handleMostrarResultadoManual(ws, {}, state);
    expect(mockMostrarResultadoManual).toHaveBeenCalledWith(state);
  });

  it("debería retornar temprano en handleVolverALobby si falla requireDocenteWs", () => {
    const ws = makeWs();
    const state = makeState();
    handleVolverALobby(ws, {}, state);
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ tipo: "error", msg: "No autorizado." })
    );
    expect(mockVolverLobby).not.toHaveBeenCalled();
  });

  it("debería ejecutar volverLobby si requireDocenteWs tiene éxito", () => {
    const ws = makeWs();
    ws.esDocenteAutenticado = true;
    const state = makeState({ docente: ws });
    handleVolverALobby(ws, {}, state);
    expect(mockVolverLobby).toHaveBeenCalledWith(state);
  });

  it("debería retornar temprano en handleReiniciarRankingGeneral si falla requireDocenteWs", () => {
    const ws = makeWs();
    const state = makeState();
    handleReiniciarRankingGeneral(ws, {}, state);
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ tipo: "error", msg: "No autorizado." })
    );
    expect(mockReiniciarRanking).not.toHaveBeenCalled();
  });

  it("debería ejecutar reiniciarRanking si requireDocenteWs tiene éxito", () => {
    const ws = makeWs();
    ws.esDocenteAutenticado = true;
    const state = makeState({ docente: ws });
    handleReiniciarRankingGeneral(ws, {}, state);
    expect(mockReiniciarRanking).toHaveBeenCalledWith(state);
  });
});

=======
const { ejecutar: handleCambiarNombre } = require("../../src/server/application/use-cases/cambiar-nombre");
const { handleRecuperarPartida } = require("../../src/server/ws/handlers/recuperar-partida");
const { handleDocenteConecta } = require("../../src/server/ws/handlers/docente-conecta");
const { handleAlternarPausa } = require("../../src/server/ws/handlers/pausar");
const { handleSiguientePregunta, handleMostrarResultadoManual } = require("../../src/server/ws/handlers/siguiente-pregunta");
const { handleVolverALobby, handleReiniciarRankingGeneral } = require("../../src/server/ws/handlers/volver-lobby");

jest.mock("../../src/server/application/use-cases/alternar-pausa", () => ({
  ejecutar: jest.fn(),
}));
jest.mock("../../src/server/application/use-cases/avanzar-pregunta", () => ({
  siguiente: jest.fn(),
  mostrarResultadoManual: jest.fn(),
}));
jest.mock("../../src/server/application/use-cases/volver-lobby", () => ({
  ejecutar: jest.fn(),
}));
jest.mock("../../src/server/application/use-cases/reiniciar-ranking", () => ({
  ejecutar: jest.fn(),
}));

jest.mock("../../src/server/application/game-session", () => {
  // buildNuevaPreguntaMsg se usa REAL: es la fuente de verdad del shape canónico
  // (idx/epoca, sin nro) que recuperar-partida re-emite (REQ-WS-10).
  const actual = jest.requireActual("../../src/server/application/game-session");
  return {
    ...actual,
    sendDocente: jest.fn(),
    broadcast: jest.fn(),
    iniciarTimer: jest.fn(),
    buildRankingPayload: jest.fn((jugadores) => ({
      jugadores: require("../../src/server/domain/game").getRanking(jugadores),
      rankingGeneral: require("../../src/server/domain/game").getRankingGeneral(jugadores),
    })),
  };
});

jest.mock("../../src/server/domain/game", () => ({
  getRanking: jest.fn(),
  getRankingGeneral: jest.fn(),
  crearEstadoInicial: jest.fn(() => ({
    fase: "lobby",
    preguntaIdx: -1,
    tiempoRestante: 0,
    jugadores: {},
    respuestasActuales: {},
    preguntasActivas: [],
    tiempoPorPregunta: 20,
    pausado: false,
    totalJugadoresPregunta: 0,
  })),
  getInformeDocente: jest.fn(() => ({})),
}));

jest.mock("../../src/server/application/app-state", () => ({
  borrarSnapshot: jest.fn(),
}));

jest.mock("../../src/server/infra/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { sendDocente, broadcast, iniciarTimer } = require("../../src/server/application/game-session");
const { getRanking, getRankingGeneral, crearEstadoInicial } = require("../../src/server/domain/game");
const { borrarSnapshot } = require("../../src/server/application/app-state");
const { ejecutar: mockAlternarPausa } = require("../../src/server/application/use-cases/alternar-pausa");
const { siguiente: mockSiguiente, mostrarResultadoManual: mockMostrarResultadoManual } = require("../../src/server/application/use-cases/avanzar-pregunta");
const { ejecutar: mockVolverLobby } = require("../../src/server/application/use-cases/volver-lobby");
const { ejecutar: mockReiniciarRanking } = require("../../src/server/application/use-cases/reiniciar-ranking");


function makeWs() {
  return { send: jest.fn(), close: jest.fn(), readyState: 1 };
}

function makeState(overrides = {}) {
  return {
    estado: {
      fase: "lobby",
      preguntaIdx: -1,
      tiempoRestante: 0,
      jugadores: {},
      respuestasActuales: {},
      preguntasActivas: [],
      tiempoPorPregunta: 20,
      pausado: false,
      totalJugadoresPregunta: 0,
      ...overrides,
    },
    docente: null,
    wss: null,
    timer: null,
    alumnos: new Map(),
    snapshotRecuperado: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("cambiar-nombre", () => {
  it("debería ignorar nombre vacío", () => {
    const ws = makeWs();
    const state = makeState();
    handleCambiarNombre(ws, { nombre: "  " }, state);
    expect(ws.send).not.toHaveBeenCalled();
    expect(sendDocente).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("debería ignorar nombre undefined", () => {
    const ws = makeWs();
    const state = makeState();
    handleCambiarNombre(ws, {}, state);
    expect(ws.send).not.toHaveBeenCalled();
    expect(sendDocente).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("debería ignorar si el alumno no está registrado en state.alumnos", () => {
    const ws = makeWs();
    const state = makeState();
    state.estado.jugadores = { id1: { nombre: "Juan", online: true, puntaje: 0 } };
    handleCambiarNombre(ws, { nombre: "Pedro" }, state);
    expect(ws.send).not.toHaveBeenCalled();
    expect(sendDocente).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("debería ignorar si el jugador no existe en state.estado.jugadores", () => {
    const ws = makeWs();
    const state = makeState();
    state.alumnos.set(ws, "id_inexistente");
    handleCambiarNombre(ws, { nombre: "Pedro" }, state);
    expect(ws.send).not.toHaveBeenCalled();
    expect(sendDocente).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("debería enviar error_nombre si ya está en uso por otro online", () => {
    const ws = makeWs();
    const state = makeState({
      jugadores: {
        id1: { nombre: "Pedro", online: true, puntaje: 0 },
        id2: { nombre: "Maria", online: true, puntaje: 0 },
      },
    });
    state.alumnos.set(ws, "id1");

    handleCambiarNombre(ws, { nombre: "  maria  " }, state);

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ tipo: "error_nombre", msg: "Ese nombre ya está en uso. Probá con otro." })
    );
    expect(sendDocente).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("debería permitir nombre en uso si el dueño está offline", () => {
    const ws = makeWs();
    const state = makeState({
      jugadores: {
        id1: { nombre: "Pedro", online: true, puntaje: 0 },
        id2: { nombre: "Maria", online: false, puntaje: 0 },
      },
    });
    state.alumnos.set(ws, "id1");
    getRanking.mockReturnValue([{ id: "id1", nombre: "Pedro", puntaje: 0 }]);
    getRankingGeneral.mockReturnValue([{ id: "id1", nombre: "Pedro", puntajeGeneral: 0 }]);

    handleCambiarNombre(ws, { nombre: "Maria" }, state);

    expect(state.estado.jugadores.id1.nombre).toBe("Maria");
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ tipo: "nombre_cambiado", oldNombre: "Pedro", nombre: "Maria" })
    );
    expect(sendDocente).toHaveBeenCalled();
    expect(broadcast).toHaveBeenCalledTimes(2);
  });

  it("debería cambiar nombre exitosamente", () => {
    const ws = makeWs();
    const state = makeState({
      jugadores: {
        id1: { nombre: "Juan", online: true, puntaje: 0, puntajeGeneral: 10 },
      },
    });
    state.alumnos.set(ws, "id1");
    getRanking.mockReturnValue([{ id: "id1", nombre: "Pedro", puntaje: 0 }]);
    getRankingGeneral.mockReturnValue([{ id: "id1", nombre: "Pedro", puntajeGeneral: 10 }]);

    handleCambiarNombre(ws, { nombre: "Pedro" }, state);

    // Verificar que se actualizó el nombre
    expect(state.estado.jugadores.id1.nombre).toBe("Pedro");

    // Notificar al alumno (targeted self-ack con oldNombre)
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ tipo: "nombre_cambiado", oldNombre: "Juan", nombre: "Pedro" })
    );

    // Notificar al docente con ranking
    expect(sendDocente).toHaveBeenCalledWith(state, {
      tipo: "nombre_cambiado",
      id: "id1",
      oldNombre: "Juan",
      nuevoNombre: "Pedro",
      jugadores: [{ id: "id1", nombre: "Pedro", puntaje: 0 }],
      rankingGeneral: [{ id: "id1", nombre: "Pedro", puntajeGeneral: 10 }],
    });

    // Broadcast a otros alumnos
    expect(broadcast).toHaveBeenCalledWith(state, { tipo: "jugador_salio_alumno", nombre: "Juan" }, ws);
    expect(broadcast).toHaveBeenCalledWith(state, { tipo: "jugador_unido_alumno", nombre: "Pedro" }, ws);
    expect(broadcast).toHaveBeenCalledTimes(2);
  });

  it("debería reflejar oldNombre como el valor previo a la mutación (REQ-WS-07)", () => {
    // Locks the data flow: the targeted self-ack must use the previous name,
    // not the post-mutation name. Two distinct old/new pairs to make the
    // intent obvious.
    const ws = makeWs();
    const state = makeState({
      jugadores: {
        id1: { nombre: "Ana", online: true, puntaje: 0, puntajeGeneral: 0 },
      },
    });
    state.alumnos.set(ws, "id1");
    getRanking.mockReturnValue([]);
    getRankingGeneral.mockReturnValue([]);

    handleCambiarNombre(ws, { nombre: "Anita" }, state);

    // State ya mutado al nuevo nombre
    expect(state.estado.jugadores.id1.nombre).toBe("Anita");

    // Self-ack target: oldNombre es el valor pre-mutación
    const selfAck = ws.send.mock.calls
      .map(([raw]) => JSON.parse(raw))
      .find((m) => m.tipo === "nombre_cambiado");
    expect(selfAck).toBeDefined();
    expect(selfAck.oldNombre).toBe("Ana");
    expect(selfAck.nombre).toBe("Anita");

    // Docente-targeted payload: shape existente, no se rompe
    expect(sendDocente).toHaveBeenCalledWith(
      state,
      expect.objectContaining({ tipo: "nombre_cambiado", oldNombre: "Ana", nuevoNombre: "Anita" })
    );

    // Broadcasts: el filtro del sender pasa ws; el nombre viejo viaja en el salio
    expect(broadcast).toHaveBeenCalledWith(
      state,
      { tipo: "jugador_salio_alumno", nombre: "Ana" },
      ws
    );
    expect(broadcast).toHaveBeenCalledWith(
      state,
      { tipo: "jugador_unido_alumno", nombre: "Anita" },
      ws
    );
  });
});

describe("recuperar-partida", () => {
  it("debería ignorar si no es el docente", () => {
    const ws = makeWs();
    const state = makeState();
    state.docente = makeWs();
    handleRecuperarPartida(ws, { accion: "reanudar" }, state);
    expect(sendDocente).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
    expect(borrarSnapshot).not.toHaveBeenCalled();
  });

  describe("accion: descartar", () => {
    it("debería descartar la partida y crear estado limpio", () => {
      const ws = makeWs();
      const state = makeState({
        jugadores: { id1: { nombre: "Juan", puntaje: 100 } },
        fase: "pregunta",
      });
      state.docente = ws;
      state.snapshotRecuperado = true;
      getRanking.mockReturnValue([]);
      getRankingGeneral.mockReturnValue([]);

      handleRecuperarPartida(ws, { accion: "descartar" }, state);

      expect(borrarSnapshot).toHaveBeenCalledTimes(1);
      expect(crearEstadoInicial).toHaveBeenCalledTimes(1);
      expect(state.snapshotRecuperado).toBe(false);
      expect(state.estado.fase).toBe("lobby");
      expect(sendDocente).toHaveBeenCalledWith(state, {
        tipo: "partida_descartada",
        jugadores: [],
        rankingGeneral: [],
      });
    });
  });

  it("debería enviar error si la acción es inválida", () => {
    const ws = makeWs();
    const state = makeState();
    state.docente = ws;

    handleRecuperarPartida(ws, { accion: "invalidar" }, state);

    expect(sendDocente).toHaveBeenCalledWith(state, {
      tipo: "error",
      msg: 'Acción inválida. Usá "reanudar" o "descartar".',
    });
  });

  describe("accion: reanudar", () => {
    it("debería reanudar en fase lobby sin pregunta activa", () => {
      const ws = makeWs();
      const state = makeState();
      state.docente = ws;
      state.snapshotRecuperado = true;
      getRanking.mockReturnValue([]);
      getRankingGeneral.mockReturnValue([]);

      handleRecuperarPartida(ws, { accion: "reanudar" }, state);

      expect(state.snapshotRecuperado).toBe(false);
      expect(sendDocente).toHaveBeenCalledWith(state, {
        tipo: "partida_reanudada",
        fase: "lobby",
        preguntaIdx: -1,
        jugadores: [],
        rankingGeneral: [],
      });
      expect(broadcast).toHaveBeenCalledWith(state, {
        tipo: "partida_reanudada",
        mensaje: "La partida se ha reanudado. Tus puntos se han conservado.",
        jugadores: [],
        rankingGeneral: [],
      });
    });

    it("debería reenviar pregunta activa si fase es pregunta (shape canónico REQ-WS-10)", () => {
      const ws = makeWs();
      const state = makeState({
        fase: "pregunta",
        preguntaIdx: 0,
        tiempoPorPregunta: 20,
        totalJugadoresPregunta: 5,
        preguntasActivas: [
          { pregunta: "¿Color del cielo?", opciones: ["Rojo", "Azul", "Verde", "Amarillo"], correcta: 1, epoca: "Colonial" },
        ],
      });
      state.docente = ws;
      getRanking.mockReturnValue([{ id: "id1", nombre: "Juan", puntaje: 0 }]);
      getRankingGeneral.mockReturnValue([{ id: "id1", nombre: "Juan", puntajeGeneral: 0 }]);

      handleRecuperarPartida(ws, { accion: "reanudar" }, state);

      // Debería reenviar la pregunta a los alumnos vía broadcast
      expect(broadcast).toHaveBeenCalledWith(state, {
        tipo: "nueva_pregunta",
        idx: 0,
        total: 1,
        pregunta: "¿Color del cielo?",
        opciones: ["Rojo", "Azul", "Verde", "Amarillo"],
        epoca: "Colonial",
        tiempo: 20,
      });

      // Y al docente vía sendDocente con la respuesta correcta
      expect(sendDocente).toHaveBeenCalledWith(state, {
        tipo: "nueva_pregunta",
        idx: 0,
        total: 1,
        pregunta: "¿Color del cielo?",
        opciones: ["Rojo", "Azul", "Verde", "Amarillo"],
        epoca: "Colonial",
        tiempo: 20,
        correcta: 1,
        totalJugadores: 5,
      });

      // REQ-SP-08: en PREGUNTA no pausada el timer se reinicia
      expect(iniciarTimer).toHaveBeenCalledWith(state, true);
    });

    it("no debería reenviar pregunta si no hay pregunta activa en el índice", () => {
      const ws = makeWs();
      const state = makeState({
        fase: "pregunta",
        preguntaIdx: 5,
        preguntasActivas: [{ pregunta: "test", opciones: ["A", "B", "C", "D"], correcta: 0 }],
      });
      state.docente = ws;
      getRanking.mockReturnValue([]);
      getRankingGeneral.mockReturnValue([]);

      handleRecuperarPartida(ws, { accion: "reanudar" }, state);

      // preguntaIdx 5 no existe → no debe enviar nueva_pregunta
      const broadcastCalls = broadcast.mock.calls.filter(
        ([, msg]) => msg.tipo === "nueva_pregunta"
      );
      expect(broadcastCalls).toHaveLength(0);
    });

    it("debería reenviar pregunta activa si fase es resultado (sin timer)", () => {
      const ws = makeWs();
      const state = makeState({
        fase: "resultado",
        preguntaIdx: 0,
        tiempoPorPregunta: 25,
        totalJugadoresPregunta: 3,
        preguntasActivas: [
          { pregunta: "¿Capital de Francia?", opciones: ["Londres", "París", "Berlín", "Madrid"], correcta: 1, epoca: "Revolución" },
        ],
      });
      state.docente = ws;
      getRanking.mockReturnValue([]);
      getRankingGeneral.mockReturnValue([]);

      handleRecuperarPartida(ws, { accion: "reanudar" }, state);

      // Debería reenviar la pregunta a los alumnos vía broadcast
      expect(broadcast).toHaveBeenCalledWith(state, {
        tipo: "nueva_pregunta",
        idx: 0,
        total: 1,
        pregunta: "¿Capital de Francia?",
        opciones: ["Londres", "París", "Berlín", "Madrid"],
        epoca: "Revolución",
        tiempo: 25,
      });

      expect(sendDocente).toHaveBeenCalledWith(state, {
        tipo: "nueva_pregunta",
        idx: 0,
        total: 1,
        pregunta: "¿Capital de Francia?",
        opciones: ["Londres", "París", "Berlín", "Madrid"],
        epoca: "Revolución",
        tiempo: 25,
        correcta: 1,
        totalJugadores: 3,
      });

      // REQ-SP-08: en RESULTADO el timer NO corre
      expect(iniciarTimer).not.toHaveBeenCalled();
    });

    it("no debería iniciar el timer si la pregunta recuperada está pausada (REQ-SP-08)", () => {
      const ws = makeWs();
      const state = makeState({
        fase: "pregunta",
        pausado: true,
        preguntaIdx: 0,
        tiempoPorPregunta: 20,
        totalJugadoresPregunta: 3,
        preguntasActivas: [
          { pregunta: "¿Pausada?", opciones: ["A", "B", "C", "D"], correcta: 0, epoca: "Colonial" },
        ],
      });
      state.docente = ws;
      getRanking.mockReturnValue([]);
      getRankingGeneral.mockReturnValue([]);

      handleRecuperarPartida(ws, { accion: "reanudar" }, state);

      expect(iniciarTimer).not.toHaveBeenCalled();
    });
  });
});

describe("docente-conecta", () => {
  const ctx = { adminToken: "token_secreto", localIp: "127.0.0.1", port: 3000 };

  it("debería rechazar token inválido y cerrar la conexión", () => {
    const ws = makeWs();
    const state = makeState();
    handleDocenteConecta(ws, { token: "malo" }, state, ctx);
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ tipo: "error", msg: "Clave de docente incorrecta." })
    );
    expect(ws.close).toHaveBeenCalled();
    expect(state.docente).toBeNull();
  });

  it("debería conectar exitosamente si el token es válido", () => {
    const ws = makeWs();
    const state = makeState();
    getRanking.mockReturnValue([]);
    getRankingGeneral.mockReturnValue([]);

    handleDocenteConecta(ws, { token: "token_secreto" }, state, ctx);

    expect(state.docente).toBe(ws);
    expect(ws.esDocenteAutenticado).toBe(true);
    expect(ws.send).toHaveBeenCalledWith(
      expect.stringContaining('"tipo":"estado_inicial"')
    );
  });

  it("debería cerrar el docente anterior si ya hay uno conectado", () => {
    const oldWs = makeWs();
    const ws = makeWs();
    const state = makeState();
    state.docente = oldWs;
    getRanking.mockReturnValue([]);
    getRankingGeneral.mockReturnValue([]);

    handleDocenteConecta(ws, { token: "token_secreto" }, state, ctx);

    expect(oldWs.close).toHaveBeenCalled();
    expect(state.docente).toBe(ws);
  });

  it("debería reanudar juego si estaba autoPausado (no FIN)", () => {
    const ws = makeWs();
    const state = makeState({
      fase: "pregunta",
    });
    state.autoPausado = true;
    state.estado.pausado = true;
    getRanking.mockReturnValue([]);
    getRankingGeneral.mockReturnValue([]);

    handleDocenteConecta(ws, { token: "token_secreto" }, state, ctx);

    expect(state.autoPausado).toBe(false);
    expect(state.estado.pausado).toBe(false);
    expect(iniciarTimer).toHaveBeenCalledWith(state, true);
    expect(broadcast).toHaveBeenCalledWith(state, {
      tipo: "juego_reanudado",
      tiempo: state.estado.tiempoRestante,
    });
  });

  it("debería no reanudar si estaba autoPausado pero fase es FIN", () => {
    const ws = makeWs();
    const state = makeState({
      fase: "fin",
    });
    state.autoPausado = true;
    getRanking.mockReturnValue([]);
    getRankingGeneral.mockReturnValue([]);

    handleDocenteConecta(ws, { token: "token_secreto" }, state, ctx);

    expect(state.autoPausado).toBe(false);
    expect(iniciarTimer).not.toHaveBeenCalled();
  });

  it("debería enviar partida_recuperada si snapshotRecuperado es true", () => {
    const ws = makeWs();
    const state = makeState();
    state.snapshotRecuperado = true;
    getRanking.mockReturnValue([]);
    getRankingGeneral.mockReturnValue([]);

    handleDocenteConecta(ws, { token: "token_secreto" }, state, ctx);

    expect(ws.send).toHaveBeenCalledWith(
      expect.stringContaining('"tipo":"partida_recuperada"')
    );
  });
});

describe("US1 - Secure Docente WS Actions", () => {
  it("debería retornar temprano y enviar error no autorizado (401) en handleAlternarPausa si falla requireDocenteWs", () => {
    const ws = makeWs();
    const state = makeState();
    handleAlternarPausa(ws, {}, state);
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ tipo: "error", msg: "No autorizado." })
    );
    expect(mockAlternarPausa).not.toHaveBeenCalled();
  });

  it("debería ejecutar alternar-pausa si requireDocenteWs tiene éxito", () => {
    const ws = makeWs();
    ws.esDocenteAutenticado = true;
    const state = makeState({ docente: ws });
    handleAlternarPausa(ws, {}, state);
    expect(mockAlternarPausa).toHaveBeenCalledWith(state);
  });

  it("debería retornar temprano en handleSiguientePregunta si falla requireDocenteWs", () => {
    const ws = makeWs();
    const state = makeState();
    handleSiguientePregunta(ws, {}, state);
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ tipo: "error", msg: "No autorizado." })
    );
    expect(mockSiguiente).not.toHaveBeenCalled();
  });

  it("debería ejecutar siguiente-pregunta si requireDocenteWs tiene éxito", () => {
    const ws = makeWs();
    ws.esDocenteAutenticado = true;
    const state = makeState({ docente: ws });
    handleSiguientePregunta(ws, {}, state);
    expect(mockSiguiente).toHaveBeenCalledWith(state);
  });

  it("debería retornar temprano en handleMostrarResultadoManual si falla requireDocenteWs", () => {
    const ws = makeWs();
    const state = makeState();
    handleMostrarResultadoManual(ws, {}, state);
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ tipo: "error", msg: "No autorizado." })
    );
    expect(mockMostrarResultadoManual).not.toHaveBeenCalled();
  });

  it("debería ejecutar mostrarResultadoManual si requireDocenteWs tiene éxito", () => {
    const ws = makeWs();
    ws.esDocenteAutenticado = true;
    const state = makeState({ docente: ws });
    handleMostrarResultadoManual(ws, {}, state);
    expect(mockMostrarResultadoManual).toHaveBeenCalledWith(state);
  });

  it("debería retornar temprano en handleVolverALobby si falla requireDocenteWs", () => {
    const ws = makeWs();
    const state = makeState();
    handleVolverALobby(ws, {}, state);
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ tipo: "error", msg: "No autorizado." })
    );
    expect(mockVolverLobby).not.toHaveBeenCalled();
  });

  it("debería ejecutar volverLobby si requireDocenteWs tiene éxito", () => {
    const ws = makeWs();
    ws.esDocenteAutenticado = true;
    const state = makeState({ docente: ws });
    handleVolverALobby(ws, {}, state);
    expect(mockVolverLobby).toHaveBeenCalledWith(state);
  });

  it("debería retornar temprano en handleReiniciarRankingGeneral si falla requireDocenteWs", () => {
    const ws = makeWs();
    const state = makeState();
    handleReiniciarRankingGeneral(ws, {}, state);
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ tipo: "error", msg: "No autorizado." })
    );
    expect(mockReiniciarRanking).not.toHaveBeenCalled();
  });

  it("debería ejecutar reiniciarRanking si requireDocenteWs tiene éxito", () => {
    const ws = makeWs();
    ws.esDocenteAutenticado = true;
    const state = makeState({ docente: ws });
    handleReiniciarRankingGeneral(ws, {}, state);
    expect(mockReiniciarRanking).toHaveBeenCalledWith(state);
  });
});

>>>>>>> origin/main
