// Tests for the alumno-entra handler fast path (R3-001).
//
// The handler has two paths:
//   - Fast path: if the id matches an existing jugador with the same name,
//     call reconstruirEstado() to restore the session.
//   - Slow path: otherwise delegate to registrarNuevo() which validates the
//     id is UUIDv4 before any state mutation.
//
// The fast path used to do `state.estado.jugadores[msg.id]` directly, which
// reads inherited prototype properties (e.g. `toString`, `__proto__`,
// `constructor`). The R3-001 spec mandates `Object.hasOwn` so the slow
// path is always taken for prototype keys.

const { handleAlumnoEntra } = require("../../src/server/ws/handlers/alumno-entra");

function makeState(overrides = {}) {
  return {
    estado: {
      jugadores: {},
      respuestasActuales: {},
      preguntasActivas: [],
      preguntaIdx: 0,
      fase: "lobby",
      tiempoRestante: 0,
      tiempoPorPregunta: 20,
      pausado: false,
      totalJugadoresPregunta: 0,
      ...overrides
    },
    docente: null,
    wss: null,
    timer: null,
    alumnos: new Map(),
    ...overrides
  };
}

function makeWs() {
  return { sent: [], send(data) { this.sent.push(JSON.parse(data)); } };
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  // R3-001: defensive cleanup — the fast path must NEVER mutate the prototype chain.
  expect({}.pollutionProbe).toBeUndefined();
  expect(Object.prototype.pollutionProbe).toBeUndefined();
});

describe("R3-001: alumno-entra fast path uses Object.hasOwn", () => {
  it("id='toString' cae al slow path y devuelve auth_rechazada id_invalido", () => {
    const ws = makeWs();
    const state = makeState();

    handleAlumnoEntra(ws, { tipo: "alumno_entra", nombre: "Ana", id: "toString" }, state);

    expect(ws.sent).toHaveLength(1);
    expect(ws.sent[0].tipo).toBe("auth_rechazada");
    expect(ws.sent[0].razon).toBe("id_invalido");

    // Slow path: nada se escribió en jugadores, ni se polluteó Object.prototype.
    expect(Object.prototype.hasOwnProperty.call(state.estado.jugadores, "toString")).toBe(false);
    expect(state.estado.jugadores.toString).toBe(Object.prototype.toString);
  });

  it("id='__proto__' cae al slow path y no muta Object.prototype", () => {
    const ws = makeWs();
    const state = makeState();

    handleAlumnoEntra(ws, { tipo: "alumno_entra", nombre: "Ana", id: "__proto__" }, state);

    expect(ws.sent).toHaveLength(1);
    expect(ws.sent[0].tipo).toBe("auth_rechazada");
    expect(ws.sent[0].razon).toBe("id_invalido");
  });

  it("id='constructor' cae al slow path", () => {
    const ws = makeWs();
    const state = makeState();

    handleAlumnoEntra(ws, { tipo: "alumno_entra", nombre: "Ana", id: "constructor" }, state);

    expect(ws.sent).toHaveLength(1);
    expect(ws.sent[0].tipo).toBe("auth_rechazada");
    expect(ws.sent[0].razon).toBe("id_invalido");
  });
});
