// Tests for the phase-transition guard in siguiente() (REQ-GF-01).
//
// siguiente() SHALL be a no-op outside RESULTADO: no state mutation, no
// message emission, no guardarEstado. Inside RESULTADO it keeps advancing.

jest.mock("../../src/server/application/game-session", () => ({
  sendDocente: jest.fn(),
  broadcast: jest.fn(),
  lanzarNuevaPregunta: jest.fn(),
  mostrarResultado: jest.fn(),
  buildRankingPayload: jest.fn(() => ({ jugadores: [], rankingGeneral: [] })),
}));

jest.mock("../../src/server/application/app-state", () => ({
  guardarEstado: jest.fn(),
}));

jest.mock("../../src/server/domain/game", () => ({
  getInformeDocente: jest.fn(() => ({})),
}));

jest.mock("../../src/server/infra/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock("../../src/server/infra/metrics", () => ({
  broadcastDropsTotal: { inc: jest.fn() },
}));

const { siguiente } = require("../../src/server/application/use-cases/avanzar-pregunta");
const { sendDocente, broadcast, lanzarNuevaPregunta } = require("../../src/server/application/game-session");
const { guardarEstado } = require("../../src/server/application/app-state");
const { BROADCAST_BACKPRESSURE_THRESHOLD } = require("../../src/server/domain/constants");
const { broadcastDropsTotal } = require("../../src/server/infra/metrics");

function makePregunta(id) {
  return { pregunta: `¿Pregunta ${id}?`, opciones: ["A", "B", "C", "D"], correcta: 0, epoca: "Colonial" };
}

function makeState(overrides = {}) {
  return {
    estado: {
      fase: "lobby",
      preguntaIdx: -1,
      tiempoRestante: 0,
      jugadores: {},
      respuestasActuales: {},
      preguntasActivas: [makePregunta(1), makePregunta(2)],
      tiempoPorPregunta: 20,
      pausado: false,
      totalJugadoresPregunta: 0,
      ...overrides,
    },
    docente: null,
    wss: null,
    timer: null,
    alumnos: new Map(),
    ...overrides,
  };
}

// Fake WebSocket con el shape mínimo que usa el guard de backpressure del
// servidor (readyState / bufferedAmount / send / terminate).
function makeSocket(overrides = {}) {
  return {
    readyState: 1,
    bufferedAmount: 0,
    sent: [],
    send(data) { this.sent.push(JSON.parse(data)); },
    terminate: jest.fn(),
    ...overrides,
  };
}

const HIST_ANA = [
  { n: 1, pregunta: "¿Pregunta 1?", correctaLetra: "A", opcionLetra: "A", opcionTexto: "A", respondio: true, acerto: true },
  { n: 2, pregunta: "¿Pregunta 2?", correctaLetra: "B", opcionLetra: null, opcionTexto: null, respondio: false, acerto: false },
];
const HIST_BOB = [
  { n: 1, pregunta: "¿Pregunta 1?", correctaLetra: "A", opcionLetra: "D", opcionTexto: "D", respondio: true, acerto: false },
];

beforeEach(() => {
  jest.clearAllMocks();
});

describe("REQ-GF-01: siguiente() is a no-op outside RESULTADO", () => {
  it("LOBBY → sin mutación, sin emisiones, sin guardarEstado", () => {
    const state = makeState({ fase: "lobby", preguntaIdx: -1 });

    siguiente(state);

    expect(state.estado.fase).toBe("lobby");
    expect(state.estado.preguntaIdx).toBe(-1);
    expect(sendDocente).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
    expect(lanzarNuevaPregunta).not.toHaveBeenCalled();
    expect(guardarEstado).not.toHaveBeenCalled();
  });

  it("PREGUNTA → sin mutación, sin emisiones, sin guardarEstado", () => {
    const state = makeState({ fase: "pregunta", preguntaIdx: 0 });

    siguiente(state);

    expect(state.estado.fase).toBe("pregunta");
    expect(state.estado.preguntaIdx).toBe(0);
    expect(sendDocente).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
    expect(lanzarNuevaPregunta).not.toHaveBeenCalled();
    expect(guardarEstado).not.toHaveBeenCalled();
  });

  it("FIN → sin fin_juego duplicado, preguntaIdx sin cambios", () => {
    const state = makeState({ fase: "fin", preguntaIdx: 1 });

    siguiente(state);

    expect(state.estado.fase).toBe("fin");
    expect(state.estado.preguntaIdx).toBe(1);
    expect(sendDocente).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
    expect(guardarEstado).not.toHaveBeenCalled();
  });

  it("RESULTADO (pregunta siguiente) → avanza a PREGUNTA y lanza la nueva pregunta", () => {
    const state = makeState({
      fase: "resultado",
      preguntaIdx: 0,
      jugadores: { id1: { nombre: "Ana", online: true, respondioActual: true } },
    });

    siguiente(state);

    expect(state.estado.fase).toBe("pregunta");
    expect(state.estado.preguntaIdx).toBe(1);
    expect(lanzarNuevaPregunta).toHaveBeenCalledWith(state);
    expect(guardarEstado).toHaveBeenCalled();
  });

  it("RESULTADO (última pregunta) → avanza a FIN y emite fin_juego por socket", () => {
    const socketAlumno = makeSocket();
    const state = makeState({
      fase: "resultado",
      preguntaIdx: 1,
      jugadores: {
        id1: { nombre: "Ana", online: true, respondioActual: true, historial: [HIST_BOB[0]] },
      },
    });
    state.wss = { clients: [socketAlumno] };
    state.alumnos.set(socketAlumno, "id1");

    siguiente(state);

    expect(state.estado.fase).toBe("fin");
    expect(state.estado.preguntaIdx).toBe(2);
    expect(sendDocente).toHaveBeenCalledWith(state, expect.objectContaining({ tipo: "fin_juego" }));
    expect(socketAlumno.sent).toHaveLength(1);
    expect(socketAlumno.sent[0].tipo).toBe("fin_juego");
    expect(socketAlumno.sent[0].miHistorial).toEqual([HIST_BOB[0]]);
    expect(guardarEstado).toHaveBeenCalled();
  });
});

describe("REQ-WS-12: fin_juego personalizado por alumno (miHistorial)", () => {
  it("cada socket recibe SOLO su propio miHistorial (nunca el del compañero)", () => {
    const socketA = makeSocket();
    const socketB = makeSocket();
    const state = makeState({
      fase: "resultado",
      preguntaIdx: 1,
      jugadores: {
        idA: { nombre: "Ana", online: true, respondioActual: true, historial: HIST_ANA },
        idB: { nombre: "Bob", online: true, respondioActual: true, historial: HIST_BOB },
      },
    });
    state.wss = { clients: [socketA, socketB] };
    state.alumnos.set(socketA, "idA");
    state.alumnos.set(socketB, "idB");

    siguiente(state);

    expect(socketA.sent).toHaveLength(1);
    expect(socketB.sent).toHaveLength(1);
    const msgA = socketA.sent[0];
    const msgB = socketB.sent[0];
    expect(msgA.tipo).toBe("fin_juego");
    expect(msgB.tipo).toBe("fin_juego");
    // Rankings intactos (REQ-WS-04: campos existentes sin cambios).
    expect(msgA.jugadores).toBeDefined();
    expect(msgA.rankingGeneral).toBeDefined();
    // Cada uno recibe EXACTAMENTE su historial — sin entradas del otro.
    expect(msgA.miHistorial).toEqual(HIST_ANA);
    expect(msgB.miHistorial).toEqual(HIST_BOB);
    expect(msgA.miHistorial).not.toEqual(msgB.miHistorial);
  });

  it("socket cerrado (readyState !== 1) se omite sin enviar", () => {
    const socketCerrado = makeSocket({ readyState: 0 });
    const state = makeState({
      fase: "resultado",
      preguntaIdx: 1,
      jugadores: { idA: { nombre: "Ana", online: true, historial: HIST_ANA } },
    });
    state.wss = { clients: [socketCerrado] };
    state.alumnos.set(socketCerrado, "idA");

    siguiente(state);

    expect(socketCerrado.sent).toHaveLength(0);
    expect(socketCerrado.terminate).not.toHaveBeenCalled();
  });

  it("socket con backpressure se termina, se omite y cuenta la métrica", () => {
    const socketSaturado = makeSocket({ bufferedAmount: BROADCAST_BACKPRESSURE_THRESHOLD });
    const state = makeState({
      fase: "resultado",
      preguntaIdx: 1,
      jugadores: { id: { nombre: "Ana", online: true, historial: HIST_ANA } },
    });
    state.wss = { clients: [socketSaturado] };
    state.alumnos.set(socketSaturado, "id");

    siguiente(state);

    expect(socketSaturado.sent).toHaveLength(0);
    expect(socketSaturado.terminate).toHaveBeenCalledTimes(1);
    expect(broadcastDropsTotal.inc).toHaveBeenCalled();
  });

  it("socket sin mapeo de alumno recibe fin_juego con miHistorial []", () => {
    const socketHuérfano = makeSocket();
    const state = makeState({
      fase: "resultado",
      preguntaIdx: 1,
      jugadores: { id: { nombre: "Ana", online: true, historial: HIST_ANA } },
    });
    state.wss = { clients: [socketHuérfano] };
    // Sin state.alumnos.set: el socket no tiene identidad de alumno.

    siguiente(state);

    expect(socketHuérfano.sent).toHaveLength(1);
    expect(socketHuérfano.sent[0].tipo).toBe("fin_juego");
    expect(socketHuérfano.sent[0].miHistorial).toEqual([]);
  });

  it("el socket del docente NO recibe el mensaje por socket de alumnos", () => {
    const socketDocente = makeSocket();
    const socketAlumno = makeSocket();
    const state = makeState({
      fase: "resultado",
      preguntaIdx: 1,
      jugadores: { id: { nombre: "Ana", online: true, historial: HIST_ANA } },
    });
    state.docente = socketDocente;
    state.wss = { clients: [socketDocente, socketAlumno] };
    state.alumnos.set(socketAlumno, "id");

    siguiente(state);

    expect(socketDocente.sent).toHaveLength(0);
    expect(socketAlumno.sent).toHaveLength(1);
  });
});
