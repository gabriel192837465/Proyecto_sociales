<<<<<<< HEAD
const path = require("path");
const { resetTestDB } = require("../helpers/db");

const TMP_DB = path.join(__dirname, "..", "..", "tmp-test-db-unit.db");

describe("lib/db", () => {
  let db;

  beforeAll(() => {
    process.env.HISTORIA_DB_PATH = TMP_DB;
  });

  afterAll(() => {
    resetTestDB(TMP_DB);
    delete process.env.HISTORIA_DB_PATH;
  });

  beforeEach(() => {
    resetTestDB(TMP_DB);
    db = require("../../src/server/infra/db");
  });

  describe("cargarDB", () => {
    it("debería crear DB inicial desde default-bancos.json si no existe", () => {
      // TMP_DB no existe, cargarDB debería crearla y seedearla
      const result = db.cargarDB();
      expect(result).toHaveProperty("bancos");
      expect(Array.isArray(result.bancos)).toBe(true);
      expect(result.bancos.length).toBeGreaterThanOrEqual(2);
      expect(result.bancos[0]).toHaveProperty("preguntas");
      expect(Array.isArray(result.bancos[0].preguntas)).toBe(true);
      expect(result.bancos[0].preguntas.length).toBeGreaterThan(0);
    });

    it("debería retornar estructura idempotente en múltiples llamadas", () => {
      const primera = db.cargarDB();
      const segunda = db.cargarDB();
      expect(primera).toEqual(segunda);
    });

    it("debería re-sembrar si el archivo existe pero las tablas están vacías", () => {
      // Cargar una vez para crear el archivo y poblar
      db.cargarDB();
      // Simular una DB corrupta/vacía: vaciar las tablas pero dejar el archivo
      const Database = require("better-sqlite3");
      const raw = new Database(TMP_DB);
      raw.exec("DELETE FROM bancos; DELETE FROM preguntas;");
      raw.close();
      // Forzar al módulo a recargar
      jest.resetModules();
      const db2 = require("../../src/server/infra/db");
      const result = db2.cargarDB();
      expect(result.bancos.length).toBeGreaterThanOrEqual(2);
      expect(result.bancos[0].preguntas.length).toBeGreaterThan(0);
    });

    it("debería mantener datos persistentes entre cargas", () => {
      const data = db.cargarDB();
      const count = data.bancos.length;

      data.bancos.push({ id: "test_banco", nombre: "Test", preguntas: [] });
      db.guardarDB(data);

      const recargado = db.cargarDB();
      expect(recargado.bancos.length).toBe(count + 1);
    });
  });

  describe("guardarDB", () => {
    it("debería guardar y recuperar cambios en bancos", () => {
      const data = db.cargarDB();
      data.bancos.push({
        id: "test_nuevo",
        nombre: "Banco Test",
        nivel: "Primario",
        anio: "6°",
        tema: "Test",
        preguntas: [
          { id: "t1", pregunta: "¿Pregunta test?", opciones: ["A", "B", "C", "D"], correcta: 0, epoca: "Test" }
        ]
      });
      db.guardarDB(data);

      const recargado = db.cargarDB();
      const banco = recargado.bancos.find((b) => b.id === "test_nuevo");
      expect(banco).toBeDefined();
      expect(banco.nombre).toBe("Banco Test");
      expect(banco.preguntas.length).toBe(1);
      expect(banco.preguntas[0].pregunta).toBe("¿Pregunta test?");
      expect(banco.preguntas[0].opciones).toEqual(["A", "B", "C", "D"]);
    });

    it("debería lanzar error si data es null/undefined", () => {
      expect(() => db.guardarDB(null)).toThrow("guardarDB: data es null/undefined");
      expect(() => db.guardarDB(undefined)).toThrow("guardarDB: data es null/undefined");
    });

    it("debería reemplazar completamente los datos al guardar", () => {
      const data = db.cargarDB();
      data.bancos = [
        { id: "solo_uno", nombre: "Único", nivel: "", anio: "", tema: "", preguntas: [] }
      ];
      db.guardarDB(data);

      const recargado = db.cargarDB();
      expect(recargado.bancos.length).toBe(1);
      expect(recargado.bancos[0].id).toBe("solo_uno");
    });
  });

});
=======
const path = require("path");
const { resetTestDB } = require("../helpers/db");

const TMP_DB = path.join(__dirname, "..", "..", "tmp-test-db-unit.db");

describe("lib/db", () => {
  let db;

  beforeAll(() => {
    process.env.HISTORIA_DB_PATH = TMP_DB;
  });

  afterAll(() => {
    resetTestDB(TMP_DB);
    delete process.env.HISTORIA_DB_PATH;
  });

  beforeEach(() => {
    resetTestDB(TMP_DB);
    db = require("../../src/server/infra/db");
  });

  describe("cargarDB", () => {
    it("debería crear DB inicial desde default-bancos.json si no existe", () => {
      // TMP_DB no existe, cargarDB debería crearla y seedearla
      const result = db.cargarDB();
      expect(result).toHaveProperty("bancos");
      expect(Array.isArray(result.bancos)).toBe(true);
      expect(result.bancos.length).toBeGreaterThanOrEqual(2);
      expect(result.bancos[0]).toHaveProperty("preguntas");
      expect(Array.isArray(result.bancos[0].preguntas)).toBe(true);
      expect(result.bancos[0].preguntas.length).toBeGreaterThan(0);
    });

    it("debería retornar estructura idempotente en múltiples llamadas", () => {
      const primera = db.cargarDB();
      const segunda = db.cargarDB();
      expect(primera).toEqual(segunda);
    });

    it("debería re-sembrar si el archivo existe pero las tablas están vacías", () => {
      // Cargar una vez para crear el archivo y poblar
      db.cargarDB();
      // Simular una DB corrupta/vacía: vaciar las tablas pero dejar el archivo
      const Database = require("better-sqlite3");
      const raw = new Database(TMP_DB);
      raw.exec("DELETE FROM bancos; DELETE FROM preguntas;");
      raw.close();
      // Forzar al módulo a recargar
      jest.resetModules();
      const db2 = require("../../src/server/infra/db");
      const result = db2.cargarDB();
      expect(result.bancos.length).toBeGreaterThanOrEqual(2);
      expect(result.bancos[0].preguntas.length).toBeGreaterThan(0);
    });

    it("debería mantener datos persistentes entre cargas", () => {
      const data = db.cargarDB();
      const count = data.bancos.length;

      data.bancos.push({ id: "test_banco", nombre: "Test", preguntas: [] });
      db.guardarDB(data);

      const recargado = db.cargarDB();
      expect(recargado.bancos.length).toBe(count + 1);
    });
  });

  describe("guardarDB", () => {
    it("debería guardar y recuperar cambios en bancos", () => {
      const data = db.cargarDB();
      data.bancos.push({
        id: "test_nuevo",
        nombre: "Banco Test",
        nivel: "Primario",
        anio: "6°",
        tema: "Test",
        preguntas: [
          { id: "t1", pregunta: "¿Pregunta test?", opciones: ["A", "B", "C", "D"], correcta: 0, epoca: "Test" }
        ]
      });
      db.guardarDB(data);

      const recargado = db.cargarDB();
      const banco = recargado.bancos.find((b) => b.id === "test_nuevo");
      expect(banco).toBeDefined();
      expect(banco.nombre).toBe("Banco Test");
      expect(banco.preguntas.length).toBe(1);
      expect(banco.preguntas[0].pregunta).toBe("¿Pregunta test?");
      expect(banco.preguntas[0].opciones).toEqual(["A", "B", "C", "D"]);
    });

    it("debería lanzar error si data es null/undefined", () => {
      expect(() => db.guardarDB(null)).toThrow("guardarDB: data es null/undefined");
      expect(() => db.guardarDB(undefined)).toThrow("guardarDB: data es null/undefined");
    });

    it("debería reemplazar completamente los datos al guardar", () => {
      const data = db.cargarDB();
      data.bancos = [
        { id: "solo_uno", nombre: "Único", nivel: "", anio: "", tema: "", preguntas: [] }
      ];
      db.guardarDB(data);

      const recargado = db.cargarDB();
      expect(recargado.bancos.length).toBe(1);
      expect(recargado.bancos[0].id).toBe("solo_uno");
    });
  });

});
>>>>>>> origin/main
