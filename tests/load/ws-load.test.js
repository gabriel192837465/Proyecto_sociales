const path = require("path");
const { resetTestDB } = require("../helpers/db");

const TMP_DB = path.join(__dirname, "..", "..", "tmp-load.db");
const ADMIN_TOKEN = "historia";
const NUM_ALUMNOS = 50;

process.env.HISTORIA_DB_PATH = TMP_DB;

const server = require("../../src/server");
const { openWS, connectAlumno, createCollector, waitFor, closeWS } = require("../helpers/ws-jest");

function send(ws, msg) {
  ws.send(JSON.stringify(msg));
}

describe(`Test de carga — ${NUM_ALUMNOS} alumnos concurrentes`, () => {
  let port, wsUrl;

  beforeAll((done) => {
    server.resetForTests();
    const { guardarDB } = require("../../src/server/infra/db");
    guardarDB({
      bancos: [{
        id: "banco_carga",
        nombre: "Banco Carga",
        nivel: "Secundario",
        anio: "5°",
        tema: "Carga",
        preguntas: [
          { id: "c1", pregunta: "¿P1?", opciones: ["A", "B", "C", "D"], correcta: 0, epoca: "Carga" },
          { id: "c2", pregunta: "¿P2?", opciones: ["A", "B", "C", "D"], correcta: 0, epoca: "Carga" },
          { id: "c3", pregunta: "¿P3?", opciones: ["A", "B", "C", "D"], correcta: 0, epoca: "Carga" },
        ]
      }]
    });
    server.listen(0, "127.0.0.1", () => {
      port = server.address().port;
      wsUrl = `ws://127.0.0.1:${port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(() => {
      resetTestDB(TMP_DB);
      delete process.env.HISTORIA_DB_PATH;
      done();
    });
  });

  beforeEach(() => {
    server.resetForTests();
  });

  afterEach(() => {
    server.resetForTests();
  });

  it("debería soportar 35 alumnos respondiendo simultáneamente", async () => {
    // Memory baseline
    global.gc && global.gc();
    const heapBefore = process.memoryUsage().heapUsed;

    // 1. Conectar docente
    const docente = await openWS(wsUrl);
    const dMsgs = createCollector(docente);
    send(docente, { tipo: "docente_conecta", token: ADMIN_TOKEN });
    await waitFor(dMsgs, (m) => m.tipo === "estado_inicial");

    // 2. Conectar 35 alumnos
    const alumnos = [];
    for (let i = 0; i < NUM_ALUMNOS; i++) {
      const { ws, messages, msg: bienvenido } = await connectAlumno(wsUrl, `Alumno_${i}`);
      alumnos.push({ ws, msgs: messages, nombre: `Alumno_${i}`, id: bienvenido.id });
    }

    // 3. Verificar todos conectados
    for (let i = 0; i < NUM_ALUMNOS; i++) {
      await waitFor(dMsgs, (m) => m.tipo === "jugador_unido" && m.nombre === `Alumno_${i}`);
    }

    // 4. Iniciar juego — track tick latencies
    const tickTimestamps = [];
    const origFilter = dMsgs.filter.bind(dMsgs);
    const tickTracker = (msg) => {
      if (msg.tipo === "tick") tickTimestamps.push(Date.now());
    };
    docente.on("message", (raw) => {
      try { tickTracker(JSON.parse(raw)); } catch {}
    });

    const inicio = Date.now();
    send(docente, { tipo: "iniciar_juego", bancoId: "banco_carga", tiempoPorPregunta: 60 });
    await waitFor(dMsgs, (m) => m.tipo === "juego_reiniciado");

    // 5. Jugar 3 preguntas
    for (let q = 0; q < 3; q++) {
      await waitFor(dMsgs, (m) => m.tipo === "nueva_pregunta" && m.idx === q);

      alumnos.forEach(a => send(a.ws, { tipo: "respuesta", opcion: 0 }));

      await Promise.all(
        alumnos.map(a => waitFor(a.msgs, (m) => m.tipo === "respuesta_ok"))
      );
      await Promise.all(
        alumnos.map(a => waitFor(a.msgs, (m) => m.tipo === "resultado"))
      );

      if (q < 2) {
        send(docente, { tipo: "siguiente_pregunta" });
      }
    }

    // 6. Finalizar
    send(docente, { tipo: "siguiente_pregunta" });
    await waitFor(dMsgs, (m) => m.tipo === "fin_juego");

    const duracion = Date.now() - inicio;

    await Promise.all(
      alumnos.map(a => waitFor(a.msgs, (m) => m.tipo === "fin_juego"))
    );

    // Verificar métricas funcionales
    const progresos = dMsgs.filter(m => m.tipo === "progreso_respuestas");
    expect(progresos.length).toBe(NUM_ALUMNOS * 3);
    expect(progresos.filter(m => m.respondieron === NUM_ALUMNOS).length).toBe(3);

    // === Performance assertions ===

    // Total duration: < 30s for 50 students × 3 questions
    console.log(`\n✅ ${NUM_ALUMNOS} alumnos completaron 3 preguntas en ${duracion}ms`);
    expect(duracion).toBeLessThan(30_000);

    // Memory growth: < 50MB
    global.gc && global.gc();
    const heapAfter = process.memoryUsage().heapUsed;
    const heapGrowthMB = (heapAfter - heapBefore) / (1024 * 1024);
    console.log(`   Heap growth: ${heapGrowthMB.toFixed(2)} MB`);
    expect(heapGrowthMB).toBeLessThan(50);

    // Tick latency p95: < 500ms (only if we got enough ticks)
    if (tickTimestamps.length >= 2) {
      const deltas = [];
      for (let i = 1; i < tickTimestamps.length; i++) {
        deltas.push(tickTimestamps[i] - tickTimestamps[i - 1]);
      }
      deltas.sort((a, b) => a - b);
      const p95idx = Math.floor(deltas.length * 0.95);
      const p95 = deltas[p95idx] || deltas[deltas.length - 1];
      console.log(`   Tick p95 latency: ${p95}ms (${deltas.length} intervals)`);
      expect(p95).toBeLessThan(500);
    }

    await Promise.all(alumnos.map(a => closeWS(a.ws)));
    await closeWS(docente);
  }, 120000);
});
