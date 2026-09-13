// Tests for the alumno reconnect use case (R3-001).
//
// Covers three scenarios from the spec:
//   1. Malformed UUID rejected without crashing (no prototype mutation).
//   2. Mid-pregunta reconnect with same id + prior answer cannot vote twice.
//   3. Reconnect in a later pregunta may answer.

const {
  reconstruirEstado,
  registrarNuevo
} = require("../../src/server/application/use-cases/reconectar-alumno");

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
    // R4-002: socket VIGENTE por id de alumno — permite al close handler
    // distinguir el cierre de un socket stale (el alumno ya reconectó).
    alumnoSocketPorId: new Map(),
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
  // R3-001: defensive cleanup — make sure we didn't pollute Object.prototype.
  expect({}.pollutionProbe).toBeUndefined();
});

describe("R3-001: alumno reconnect — UUID validation", () => {
  it("rechaza id malformado '__proto__' con auth_rechazada y no muta Object.prototype", () => {
    const ws = makeWs();
    const state = makeState();

    registrarNuevo(ws, { tipo: "alumno_entra", nombre: "Ana", id: "__proto__" }, state);

    expect(ws.sent).toHaveLength(1);
    expect(ws.sent[0].tipo).toBe("auth_rechazada");
    expect(ws.sent[0].razon).toBe("id_invalido");

    // R3-001 explicitly: SHALL NOT mutate Object.prototype.
    expect({}.pollutionProbe).toBeUndefined();
    expect(Object.prototype.pollutionProbe).toBeUndefined();
  });

  it("rechaza id malformado 'constructor' con auth_rechazada id_invalido", () => {
    const ws = makeWs();
    const state = makeState();

    registrarNuevo(ws, { tipo: "alumno_entra", nombre: "Ana", id: "constructor" }, state);

    expect(ws.sent[0].tipo).toBe("auth_rechazada");
    expect(ws.sent[0].razon).toBe("id_invalido");
  });

  it("rechaza id que no es UUIDv4 (ej. 'abc123') con id_invalido", () => {
    const ws = makeWs();
    const state = makeState();

    registrarNuevo(ws, { tipo: "alumno_entra", nombre: "Ana", id: "abc123" }, state);

    expect(ws.sent[0].tipo).toBe("auth_rechazada");
    expect(ws.sent[0].razon).toBe("id_invalido");
  });

  it("acepta id ausente (sin id) — genera uno nuevo y emite bienvenido normal", () => {
    const ws = makeWs();
    const state = makeState();

    const id = registrarNuevo(ws, { tipo: "alumno_entra", nombre: "Ana" }, state);

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(ws.sent[0].tipo).toBe("bienvenido");
    expect(ws.sent[0].id).toBe(id);
  });
});

describe("R3-001: alumno reconnect — mid-pregunta no double vote", () => {
  const FAKE_UUID = "12345678-1234-4abc-9def-1234567890ab";
  const PREGUNTA = { pregunta: "¿X?", opciones: ["A", "B", "C", "D"], correcta: 0 };

  it("reconstruye sesión sin permitir segundo voto si respondioActual era true", () => {
    const ws = makeWs();
    const state = makeState({
      estado: {
        jugadores: {
          [FAKE_UUID]: {
            nombre: "Ana",
            puntaje: 0,
            puntajeGeneral: 0,
            respondioActual: true,
            historial: [],
            online: false
          }
        },
        respuestasActuales: { [FAKE_UUID]: 0 },
        preguntasActivas: [PREGUNTA],
        preguntaIdx: 0,
        fase: "pregunta",
        tiempoRestante: 10,
        tiempoPorPregunta: 20,
        pausado: false,
        totalJugadoresPregunta: 1
      }
    });

    reconstruirEstado(ws, state, FAKE_UUID, "Ana");

    // bienvenido se emite con respondioActual=true y la respuesta anterior.
    expect(ws.sent[0].tipo).toBe("bienvenido");
    expect(ws.sent[0].reconectado).toBe(true);
    expect(ws.sent[0].id).toBe(FAKE_UUID);
    expect(ws.sent[0].respondioActual).toBe(true);
    expect(ws.sent[0].respuestaAnterior).toBe(0);
    // El jugador no es clonado: sigue siendo el mismo objeto en estado.jugadores.
    expect(state.estado.jugadores[FAKE_UUID].respondioActual).toBe(true);
    // respondieron === total — la ronda puede avanzar.
    const respondieron = Object.keys(state.estado.respuestasActuales).length;
    expect(respondieron).toBeLessThanOrEqual(state.estado.totalJugadoresPregunta);
  });

  it("mantiene respondioActual=true en el jugador restaurado (no permite re-voto)", () => {
    // Verifica que un handler aguas abajo (registrar-respuesta) vería respondioActual=true.
    const ws = makeWs();
    const state = makeState({
      estado: {
        jugadores: {
          [FAKE_UUID]: {
            nombre: "Ana",
            puntaje: 0,
            puntajeGeneral: 0,
            respondioActual: true,
            historial: [],
            online: false
          }
        },
        respuestasActuales: { [FAKE_UUID]: 0 },
        preguntasActivas: [PREGUNTA],
        preguntaIdx: 0,
        fase: "pregunta",
        tiempoRestante: 10,
        tiempoPorPregunta: 20,
        pausado: false,
        totalJugadoresPregunta: 1
      }
    });

    reconstruirEstado(ws, state, FAKE_UUID, "Ana");

    // El id sigue mapeado a un jugador con respondioActual=true.
    const j = state.estado.jugadores[FAKE_UUID];
    expect(j.respondioActual).toBe(true);
  });
});

describe("R3-001: alumno reconnect — later pregunta may answer", () => {
  const FAKE_UUID = "12345678-1234-4abc-9def-1234567890ab";

  it("reconstruye sesión con respondioActual=false en pregunta posterior", () => {
    const ws = makeWs();
    const state = makeState({
      estado: {
        jugadores: {
          [FAKE_UUID]: {
            nombre: "Ana",
            puntaje: 0,
            puntajeGeneral: 0,
            respondioActual: false,
            historial: [],
            online: false
          }
        },
        respuestasActuales: {},
        preguntasActivas: [
          { pregunta: "¿1?", opciones: ["A", "B", "C", "D"], correcta: 0 },
          { pregunta: "¿2?", opciones: ["A", "B", "C", "D"], correcta: 1 }
        ],
        preguntaIdx: 1,
        fase: "pregunta",
        tiempoRestante: 10,
        tiempoPorPregunta: 20,
        pausado: false,
        totalJugadoresPregunta: 1
      }
    });

    reconstruirEstado(ws, state, FAKE_UUID, "Ana");

    const bienvenido = ws.sent[0];
    expect(bienvenido.tipo).toBe("bienvenido");
    expect(bienvenido.respondioActual).toBe(false);
    expect(bienvenido.idx).toBe(1);
  });

  describe("R1-001: token management on join & reconnect", () => {
    it("debería incluir un token en bienvenido al registrar un nuevo alumno", () => {
      const ws = makeWs();
      const state = makeState();
      state.estado.tokens = {};

      const id = registrarNuevo(ws, { tipo: "alumno_entra", nombre: "Ana" }, state);

      expect(ws.sent[0].tipo).toBe("bienvenido");
      expect(ws.sent[0].token).toBeTruthy();
      expect(typeof ws.sent[0].token).toBe("string");
      expect(state.estado.tokens[id]).toBe(ws.sent[0].token);
    });

    it("permite reconexión legacy (sin token) en ventana de gracia si no hay token previo", () => {
      const ws = makeWs();
      const id = "12345678-1234-4abc-9def-1234567890ab";
      const state = makeState();
      state.estado.jugadores[id] = { nombre: "Ana", online: false, puntaje: 0 };
      state.estado.tokens = {};

      reconstruirEstado(ws, state, id, "Ana", undefined);

      expect(ws.sent[0].tipo).toBe("bienvenido");
      expect(ws.sent[0].token).toBeTruthy();
      expect(state.estado.tokens[id]).toBe(ws.sent[0].token);
    });

    it("permite reconexión con token correcto si ya fue emitido", () => {
      const ws = makeWs();
      const id = "12345678-1234-4abc-9def-1234567890ab";
      const state = makeState();
      state.estado.jugadores[id] = { nombre: "Ana", online: false, puntaje: 0 };
      state.estado.tokens = {
        [id]: "token-valido-123"
      };

      reconstruirEstado(ws, state, id, "Ana", "token-valido-123");

      expect(ws.sent[0].tipo).toBe("bienvenido");
      expect(ws.sent[0].token).toBe("token-valido-123");
    });

    it("rechaza reconexión con token incorrecto si ya existe un token en el servidor", () => {
      const ws = makeWs();
      const id = "12345678-1234-4abc-9def-1234567890ab";
      const state = makeState();
      state.estado.jugadores[id] = { nombre: "Ana", online: false, puntaje: 0 };
      state.estado.tokens = {
        [id]: "token-valido-123"
      };

      reconstruirEstado(ws, state, id, "Ana", "token-incorrecto");

      expect(ws.sent[0].tipo).toBe("auth_rechazada");
      expect(ws.sent[0].razon).toBe("token_rotado");
    });

    it("rechaza reconexión sin token si ya existe un token en el servidor (fuera de la ventana de gracia)", () => {
      const ws = makeWs();
      const id = "12345678-1234-4abc-9def-1234567890ab";
      const state = makeState();
      state.estado.jugadores[id] = { nombre: "Ana", online: false, puntaje: 0 };
      state.estado.tokens = {
        [id]: "token-valido-123"
      };

      reconstruirEstado(ws, state, id, "Ana", undefined);

      expect(ws.sent[0].tipo).toBe("auth_rechazada");
      expect(ws.sent[0].razon).toBe("token_rotado");
    });
  });
});

describe("REQ-WS-08: cookie id as player identity (D1)", () => {
  const COOKIE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const OTRO_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const PREGUNTA = { pregunta: "¿X?", opciones: ["A", "B", "C", "D"], correcta: 0, epoca: "Colonial" };

  it("registra al alumno bajo msg.id (cookie) — bienvenido.id === msg.id", () => {
    const ws = makeWs();
    const state = makeState();
    state.estado.tokens = {};

    const id = registrarNuevo(ws, { tipo: "alumno_entra", nombre: "Ana", id: COOKIE_ID }, state);

    expect(id).toBe(COOKIE_ID);
    expect(state.estado.jugadores[COOKIE_ID].nombre).toBe("Ana");
    expect(ws.sent[0].tipo).toBe("bienvenido");
    expect(ws.sent[0].id).toBe(COOKIE_ID);
    expect(ws.sent[0].reconectado).toBe(false);
  });

  it("mismo id + mismo nombre → reconectado:true, mismo id, respondioActual preservado, sin error_nombre", () => {
    const ws1 = makeWs();
    const state = makeState();
    state.estado.tokens = {};

    // Primer join: el alumno queda registrado bajo la cookie
    registrarNuevo(ws1, { tipo: "alumno_entra", nombre: "Ana", id: COOKIE_ID }, state);
    expect(ws1.sent[0].id).toBe(COOKIE_ID);

    // Avanza la partida: respondió mid-pregunta
    state.estado.fase = "pregunta";
    state.estado.preguntasActivas = [PREGUNTA];
    state.estado.preguntaIdx = 0;
    state.estado.tiempoRestante = 10;
    state.estado.respuestasActuales[COOKIE_ID] = 0;
    state.estado.jugadores[COOKIE_ID].respondioActual = true;

    // Reconnect con la misma cookie + nombre → restaura
    const ws2 = makeWs();
    registrarNuevo(ws2, { tipo: "alumno_entra", nombre: "Ana", id: COOKIE_ID, token: state.estado.tokens[COOKIE_ID] }, state);

    expect(ws2.sent[0].tipo).toBe("bienvenido");
    expect(ws2.sent[0].reconectado).toBe(true);
    expect(ws2.sent[0].id).toBe(COOKIE_ID);
    expect(ws2.sent[0].respondioActual).toBe(true);
    expect(ws2.sent.some((m) => m.tipo === "error_nombre")).toBe(false);
    // No se clonó el jugador
    expect(state.estado.jugadores[COOKIE_ID].respondioActual).toBe(true);
  });

  it("mismo nombre desde otro id → error_nombre (regla de duplicados intacta)", () => {
    const ws = makeWs();
    const state = makeState({
      estado: {
        jugadores: { [COOKIE_ID]: { nombre: "Ana", puntaje: 0, puntajeGeneral: 0, respondioActual: false, historial: [], online: true } },
        respuestasActuales: {},
        preguntasActivas: [PREGUNTA],
        preguntaIdx: 0,
        fase: "lobby",
        tiempoRestante: 0,
        tiempoPorPregunta: 20,
        pausado: false,
        totalJugadoresPregunta: 0
      }
    });

    registrarNuevo(ws, { tipo: "alumno_entra", nombre: "Ana", id: OTRO_ID }, state);

    expect(ws.sent[0].tipo).toBe("error_nombre");
    expect(state.estado.jugadores[COOKIE_ID].nombre).toBe("Ana");
  });

  it("W1: reemplazo de slot huérfano con cookie propia borra respuestasActuales[oldId] (sin crédito fantasma)", () => {
    const ws = makeWs();
    ws.alumnoId = COOKIE_ID; // path legítimo: la cookie ES la identidad
    const state = makeState({
      estado: {
        jugadores: {
          [COOKIE_ID]: { nombre: "Ana", puntaje: 0, puntajeGeneral: 0, respondioActual: false, historial: [], online: false }
        },
        respuestasActuales: { [COOKIE_ID]: 0 },
        preguntasActivas: [PREGUNTA],
        preguntaIdx: 0,
        fase: "pregunta",
        tiempoRestante: 10,
        tiempoPorPregunta: 20,
        pausado: false,
        totalJugadoresPregunta: 2
      }
    });

    registrarNuevo(ws, { tipo: "alumno_entra", nombre: "Bruno", id: COOKIE_ID }, state);

    // El slot se re-crea bajo el MISMO id (la cookie es la identidad)
    expect(state.estado.jugadores[COOKIE_ID].nombre).toBe("Bruno");
    expect(state.estado.jugadores[COOKIE_ID].respondioActual).toBe(false);
    // W1: la respuesta vieja del slot huérfano no cuenta como crédito al cerrar la ronda
    expect(state.estado.respuestasActuales[COOKIE_ID]).toBeUndefined();
    expect(Object.keys(state.estado.respuestasActuales)).toHaveLength(0);
    expect(ws.sent[0].tipo).toBe("bienvenido");
    expect(ws.sent[0].id).toBe(COOKIE_ID);
    expect(ws.sent[0].reconectado).toBe(false);
  });
});

describe("Gatekeeper #2: el reemplazo de slot existente requiere ligadura de cookie (ws.alumnoId === id)", () => {
  const COOKIE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("socket raw (sin ws.alumnoId) NO reemplaza el slot de un jugador existente con nombre distinto", () => {
    const ws = makeWs(); // raw: sin cookie
    const state = makeState({
      estado: {
        jugadores: {
          [COOKIE_ID]: { nombre: "Ana", puntaje: 0, puntajeGeneral: 0, respondioActual: false, historial: [], online: false }
        },
        respuestasActuales: {},
        preguntasActivas: [],
        preguntaIdx: 0,
        fase: "lobby",
        tiempoRestante: 0,
        tiempoPorPregunta: 20,
        pausado: false,
        totalJugadoresPregunta: 0,
        tokens: { [COOKIE_ID]: "token-ana-1" }
      }
    });

    const result = registrarNuevo(ws, { tipo: "alumno_entra", nombre: "Impostor", id: COOKIE_ID }, state);

    expect(result).toBeNull();
    expect(ws.sent[0].tipo).toBe("auth_rechazada");
    expect(ws.sent[0].razon).toBe("id_ajeno");
    // Sin bienvenido, slot intacto, token sin rotar
    expect(ws.sent.some((m) => m.tipo === "bienvenido")).toBe(false);
    expect(state.estado.jugadores[COOKIE_ID].nombre).toBe("Ana");
    expect(state.estado.tokens[COOKIE_ID]).toBe("token-ana-1");
  });

  it("cookie legítima (ws.alumnoId === id) + nombre distinto → reemplazo limpio del slot huérfano (comportamiento preservado)", () => {
    const ws = makeWs();
    ws.alumnoId = COOKIE_ID;
    const state = makeState({
      estado: {
        jugadores: {
          [COOKIE_ID]: { nombre: "Ana", puntaje: 0, puntajeGeneral: 0, respondioActual: false, historial: [], online: false }
        },
        respuestasActuales: {},
        preguntasActivas: [],
        preguntaIdx: 0,
        fase: "lobby",
        tiempoRestante: 0,
        tiempoPorPregunta: 20,
        pausado: false,
        totalJugadoresPregunta: 0,
        tokens: { [COOKIE_ID]: "token-ana-1" }
      }
    });

    const result = registrarNuevo(ws, { tipo: "alumno_entra", nombre: "Bruno", id: COOKIE_ID }, state);

    expect(result).toBe(COOKIE_ID);
    expect(ws.sent[0].tipo).toBe("bienvenido");
    expect(state.estado.jugadores[COOKIE_ID].nombre).toBe("Bruno");
    // El nuevo jugador recibió un token fresco
    expect(state.estado.tokens[COOKIE_ID]).toBeTruthy();
    expect(state.estado.tokens[COOKIE_ID]).not.toBe("token-ana-1");
  });
});

describe("D3: token_rotado — el token fresco SOLO se entrega al socket con cookie ligada (ws.alumnoId === id)", () => {
  const FAKE_UUID = "12345678-1234-4abc-9def-1234567890ab";
  const OTRA_COOKIE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  it("cookie legítima (ws.alumnoId === id) + token incorrecto → auth_rechazada{token_rotado, token:fresh} y tokens[id] rotado", () => {
    const ws = makeWs();
    ws.alumnoId = FAKE_UUID;
    const state = makeState();
    state.estado.jugadores[FAKE_UUID] = { nombre: "Ana", online: false, puntaje: 0 };
    state.estado.tokens = { [FAKE_UUID]: "token-viejo-1" };

    reconstruirEstado(ws, state, FAKE_UUID, "Ana", "token-incorrecto");

    expect(ws.sent[0].tipo).toBe("auth_rechazada");
    expect(ws.sent[0].razon).toBe("token_rotado");
    expect(ws.sent[0].token).toBeTruthy();
    expect(ws.sent[0].token).not.toBe("token-viejo-1");
    expect(state.estado.tokens[FAKE_UUID]).toBe(ws.sent[0].token);
  });

  it("cookie legítima (ws.alumnoId === id) sin token → auth_rechazada{token_rotado, token:fresh}", () => {
    const ws = makeWs();
    ws.alumnoId = FAKE_UUID;
    const state = makeState();
    state.estado.jugadores[FAKE_UUID] = { nombre: "Ana", online: false, puntaje: 0 };
    state.estado.tokens = { [FAKE_UUID]: "token-viejo-1" };

    reconstruirEstado(ws, state, FAKE_UUID, "Ana", undefined);

    expect(ws.sent[0].tipo).toBe("auth_rechazada");
    expect(ws.sent[0].razon).toBe("token_rotado");
    expect(ws.sent[0].token).toBeTruthy();
    expect(state.estado.tokens[FAKE_UUID]).toBe(ws.sent[0].token);
  });

  it("socket raw sin cookie presentando id+nombre ajeno con token incorrecto → rechazo SIN token y SIN rotar el token de la víctima", () => {
    const ws = makeWs(); // sin ws.alumnoId: socket raw / cookie forjada no ligada
    const state = makeState();
    state.estado.jugadores[FAKE_UUID] = { nombre: "Ana", online: false, puntaje: 0 };
    state.estado.tokens = { [FAKE_UUID]: "token-viejo-1" };

    reconstruirEstado(ws, state, FAKE_UUID, "Ana", "token-incorrecto");

    expect(ws.sent[0].tipo).toBe("auth_rechazada");
    expect(ws.sent[0].razon).toBe("token_rotado");
    expect(ws.sent[0]).not.toHaveProperty("token");
    // La sesión de la víctima NO se tocó: el token sigue siendo el original
    expect(state.estado.tokens[FAKE_UUID]).toBe("token-viejo-1");
  });

  it("socket raw sin cookie sin token → rechazo SIN token (rechazo muerto pre-fix)", () => {
    const ws = makeWs();
    const state = makeState();
    state.estado.jugadores[FAKE_UUID] = { nombre: "Ana", online: false, puntaje: 0 };
    state.estado.tokens = { [FAKE_UUID]: "token-viejo-1" };

    reconstruirEstado(ws, state, FAKE_UUID, "Ana", undefined);

    expect(ws.sent[0].tipo).toBe("auth_rechazada");
    expect(ws.sent[0].razon).toBe("token_rotado");
    expect(ws.sent[0]).not.toHaveProperty("token");
    expect(state.estado.tokens[FAKE_UUID]).toBe("token-viejo-1");
  });

  it("cookie de OTRO alumno (ws.alumnoId !== id) → rechazo SIN token", () => {
    const ws = makeWs();
    ws.alumnoId = OTRA_COOKIE;
    const state = makeState();
    state.estado.jugadores[FAKE_UUID] = { nombre: "Ana", online: false, puntaje: 0 };
    state.estado.tokens = { [FAKE_UUID]: "token-viejo-1" };

    reconstruirEstado(ws, state, FAKE_UUID, "Ana", "token-incorrecto");

    expect(ws.sent[0].tipo).toBe("auth_rechazada");
    expect(ws.sent[0].razon).toBe("token_rotado");
    expect(ws.sent[0]).not.toHaveProperty("token");
    expect(state.estado.tokens[FAKE_UUID]).toBe("token-viejo-1");
  });
});

describe("R4-002: alumnoSocketPorId — el socket VIGENTE por id de alumno", () => {
  const FAKE_UUID = "12345678-1234-4abc-9def-1234567890ab";

  it("registrarNuevo marca el socket como vigente del id (id → ws)", () => {
    const ws = makeWs();
    ws.alumnoId = FAKE_UUID;
    const state = makeState();

    registrarNuevo(ws, { tipo: "alumno_entra", nombre: "Ana", id: FAKE_UUID }, state);

    expect(state.alumnoSocketPorId.get(FAKE_UUID)).toBe(ws);
  });

  it("reconstruirEstado REEMPLAZA el socket vigente cuando el alumno reconecta con otro socket", () => {
    const wsViejo = makeWs();
    wsViejo.alumnoId = FAKE_UUID;
    const wsNuevo = makeWs();
    wsNuevo.alumnoId = FAKE_UUID;
    const state = makeState();
    state.estado.jugadores[FAKE_UUID] = { nombre: "Ana", online: false, puntaje: 0 };
    state.estado.tokens = { [FAKE_UUID]: "token-1" };
    state.alumnos.set(wsViejo, FAKE_UUID);
    state.alumnoSocketPorId.set(FAKE_UUID, wsViejo);

    reconstruirEstado(wsNuevo, state, FAKE_UUID, "Ana", "token-1");

    // El viejo queda como zombie en state.alumnos pero el VIGENTE es el nuevo
    expect(state.alumnoSocketPorId.get(FAKE_UUID)).toBe(wsNuevo);
    expect(state.alumnos.get(wsViejo)).toBe(FAKE_UUID);
    expect(state.alumnos.get(wsNuevo)).toBe(FAKE_UUID);
  });

  it("el reemplazo de slot huérfano (nombre distinto, cookie propia) actualiza el socket vigente", () => {
    const ws = makeWs();
    ws.alumnoId = FAKE_UUID;
    const state = makeState();
    state.estado.jugadores[FAKE_UUID] = { nombre: "Ana", online: false, puntaje: 0 };
    state.estado.tokens = { [FAKE_UUID]: "token-ana-1" };

    registrarNuevo(ws, { tipo: "alumno_entra", nombre: "Bruno", id: FAKE_UUID }, state);

    expect(state.alumnoSocketPorId.get(FAKE_UUID)).toBe(ws);
  });

  it("un rechazo (id_ajeno) NO toca el socket vigente de la víctima", () => {
    const wsAtacante = makeWs(); // sin alumnoId: raw socket
    const wsVictima = makeWs();
    wsVictima.alumnoId = FAKE_UUID;
    const state = makeState();
    state.estado.jugadores[FAKE_UUID] = { nombre: "Ana", online: false, puntaje: 0 };
    state.estado.tokens = { [FAKE_UUID]: "token-ana-1" };
    state.alumnoSocketPorId.set(FAKE_UUID, wsVictima);

    const result = registrarNuevo(wsAtacante, { tipo: "alumno_entra", nombre: "Intruso", id: FAKE_UUID }, state);

    expect(result).toBeNull();
    expect(state.alumnoSocketPorId.get(FAKE_UUID)).toBe(wsVictima);
  });
});

describe("REQ-WS-12: reconexión en fase FIN — bienvenido incluye miHistorial y rankings", () => {
  const FAKE_UUID = "12345678-1234-4abc-9def-1234567890ab";
  const HISTORIAL = [
    { n: 1, pregunta: "¿X?", correctaLetra: "A", opcionLetra: "B", opcionTexto: "Otra", respondio: true, acerto: false },
    { n: 2, pregunta: "¿Y?", correctaLetra: "C", opcionLetra: null, opcionTexto: null, respondio: false, acerto: false },
  ];

  it("bienvenido en fase FIN transporta el historial propio y los rankings", () => {
    const ws = makeWs();
    const state = makeState({
      estado: {
        fase: "fin",
        jugadores: {
          [FAKE_UUID]: { nombre: "Ana", online: false, puntaje: 0, puntajeGeneral: 0, historial: HISTORIAL }
        },
        respuestasActuales: {},
        preguntasActivas: [],
        preguntaIdx: 1,
        tiempoRestante: 0,
        tiempoPorPregunta: 20,
        pausado: false,
        totalJugadoresPregunta: 0,
        tokens: { [FAKE_UUID]: "token-1" }
      }
    });

    reconstruirEstado(ws, state, FAKE_UUID, "Ana", "token-1");

    const bienvenido = ws.sent[0];
    expect(bienvenido.tipo).toBe("bienvenido");
    expect(bienvenido.fase).toBe("fin");
    expect(bienvenido.miHistorial).toEqual(HISTORIAL);
    expect(Array.isArray(bienvenido.jugadores)).toBe(true);
    expect(Array.isArray(bienvenido.rankingGeneral)).toBe(true);
  });

  it("jugador sin historial (estado legacy) → miHistorial []", () => {
    const ws = makeWs();
    const state = makeState({
      estado: {
        fase: "fin",
        jugadores: {
          [FAKE_UUID]: { nombre: "Ana", online: false, puntaje: 0, puntajeGeneral: 0 }
        },
        respuestasActuales: {},
        preguntasActivas: [],
        preguntaIdx: 1,
        tiempoRestante: 0,
        tiempoPorPregunta: 20,
        pausado: false,
        totalJugadoresPregunta: 0,
        tokens: { [FAKE_UUID]: "token-1" }
      }
    });

    reconstruirEstado(ws, state, FAKE_UUID, "Ana", "token-1");

    expect(ws.sent[0].tipo).toBe("bienvenido");
    expect(ws.sent[0].miHistorial).toEqual([]);
  });

  it("un tercer alumno nunca ve el historial del reconectado (no hay campo de más)", () => {
    const ws = makeWs();
    const state = makeState({
      estado: {
        fase: "fin",
        jugadores: {
          [FAKE_UUID]: { nombre: "Ana", online: false, puntaje: 0, puntajeGeneral: 0, historial: HISTORIAL },
          otraUuid: { nombre: "Bob", online: false, puntaje: 0, puntajeGeneral: 0, historial: [{ n: 1, pregunta: "¿Historia secreta de Bob?", correctaLetra: "D", opcionLetra: null, opcionTexto: null, respondio: false, acerto: false }] }
        },
        respuestasActuales: {},
        preguntasActivas: [],
        preguntaIdx: 0,
        tiempoRestante: 0,
        tiempoPorPregunta: 20,
        pausado: false,
        totalJugadoresPregunta: 0,
        tokens: { [FAKE_UUID]: "token-1" }
      }
    });

    reconstruirEstado(ws, state, FAKE_UUID, "Ana", "token-1");

    // El bienvenido SÓLO lleva miHistorial (propio); el historial del otro
    // jugador no aparece en ningún campo del mensaje.
    expect(ws.sent[0].miHistorial).toEqual(HISTORIAL);
    expect(JSON.stringify(ws.sent[0])).not.toContain("secreta");
  });
});

