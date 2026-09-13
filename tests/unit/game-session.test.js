const {
  broadcast,
  sendDocente,
  mostrarResultado,
  iniciarTimer,
  jugadoresOnline
} = require("../../src/server/application/game-session");

function makeClient(readyState) {
  return { readyState, send: jest.fn() };
}

function makeState(overrides = {}) {
  return {
    estado: {
      preguntasActivas: [
        { pregunta: "¿Test?", opciones: ["A", "B", "C", "D"], correcta: 0 }
      ],
      preguntaIdx: 0,
      respuestasActuales: {},
      jugadores: {},
      fase: "lobby",
      tiempoRestante: 10,
      tiempoPorPregunta: 20,
      pausado: false,
      totalJugadoresPregunta: 0,
      ...overrides
    },
    docente: null,
    wss: null,
    timer: null,
    alumnos: new Map()
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("broadcast", () => {
  it("debería enviar mensaje a todos los clientes conectados", () => {
    const c1 = makeClient(1);
    const c2 = makeClient(1);
    const state = makeState();
    state.wss = { clients: new Set([c1, c2]) };

    broadcast(state, { tipo: "test", data: 123 });

    expect(c1.send).toHaveBeenCalledWith(JSON.stringify({ tipo: "test", data: 123 }));
    expect(c2.send).toHaveBeenCalledWith(JSON.stringify({ tipo: "test", data: 123 }));
  });

  it("no debería enviar a clientes con readyState distinto de 1", () => {
    const abierto = makeClient(1);
    const cerrado = makeClient(3);
    const state = makeState();
    state.wss = { clients: new Set([abierto, cerrado]) };

    broadcast(state, { tipo: "test" });

    expect(abierto.send).toHaveBeenCalled();
    expect(cerrado.send).not.toHaveBeenCalled();
  });

  it("no debería fallar si wss es null", () => {
    const state = makeState();
    state.wss = null;
    expect(() => broadcast(state, { tipo: "test" })).not.toThrow();
  });

  // REQ-WS-05 — sender exclusion (3rd arg)
  it("debería excluir al sender cuando se pasa como tercer argumento", () => {
    const wsA = makeClient(1);
    const wsB = makeClient(1);
    const state = makeState();
    state.wss = { clients: new Set([wsA, wsB]) };

    broadcast(state, { tipo: "test", data: 1 }, wsA);

    expect(wsA.send).not.toHaveBeenCalled();
    expect(wsB.send).toHaveBeenCalledWith(JSON.stringify({ tipo: "test", data: 1 }));
  });

  // REQ-WS-06 regression lock — undefined sender preserves current behavior
  it("debería mantener el comportamiento previo sin tercer argumento (regresión)", () => {
    const wsA = makeClient(1);
    const wsB = makeClient(1);
    const state = makeState();
    state.wss = { clients: new Set([wsA, wsB]) };

    broadcast(state, { tipo: "test", data: 2 });

    expect(wsA.send).toHaveBeenCalledWith(JSON.stringify({ tipo: "test", data: 2 }));
    expect(wsB.send).toHaveBeenCalledWith(JSON.stringify({ tipo: "test", data: 2 }));
  });

  // composition — docente and sender both filtered
  it("debería componer ambos filtros: docente y sender", () => {
    const docente = makeClient(1);
    const wsB = makeClient(1);
    const state = makeState();
    state.docente = docente;
    state.wss = { clients: new Set([docente, wsB]) };

    broadcast(state, { tipo: "test", data: 3 }, wsB);

    expect(docente.send).not.toHaveBeenCalled();
    expect(wsB.send).not.toHaveBeenCalled();
  });
});

describe("sendDocente", () => {
  it("debería enviar mensaje al docente autenticado", () => {
    const state = makeState();
    state.docente = makeClient(1);

    sendDocente(state, { tipo: "test" });

    expect(state.docente.send).toHaveBeenCalledWith(JSON.stringify({ tipo: "test" }));
  });

  it("no debería enviar si el docente está desconectado", () => {
    const state = makeState();
    state.docente = makeClient(3);

    sendDocente(state, { tipo: "test" });

    expect(state.docente.send).not.toHaveBeenCalled();
  });

  it("no debería fallar si docente es null", () => {
    const state = makeState();
    expect(() => sendDocente(state, { tipo: "test" })).not.toThrow();
  });
});

describe("mostrarResultado", () => {
  it("debería calcular puntajes correctamente", () => {
    const state = makeState({
      respuestasActuales: { id1: 0, id2: 2 },
      jugadores: {
        id1: { nombre: "Juan", puntaje: 0, puntajeGeneral: 0, historial: [] },
        id2: { nombre: "Maria", puntaje: 0, puntajeGeneral: 0, historial: [] }
      }
    });

    mostrarResultado(state);

    expect(state.estado.jugadores.id1.puntaje).toBe(100);
    expect(state.estado.jugadores.id2.puntaje).toBe(0);
    expect(state.estado.jugadores.id1.puntajeGeneral).toBe(100);
    expect(state.estado.jugadores.id2.puntajeGeneral).toBe(0);
  });

  it("debería acumular puntajeGeneral en partidas sucesivas", () => {
    const state = makeState({
      respuestasActuales: { id1: 0 },
      jugadores: {
        id1: { nombre: "Juan", puntaje: 0, puntajeGeneral: 500, historial: [] }
      }
    });

    mostrarResultado(state);

    expect(state.estado.jugadores.id1.puntaje).toBe(100);
    expect(state.estado.jugadores.id1.puntajeGeneral).toBe(600);
  });

  it("debería cambiar fase a resultado", () => {
    const state = makeState();
    state.estado.fase = "pregunta";
    state.estado.respuestasActuales = { id1: 0 };
    state.estado.jugadores.id1 = { nombre: "Juan", puntaje: 0, puntajeGeneral: 0, historial: [] };

    mostrarResultado(state);

    expect(state.estado.fase).toBe("resultado");
  });

  it("debería enviar resultado al docente y broadcast", () => {
    const docente = makeClient(1);
    const alumno = makeClient(1);
    const state = makeState({
      respuestasActuales: { id1: 0 },
      jugadores: {
        id1: { nombre: "Juan", puntaje: 0, puntajeGeneral: 0, historial: [] }
      }
    });
    state.docente = docente;
    state.wss = { clients: new Set([docente, alumno]) };

    mostrarResultado(state);

    const expectedMsg = expect.objectContaining({ tipo: "resultado", correcta: 0 });
    expect(docente.send).toHaveBeenCalledWith(expect.stringContaining('"tipo":"resultado"'));
    expect(alumno.send).toHaveBeenCalledWith(expect.stringContaining('"tipo":"resultado"'));
  });
});

// R3-002: re-entrancy guard.
// Cuando la última respuesta llega en el MISMO tick que expira el timer
// del pregunta, ambos paths invocan mostrarResultado. El segundo debe
// ser no-op para evitar doble broadcast de "resultado".
describe("R3-002: mostrarResultado re-entrancy guard", () => {
  it("es idempotente: si se llama 2 veces en el mismo tick, el segundo es no-op", () => {
    const docente = makeClient(1);
    const alumno = makeClient(1);
    const state = makeState({
      respuestasActuales: { id1: 0 },
      jugadores: {
        id1: { nombre: "Juan", puntaje: 0, puntajeGeneral: 0, historial: [] }
      },
      fase: "pregunta"
    });
    state.docente = docente;
    state.wss = { clients: new Set([docente, alumno]) };

    // 1ra llamada (simula "registrar-respuesta" cerró la ronda)
    mostrarResultado(state);

    // Capturar el conteo de broadcasts tras la 1ra llamada
    const llamadasTrasPrimero = {
      docente: docente.send.mock.calls.length,
      alumno: alumno.send.mock.calls.length
    };

    // 2da llamada en el mismo tick (simula "timer-expire" intentando cerrar)
    mostrarResultado(state);

    // El segundo llamado NO debe emitir NINGÚN mensaje adicional
    expect(docente.send.mock.calls.length).toBe(llamadasTrasPrimero.docente);
    expect(alumno.send.mock.calls.length).toBe(llamadasTrasPrimero.alumno);

    // La fase sigue siendo resultado (no fue mutada por el 2do call)
    expect(state.estado.fase).toBe("resultado");

    // El puntaje NO se duplicó (cada llamada premia con PUNTAJE_RESPUESTA_CORRECTA)
    expect(state.estado.jugadores.id1.puntaje).toBe(100);
  });

  it("no emite resultado adicional si la fase ya es resultado", () => {
    const docente = makeClient(1);
    const alumno = makeClient(1);
    const state = makeState({
      respuestasActuales: { id1: 0 },
      jugadores: {
        id1: { nombre: "Juan", puntaje: 100, puntajeGeneral: 0, historial: [] }
      },
      fase: "resultado"
    });
    state.docente = docente;
    state.wss = { clients: new Set([docente, alumno]) };

    mostrarResultado(state);

    // No debe haber NINGÚN send porque la fase ya es resultado
    expect(docente.send).not.toHaveBeenCalled();
    expect(alumno.send).not.toHaveBeenCalled();

    // El puntaje NO se alteró
    expect(state.estado.jugadores.id1.puntaje).toBe(100);
  });
});

describe("iniciarTimer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("debería reiniciar tiempo si no es continuación", () => {
    const state = makeState();
    state.estado.tiempoRestante = 5;
    state.estado.respuestasActuales = { id1: 0 };
    state.estado.jugadores.id1 = { nombre: "Juan", puntaje: 0, puntajeGeneral: 0, historial: [] };
    state.docente = makeClient(1);
    state.wss = { clients: new Set() };

    iniciarTimer(state);

    expect(state.estado.tiempoRestante).toBe(20);
  });

  it("debería mantener tiempo si es continuación", () => {
    const state = makeState();
    state.estado.tiempoRestante = 5;
    state.estado.respuestasActuales = { id1: 0 };
    state.estado.jugadores.id1 = { nombre: "Juan", puntaje: 0, puntajeGeneral: 0, historial: [] };
    state.docente = makeClient(1);
    state.wss = { clients: new Set() };

    iniciarTimer(state, true);

    expect(state.estado.tiempoRestante).toBe(5);
  });

  it("debería enviar ticks cada segundo", () => {
    const docente = makeClient(1);
    const alumno = makeClient(1);
    const state = makeState({
      respuestasActuales: { id1: 0 },
      jugadores: { id1: { nombre: "Juan", puntaje: 0, puntajeGeneral: 0, historial: [] } }
    });
    state.docente = docente;
    state.wss = { clients: new Set([docente, alumno]) };
    state.estado.tiempoPorPregunta = 5;

    iniciarTimer(state);

    jest.advanceTimersByTime(2000);

    expect(docente.send).toHaveBeenCalledWith(expect.stringContaining('"tiempo":4'));
    expect(docente.send).toHaveBeenCalledWith(expect.stringContaining('"tiempo":3'));
    expect(alumno.send).toHaveBeenCalledWith(expect.stringContaining('"tiempo":4'));
    expect(alumno.send).toHaveBeenCalledWith(expect.stringContaining('"tiempo":3'));
  });

  it("debería mostrar resultado cuando el tiempo llega a 0", () => {
    const state = makeState({
      respuestasActuales: { id1: 0 },
      jugadores: { id1: { nombre: "Juan", puntaje: 0, puntajeGeneral: 0, historial: [] } }
    });
    state.docente = makeClient(1);
    state.wss = { clients: new Set() };
    state.estado.tiempoPorPregunta = 2;

    iniciarTimer(state);
    jest.advanceTimersByTime(2000);

    expect(state.estado.fase).toBe("resultado");
  });

  it("debería limpiar timer anterior antes de crear uno nuevo", () => {
    const state = makeState({
      respuestasActuales: { id1: 0 },
      jugadores: { id1: { nombre: "Juan", puntaje: 0, puntajeGeneral: 0, historial: [] } }
    });
    state.docente = makeClient(1);
    state.wss = { clients: new Set() };
    state.timer = "timer-viejo";

    const clearSpy = jest.spyOn(global, "clearTimeout");
    iniciarTimer(state);

    expect(clearSpy).toHaveBeenCalledWith("timer-viejo");
    clearSpy.mockRestore();
  });

  it("no debería contar cuando está pausado", () => {
    const state = makeState({
      respuestasActuales: { id1: 0 },
      jugadores: { id1: { nombre: "Juan", puntaje: 0, puntajeGeneral: 0, historial: [] } }
    });
    state.docente = makeClient(1);
    state.wss = { clients: new Set() };
    state.estado.tiempoPorPregunta = 10;
    state.estado.pausado = true;

    iniciarTimer(state);
    jest.advanceTimersByTime(5000);

    expect(state.estado.tiempoRestante).toBe(10);
    expect(state.estado.fase).not.toBe("resultado");
  });
});

describe("jugadoresOnline", () => {
  it("debería retornar solo jugadores online", () => {
    const estado = {
      jugadores: {
        id1: { nombre: "Juan", online: true },
        id2: { nombre: "Maria", online: false },
        id3: { nombre: "Pedro" }
      }
    };

    const online = jugadoresOnline(estado);

    expect(online).toHaveLength(2);
    expect(online).toEqual([
      { nombre: "Juan" },
      { nombre: "Pedro" }
    ]);
  });

  it("debería retornar arreglo vacío si no hay jugadores", () => {
    expect(jugadoresOnline({ jugadores: {} })).toEqual([]);
  });
});

// Sección 15/17 del pedido: el docente no debe apretar "Siguiente pregunta"
// en el flujo normal — el servidor avanza solo, 2-3s después de mostrar el
// resultado.
describe("autoavance servidor-controlado tras RESULTADO", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("pasa automáticamente a la siguiente pregunta ~2.5s después del resultado", () => {
    const docente = makeClient(1);
    const state = makeState({
      preguntasActivas: [
        { pregunta: "¿P1?", opciones: ["A", "B", "C", "D"], correcta: 0 },
        { pregunta: "¿P2?", opciones: ["A", "B", "C", "D"], correcta: 1 }
      ],
      preguntaIdx: 0,
      respuestasActuales: { id1: 0 },
      jugadores: { id1: { nombre: "Juan", puntaje: 0, puntajeGeneral: 0, historial: [] } }
    });
    state.docente = docente;
    state.wss = { clients: new Set([docente]) };
    state.alumnoSocketPorId = new Map();

    mostrarResultado(state);
    expect(state.estado.fase).toBe("resultado");

    jest.advanceTimersByTime(2500);

    expect(state.estado.fase).toBe("pregunta");
    expect(state.estado.preguntaIdx).toBe(1);
  });

  it("no avanza antes de que pase el tiempo de espera", () => {
    const state = makeState({
      preguntasActivas: [
        { pregunta: "¿P1?", opciones: ["A", "B", "C", "D"], correcta: 0 },
        { pregunta: "¿P2?", opciones: ["A", "B", "C", "D"], correcta: 1 }
      ],
      preguntaIdx: 0,
      respuestasActuales: { id1: 0 },
      jugadores: { id1: { nombre: "Juan", puntaje: 0, puntajeGeneral: 0, historial: [] } }
    });
    state.wss = { clients: new Set() };

    mostrarResultado(state);
    jest.advanceTimersByTime(1000);

    expect(state.estado.fase).toBe("resultado");
  });

  it("si era la última pregunta, el autoavance termina el juego (fin_juego)", () => {
    const state = makeState({
      preguntasActivas: [{ pregunta: "¿Única?", opciones: ["A", "B", "C", "D"], correcta: 0 }],
      preguntaIdx: 0,
      respuestasActuales: { id1: 0 },
      jugadores: { id1: { nombre: "Juan", puntaje: 0, puntajeGeneral: 0, historial: [] } }
    });
    state.wss = { clients: new Set() };

    mostrarResultado(state);
    jest.advanceTimersByTime(2500);

    expect(state.estado.fase).toBe("fin");
  });
});
