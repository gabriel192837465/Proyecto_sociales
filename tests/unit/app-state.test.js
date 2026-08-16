const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "historia-snapshot-test-"));
const TMP_DB = path.join(TMP_DIR, "historia-quiz.db");
const TMP_SNAPSHOT = path.join(TMP_DIR, "estado-juego.json");

describe("application/app-state — snapshot", () => {
  let appState;

  beforeAll(() => {
    process.env.HISTORIA_DB_PATH = TMP_DB;
    process.env.HISTORIA_SNAPSHOT_PATH = TMP_SNAPSHOT;
  });

  afterAll(() => {
    try {
      const { closeDB } = require("../../src/server/infra/db");
      closeDB();
    } catch { /* ignore */ }
    delete process.env.HISTORIA_DB_PATH;
    delete process.env.HISTORIA_SNAPSHOT_PATH;
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    jest.resetModules();
    try {
      const { closeDB } = require("../../src/server/infra/db");
      closeDB();
    } catch { /* ignore */ }
    try { fs.unlinkSync(TMP_DB); } catch { /* ignore */ }
    try { fs.unlinkSync(TMP_SNAPSHOT); } catch { /* ignore */ }
    appState = require("../../src/server/application/app-state");
  });

  afterEach(() => {
    try {
      const { closeDB } = require("../../src/server/infra/db");
      closeDB();
    } catch { /* ignore */ }
  });

  describe("guardarSnapshot (alias de guardarEstado)", () => {
    it("debería persistir todos los campos del estado en SQLite", () => {
      const estado = {
        fase: "pregunta",
        preguntaIdx: 3,
        tiempoRestante: 15,
        tiempoPorPregunta: 20,
        pausado: false,
        totalJugadoresPregunta: 4,
        jugadores: { a: { nombre: "Ana", puntaje: 10 } },
        respuestasActuales: { a: 1 },
        preguntasActivas: ["p1", "p2"],
      };

      appState.guardarSnapshot(estado);

      // Leer de vuelta desde SQLite via cargarEstado
      const loaded = appState.cargarEstado();
      expect(loaded).toMatchObject({
        fase: "pregunta",
        preguntaIdx: 3,
        tiempoRestante: 15,
        tiempoPorPregunta: 20,
        pausado: false,
        totalJugadoresPregunta: 4,
      });
      expect(loaded.jugadores).toEqual({ a: { nombre: "Ana", puntaje: 10 } });
      expect(loaded.respuestasActuales).toEqual({ a: 1 });
      expect(loaded.preguntasActivas).toEqual(["p1", "p2"]);
    });

  });

  describe("cargarSnapshot (alias de cargarEstado)", () => {
    it("debería devolver null si no hay sesión persistida", () => {
      expect(appState.cargarSnapshot()).toBeNull();
    });

    it("debería devolver el estado persistido en SQLite", () => {
      const estado = { fase: "pregunta", preguntaIdx: 2, jugadores: { x: { nombre: "X" } }, respuestasActuales: {}, preguntasActivas: [], tiempoRestante: 10, tiempoPorPregunta: 20, pausado: false, totalJugadoresPregunta: 0 };
      appState.guardarSnapshot(estado);

      const loaded = appState.cargarSnapshot();
      expect(loaded.fase).toBe("pregunta");
      expect(loaded.preguntaIdx).toBe(2);
      expect(loaded.jugadores).toEqual({ x: { nombre: "X" } });
    });


  });

  describe("borrarSnapshot", () => {
    it("debería limpiar la sesión en SQLite", () => {
      const estado = { fase: "lobby", preguntaIdx: -1, jugadores: {}, respuestasActuales: {}, preguntasActivas: [], tiempoRestante: 0, tiempoPorPregunta: 10, pausado: false, totalJugadoresPregunta: 0 };
      appState.guardarSnapshot(estado);
      expect(appState.cargarSnapshot()).not.toBeNull();

      appState.borrarSnapshot();
      expect(appState.cargarSnapshot()).toBeNull();
    });

    it("no debería tirar si no hay sesión", () => {
      expect(() => appState.borrarSnapshot()).not.toThrow();
    });
  });

  describe("createAppState", () => {
    it("debería crear estado inicial con snapshotRecuperado=false", () => {
      const state = appState.createAppState();
      expect(state.snapshotRecuperado).toBe(false);
      expect(state.estado).toBeDefined();
      expect(state.alumnos).toBeInstanceOf(Map);
    });

    it("debería iniciar limpio si no hay snapshot", () => {
      const state = appState.createAppState();
      expect(state.snapshotRecuperado).toBe(false);
      expect(state.estado.fase).toBe("lobby");
    });
  });

  describe("cargarEstado + apply (flujo de createApp)", () => {
    it("debería exponer los datos necesarios para que createApp los aplique", () => {
      const estadoGuardado = {
        fase: "resultado",
        preguntaIdx: 7,
        tiempoRestante: 5,
        tiempoPorPregunta: 20,
        pausado: false,
        totalJugadoresPregunta: 3,
        jugadores: { u1: { nombre: "Ana" } },
        respuestasActuales: { u1: 2 },
        preguntasActivas: ["p1", "p2"],
      };
      appState.guardarSnapshot(estadoGuardado);

      const snapshot = appState.cargarEstado();
      const state = appState.createAppState();
      Object.assign(state.estado, snapshot);
      state.snapshotRecuperado = true;

      expect(state.snapshotRecuperado).toBe(true);
      expect(state.estado.fase).toBe("resultado");
      expect(state.estado.preguntaIdx).toBe(7);
      expect(state.estado.jugadores).toEqual({ u1: { nombre: "Ana" } });
    });
  });

  describe("resetForTests", () => {
    it("debería limpiar la sesión en SQLite", () => {
      const estado = { fase: "pregunta", preguntaIdx: 0, jugadores: {}, respuestasActuales: {}, preguntasActivas: [], tiempoRestante: 10, tiempoPorPregunta: 20, pausado: false, totalJugadoresPregunta: 0 };
      appState.guardarSnapshot(estado);
      const state = appState.createAppState();

      appState.resetForTests(state);

      expect(appState.cargarSnapshot()).toBeNull();
    });

    it("debería resetear snapshotRecuperado a false", () => {
      const state = appState.createAppState();
      state.snapshotRecuperado = true;

      appState.resetForTests(state);
      expect(state.snapshotRecuperado).toBe(false);
    });

    it("debería limpiar jugadores y docentes del estado", () => {
      const state = appState.createAppState();
      state.docente = { send: () => { } };
      state.alumnos.set("uuid-1", { ws: { send: () => { } } });
      state.estado.jugadores = { uuid: { nombre: "X" } };

      appState.resetForTests(state);

      expect(state.docente).toBeNull();
      expect(state.alumnos.size).toBe(0);
      expect(state.estado.fase).toBe("lobby");
    });
  });
});
