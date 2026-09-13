const fs = require("fs");
const os = require("os");
const path = require("path");
const { resetTestDB } = require("../helpers/db");

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "historia-db-sesiones-"));
const TMP_DB = path.join(TMP_DIR, "historia-quiz.db");

describe("infra/db — sesiones (cargarEstado, guardarEstado, clearSesion)", () => {
  let db;

  beforeAll(() => {
    process.env.HISTORIA_DB_PATH = TMP_DB;
  });

  afterAll(() => {
    try {
      const { closeDB } = require("../../src/server/infra/db");
      closeDB();
    } catch { /* ignore */ }
    delete process.env.HISTORIA_DB_PATH;
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    resetTestDB(TMP_DB);
    db = require("../../src/server/infra/db");
  });

  function createCompleteState(overrides = {}) {
    return {
      fase: "pregunta",
      preguntaIdx: 3,
      tiempoRestante: 15,
      tiempoPorPregunta: 20,
      pausado: false,
      totalJugadoresPregunta: 4,
      jugadores: {
        uuid1: { nombre: "Ana", puntaje: 100, puntajeGeneral: 500, online: true },
        uuid2: { nombre: "Bob", puntaje: 50, puntajeGeneral: 300, online: false },
      },
      respuestasActuales: { uuid1: 0, uuid2: 2 },
      preguntasActivas: [
        { pregunta: "¿P1?", opciones: ["A", "B", "C", "D"], correcta: 0 },
        { pregunta: "¿P2?", opciones: ["A", "B", "C", "D"], correcta: 1 },
      ],
      ...overrides,
    };
  }

  // ── 3.1: Round-trip ────────────────────────────────────────────────────

  describe("cargarEstado / guardarEstado round-trip (REQ-SP-01, REQ-SP-02)", () => {
    it("debería devolver null si no hay fila en sesiones", () => {
      expect(db.cargarEstado()).toBeNull();
    });

    it("debería persistir y recuperar todos los campos del estado", () => {
      const estado = createCompleteState();
      db.guardarEstado(estado);

      const loaded = db.cargarEstado();
      expect(loaded).not.toBeNull();
      expect(loaded.fase).toBe("pregunta");
      expect(loaded.preguntaIdx).toBe(3);
      expect(loaded.tiempoRestante).toBe(15);
      expect(loaded.tiempoPorPregunta).toBe(20);
      expect(loaded.pausado).toBe(false);
      expect(loaded.totalJugadoresPregunta).toBe(4);
      expect(loaded.jugadores).toEqual(estado.jugadores);
      expect(loaded.respuestasActuales).toEqual(estado.respuestasActuales);
      expect(loaded.preguntasActivas).toEqual(estado.preguntasActivas);
    });

    it("debería hacer round-trip de pausado=true (REQ-SP-02 booleano)", () => {
      db.guardarEstado(createCompleteState({ pausado: true }));
      expect(db.cargarEstado().pausado).toBe(true);
    });

    it("debería hacer round-trip de pausado=false", () => {
      db.guardarEstado(createCompleteState({ pausado: false }));
      expect(db.cargarEstado().pausado).toBe(false);
    });

    it("debería manejar JSON profundo en jugadores", () => {
      const estado = createCompleteState({
        jugadores: { deep: { nombre: "Deep", nested: { arr: [1, 2, 3] } } },
      });
      db.guardarEstado(estado);
      expect(db.cargarEstado().jugadores).toEqual(estado.jugadores);
    });

    it("debería manejar respuestasActuales vacío", () => {
      db.guardarEstado(createCompleteState({ respuestasActuales: {} }));
      expect(db.cargarEstado().respuestasActuales).toEqual({});
    });
  });

  // ── 3.3: clearSesion ───────────────────────────────────────────────────

  describe("clearSesion (REQ-SP-03)", () => {
    it("debería limpiar la sesión y cargarEstado devolver null", () => {
      db.guardarEstado(createCompleteState());
      expect(db.cargarEstado()).not.toBeNull();

      db.clearSesion();
      expect(db.cargarEstado()).toBeNull();
    });

    it("no debería tirar error si no hay sesión", () => {
      expect(() => db.clearSesion()).not.toThrow();
    });
  });

  // ── codigoPartida round-trip ────────────────────────────────────────────

  describe("codigoPartida round-trip (código de partida de 6 dígitos)", () => {
    it("debería persistir y recuperar codigoPartida", () => {
      db.guardarEstado(createCompleteState({ codigoPartida: "482731" }));
      expect(db.cargarEstado().codigoPartida).toBe("482731");
    });

    it("debería devolver null si el estado nunca tuvo codigoPartida (compatibilidad)", () => {
      const estado = createCompleteState();
      delete estado.codigoPartida;
      db.guardarEstado(estado);
      expect(db.cargarEstado().codigoPartida).toBeNull();
    });

    it("migra una base preexistente (tabla sesiones sin la columna codigo_partida) sin fallar", () => {
      // Simula una DB creada antes de esta feature: crea el archivo con el
      // schema viejo (sin codigo_partida) usando una conexión aparte, y
      // luego confirma que _initDB() la migra de forma aditiva al abrirla.
      const { closeDB } = db;
      closeDB();

      const migTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "historia-db-migracion-"));
      const migDbPath = path.join(migTmpDir, "historia-quiz.db");
      const Database = require("better-sqlite3");
      const rawDb = new Database(migDbPath);
      rawDb.exec(`
        CREATE TABLE sesiones (
          id INTEGER PRIMARY KEY,
          fase TEXT NOT NULL,
          pregunta_idx INTEGER NOT NULL,
          tiempo_restante INTEGER NOT NULL,
          tiempo_por_pregunta INTEGER NOT NULL,
          pausado INTEGER NOT NULL,
          total_jugadores_pregunta INTEGER NOT NULL,
          jugadores TEXT NOT NULL,
          respuestas_actuales TEXT NOT NULL,
          preguntas_activas TEXT NOT NULL
        );
      `);
      rawDb.close();

      process.env.HISTORIA_DB_PATH = migDbPath;
      jest.resetModules();
      const dbMigrado = require("../../src/server/infra/db");
      expect(() => dbMigrado.guardarEstado(createCompleteState({ codigoPartida: "123456" }))).not.toThrow();
      expect(dbMigrado.cargarEstado().codigoPartida).toBe("123456");

      dbMigrado.closeDB();
      process.env.HISTORIA_DB_PATH = TMP_DB;
      fs.rmSync(migTmpDir, { recursive: true, force: true });
    });
  });

  // ── guardarEstado validación ────────────────────────────────────────────

  describe("guardarEstado validación", () => {
    it("debería lanzar error si estado es null/undefined", () => {
      expect(() => db.guardarEstado(null)).toThrow("guardarEstado: estado es null/undefined");
      expect(() => db.guardarEstado(undefined)).toThrow("guardarEstado: estado es null/undefined");
    });
  });

  // ── 3.5: Back-to-back writes ───────────────────────────────────────────

  describe("back-to-back writes (REQ-SP-05 — concurrent-safety)", () => {
    it("la segunda escritura debería ganar (fase diferente)", () => {
      db.guardarEstado(createCompleteState({ fase: "lobby", preguntaIdx: -1 }));
      db.guardarEstado(createCompleteState({ fase: "resultado", preguntaIdx: 5 }));

      const loaded = db.cargarEstado();
      expect(loaded.fase).toBe("resultado");
      expect(loaded.preguntaIdx).toBe(5);
    });

    it("la segunda escritura debería reemplazar completamente los datos", () => {
      const stateA = createCompleteState({
        jugadores: { solo: { nombre: "Solo" } },
        respuestasActuales: { solo: 0 },
      });
      const stateB = createCompleteState({
        jugadores: { otro: { nombre: "Otro" } },
        respuestasActuales: { otro: 1 },
        preguntasActivas: [{ pregunta: "¿Nueva?", opciones: ["A", "B"], correcta: 0 }],
      });

      db.guardarEstado(stateA);
      db.guardarEstado(stateB);

      const loaded = db.cargarEstado();
      expect(loaded.jugadores).toEqual(stateB.jugadores);
      expect(loaded.respuestasActuales).toEqual(stateB.respuestasActuales);
      expect(loaded.preguntasActivas).toEqual(stateB.preguntasActivas);
      expect(loaded.fase).toBe(stateB.fase);
    });
  });
});
