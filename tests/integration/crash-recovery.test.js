const { spawn } = require("child_process");
const path = require("path");
const WebSocket = require("ws");
const net = require("net");
const fs = require("fs");
const os = require("os");
const Database = require("better-sqlite3");

// ── Helpers ──────────────────────────────────────────────────────────────────

jest.setTimeout(120_000);

/**
 * Finds a free TCP port by binding to port 0 and releasing it.
 */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

/**
 * Waits until a TCP port is open (server ready).
 */
function waitForPort(port, host = "127.0.0.1", timeout = 15_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tryConnect() {
      if (Date.now() - start > timeout) {
        return reject(new Error(`Timeout (${timeout}ms) esperando puerto ${port}`));
      }
      const sock = new net.Socket();
      sock.setTimeout(1000);
      sock.on("connect", () => { sock.destroy(); resolve(); });
      sock.on("error", () => { sock.destroy(); setTimeout(tryConnect, 200); });
      sock.on("timeout", () => { sock.destroy(); setTimeout(tryConnect, 200); });
      sock.connect(port, host);
    }
    tryConnect();
  });
}

/**
 * Opens a WebSocket connection.
 */
function openWS(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

/**
 * Collects incoming JSON messages from a WebSocket into an array.
 */
function createCollector(ws) {
  const messages = [];
  ws.on("message", (raw) => {
    try { messages.push(JSON.parse(raw)); } catch { /* ignore non-JSON */ }
  });
  return messages;
}

/**
 * Waits for a message matching `predicate`. Throws on timeout.
 */
function waitFor(messages, predicate, timeout = 15_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      const found = messages.find(predicate);
      if (found) return resolve(found);
      if (Date.now() - start > timeout) {
        const recent = JSON.stringify(messages.slice(-10));
        return reject(new Error(`Timeout esperando mensaje. Últimos: ${recent}`));
      }
      setTimeout(check, 30);
    }
    check();
  });
}

/**
 * Waits for at least `count` messages matching `predicate`.
 */
function waitForCount(messages, predicate, count, timeout = 30_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      const found = messages.filter(predicate);
      if (found.length >= count) return resolve(found);
      if (Date.now() - start > timeout) {
        return reject(new Error(`Timeout esperando ${count} mensajes, tengo ${found.length}`));
      }
      setTimeout(check, 30);
    }
    check();
  });
}

/**
 * Kills a child process with SIGKILL, returns when dead.
 */
function killChild(child) {
  if (!child || child.killed) return Promise.resolve();
  return new Promise((resolve) => {
    const to = setTimeout(resolve, 3000);
    child.on("exit", () => { clearTimeout(to); resolve(); });
    try { child.kill("SIGKILL"); } catch { clearTimeout(to); resolve(); }
  });
}

/**
 * Opens a read-only connection to SQLite and reads the sesiones row.
 * The caller MUST close the returned Database handle.
 * @param {string} dbPath
 * @returns {object|null} The sesiones row, or null if no row exists.
 */
function readSesionRow(dbPath) {
  const conn = new Database(dbPath);
  conn.pragma("journal_mode = WAL");
  const row = conn.prepare("SELECT * FROM sesiones WHERE id = 1").get();
  conn.close();
  return row || null;
}

/**
 * Spawns a server child process with the given env vars.
 */
function spawnServer(port, snapshotPath, dbPath, adminToken) {
  const child = spawn(process.execPath, ["src/server/index.js"], {
    cwd: path.resolve(__dirname, "../.."),
    env: {
      ...process.env,
      PORT: String(port),
      HISTORIA_SNAPSHOT_PATH: snapshotPath,
      HISTORIA_DB_PATH: dbPath,
      HISTORIA_ADMIN_TOKEN: adminToken,
      NODE_ENV: "test",
      LOG_LEVEL: "fatal",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  child.stdout.on("data", (d) => { stdout += d.toString(); });
  child.stderr.on("data", (d) => { stdout += d.toString(); });

  child.on("exit", (code, signal) => {
    if (code !== null && code !== 0 && signal !== "SIGKILL") {
      console.error(`[spawnServer] child exited code=${code} signal=${signal}: ${stdout.slice(-500)}`);
    }
  });

  return child;
}

// ── The test ─────────────────────────────────────────────────────────────────

describe("SIGKILL crash recovery", () => {
  const ADMIN_TOKEN = "test-token-crash-recovery";
  let tmpDir;
  let snapshotPath;
  let dbPath;
  /** @type {import('child_process').ChildProcess[]} */
  const children = [];

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "historia-crash-"));
    snapshotPath = path.join(tmpDir, "estado-juego.json");
    dbPath = path.join(tmpDir, "historia-quiz.db");
  });

  afterEach(async () => {
    // Kill any remaining child processes from this test
    for (const child of children) {
      await killChild(child);
    }
    children.length = 0;
  });

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it("should recover game state from snapshot after SIGKILL and resume correctly", async () => {
    // ════════════════════════════════════════════════════════════════════════
    // Phase 1: First server — set up a game with 30 alumnos, start, respond, pause
    // ════════════════════════════════════════════════════════════════════════

    const port1 = await getFreePort();
    const child1 = spawnServer(port1, snapshotPath, dbPath, ADMIN_TOKEN);
    children.push(child1);
    await waitForPort(port1);

    const wsUrl1 = `ws://127.0.0.1:${port1}`;

    // 1a) Connect docente
    const docWs1 = await openWS(wsUrl1);
    const docenteMsgs1 = createCollector(docWs1);
    docWs1.send(JSON.stringify({ tipo: "docente_conecta", token: ADMIN_TOKEN }));
    await waitFor(docenteMsgs1, (m) => m.tipo === "estado_inicial");

    // 1b) Connect 30 alumnos with unique names
    const N = 30;
    const alumnos = [];
    for (let i = 0; i < N; i++) {
      const ws = await openWS(wsUrl1);
      const msgs = createCollector(ws);
      const nombre = `Alumno${String(i).padStart(2, "0")}`;
      ws.send(JSON.stringify({ tipo: "alumno_entra", nombre }));
      const bienvenido = await waitFor(msgs, (m) => m.tipo === "bienvenido");
      alumnos.push({ ws, msgs, nombre, id: bienvenido.id, token: bienvenido.token });
    }

    // 1c) Wait for the docente to see all 30 join
    await waitForCount(docenteMsgs1, (m) => m.tipo === "jugador_unido", N);

    // 1d) Start the game
    const TIEMPO = 30;
    docWs1.send(
      JSON.stringify({ tipo: "iniciar_juego", bancoId: "banco_1", tiempoPorPregunta: TIEMPO })
    );
    await waitFor(docenteMsgs1, (m) => m.tipo === "juego_reiniciado");

    // 1e) Wait for nueva_pregunta on all alumnos
    for (const a of alumnos) {
      await waitFor(a.msgs, (m) => m.tipo === "nueva_pregunta");
    }

    // 1f) First 10 respond with option 0, next 10 respond with option 1
    for (let i = 0; i < 10; i++) {
      alumnos[i].ws.send(JSON.stringify({ tipo: "respuesta", opcion: 0, token: alumnos[i].token }));
    }
    for (let i = 10; i < 20; i++) {
      alumnos[i].ws.send(JSON.stringify({ tipo: "respuesta", opcion: 1, token: alumnos[i].token }));
    }

    // 1g) Wait for docente to see 20 responses
    await waitFor(
      docenteMsgs1,
      (m) => m.tipo === "progreso_respuestas" && m.respondieron === 20
    );

    // 1h) Pause the game — guardarSnapshot persists pause + response state
    docWs1.send(JSON.stringify({ tipo: "alternar_pausa" }));
    await waitFor(docenteMsgs1, (m) => m.tipo === "juego_pausado");

    // ════════════════════════════════════════════════════════════════════════
    // Phase 2: Verify state is persisted in SQLite, then SIGKILL
    // ════════════════════════════════════════════════════════════════════════

    // Verify the sesiones row exists in SQLite before killing
    const sesRow = readSesionRow(dbPath);
    expect(sesRow).not.toBeNull();
    expect(sesRow.fase).toBe("pregunta");
    expect(sesRow.pausado).toBe(1);
    expect(sesRow.pregunta_idx).toBe(0);
    // Verify JSON columns parse correctly
    expect(JSON.parse(sesRow.jugadores)).toBeDefined();
    expect(JSON.parse(sesRow.respuestas_actuales)).toBeDefined();
    expect(JSON.parse(sesRow.preguntas_activas)).toBeDefined();

    await killChild(child1);

    // Close leftover WS (orphaned)
    try { docWs1.close(); } catch {}
    for (const a of alumnos) { try { a.ws.close(); } catch {} }

    // ════════════════════════════════════════════════════════════════════════
    // Phase 3: Second server — same snapshot path → should recover state
    // ════════════════════════════════════════════════════════════════════════

    const port2 = await getFreePort();
    const child2 = spawnServer(port2, snapshotPath, dbPath, ADMIN_TOKEN);
    children.push(child2);
    await waitForPort(port2);

    const wsUrl2 = `ws://127.0.0.1:${port2}`;

    // 3a) Connect docente — gets estado_inicial + partida_recuperada
    const docWs2 = await openWS(wsUrl2);
    const docenteMsgs2 = createCollector(docWs2);
    docWs2.send(JSON.stringify({ tipo: "docente_conecta", token: ADMIN_TOKEN }));

    const estadoInicial2 = await waitFor(
      docenteMsgs2,
      (m) => m.tipo === "estado_inicial"
    );
    const partidaRecuperada = await waitFor(
      docenteMsgs2,
      (m) => m.tipo === "partida_recuperada"
    );

    // 3b) Assert recovered state matches pre-crash

    // Fase debe ser "pregunta" (la partida estaba en curso)
    expect(estadoInicial2.fase).toBe("pregunta");

    // Debe estar pausado (pausamos antes del SIGKILL)
    expect(estadoInicial2.pausado).toBe(true);

    // Primera pregunta (preguntaIdx = 0)
    expect(estadoInicial2.pregunta).toBeTruthy();
    expect(estadoInicial2.pregunta.idx).toBe(0);

    // getRanking() devuelve max 20 jugadores; verificamos que están los 20
    // primeros (todos tienen puntaje 0, ordenados por id)
    expect(estadoInicial2.jugadores.length).toBeGreaterThanOrEqual(20);
    const nombres = estadoInicial2.jugadores.map((j) => j.nombre).sort();
    expect(nombres[0]).toBe("Alumno00");
    expect(nombres[nombres.length - 1]).toBe("Alumno19");

    // partida_recuperada NO pasa por getRanking, trae todos
    expect(partidaRecuperada.jugadores).toHaveLength(N);
    expect(partidaRecuperada.fase).toBe("pregunta");
    expect(partidaRecuperada.preguntaIdx).toBe(0);

    // 20 respuestas registradas
    expect(Object.keys(estadoInicial2.respuestasActuales || {})).toHaveLength(20);

    // 3c) Verify the recovered state is persisted in SQLite
    const sesRow2 = readSesionRow(dbPath);
    expect(sesRow2).not.toBeNull();
    expect(sesRow2.fase).toBe("pregunta");
    expect(sesRow2.pausado).toBe(1);
    expect(sesRow2.pregunta_idx).toBe(0);
    expect(Object.keys(JSON.parse(sesRow2.respuestas_actuales))).toHaveLength(20);
    expect(Object.keys(JSON.parse(sesRow2.jugadores))).toHaveLength(N);

    // ════════════════════════════════════════════════════════════════════════
    // Phase 4: Resume and continue — prove the game isn't stuck
    // ════════════════════════════════════════════════════════════════════════

    // 4a) Reanudar (acknowledge the recovered game)
    docWs2.send(JSON.stringify({ tipo: "recuperar_partida", accion: "reanudar" }));
    await waitFor(docenteMsgs2, (m) => m.tipo === "partida_reanudada");

    // 4b) Connect a new alumno (the broadcast pipe should still work)
    const alumnoRes = await openWS(wsUrl2);
    const alumnoResMsgs = createCollector(alumnoRes);
    alumnoRes.send(JSON.stringify({ tipo: "alumno_entra", nombre: "Reanudado1" }));
    await waitFor(alumnoResMsgs, (m) => m.tipo === "bienvenido");

    // 4c) Cerrar la ronda manualmente y avanzar a la siguiente pregunta —
    // la partida recuperada quedó PAUSADA en PREGUNTA, y siguiente() sólo
    // avanza desde RESULTADO (REQ-GF-01). Flujo real del docente:
    // mostrar_resultado_manual → resultado → siguiente_pregunta.
    docWs2.send(JSON.stringify({ tipo: "mostrar_resultado_manual" }));
    await waitFor(docenteMsgs2, (m) => m.tipo === "resultado");

    docWs2.send(JSON.stringify({ tipo: "siguiente_pregunta" }));

    // Docente receives nueva_pregunta for idx=1
    await waitFor(
      docenteMsgs2,
      (m) => m.tipo === "nueva_pregunta" && m.idx === 1
    );

    // Alumno also receives it
    const nuevaPregAlumno = await waitFor(
      alumnoResMsgs,
      (m) => m.tipo === "nueva_pregunta"
    );
    expect(nuevaPregAlumno.idx).toBe(1);
    expect(nuevaPregAlumno.pregunta).toBeTruthy();

    // 4d) Cleanup test connections
    try { docWs2.close(); } catch {}
    try { alumnoRes.close(); } catch {}
  });

  it("recovers an UNPAUSED mid-pregunta snapshot and restarts the round timer on reanudar (REQ-SP-08, REQ-WS-10)", async () => {
    const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "historia-crash-unpaused-"));
    const snap2 = path.join(tmpDir2, "estado-juego.json");
    const db2 = path.join(tmpDir2, "historia-quiz.db");
    try {
      // ════════════════════════════════════════════════════════════════════
      // Phase 1: server 1 — partida en PREGUNTA SIN pausar, SIGKILL
      // ════════════════════════════════════════════════════════════════════
      const portA = await getFreePort();
      const childA = spawnServer(portA, snap2, db2, ADMIN_TOKEN);
      children.push(childA);
      await waitForPort(portA);
      const urlA = `ws://127.0.0.1:${portA}`;

      const docA = await openWS(urlA);
      const docMsgsA = createCollector(docA);
      docA.send(JSON.stringify({ tipo: "docente_conecta", token: ADMIN_TOKEN }));
      await waitFor(docMsgsA, (m) => m.tipo === "estado_inicial");

      const aluA = await openWS(urlA);
      const aluMsgsA = createCollector(aluA);
      aluA.send(JSON.stringify({ tipo: "alumno_entra", nombre: "Sobreviviente1" }));
      await waitFor(aluMsgsA, (m) => m.tipo === "bienvenido");

      const TIEMPO = 10;
      docA.send(JSON.stringify({ tipo: "iniciar_juego", bancoId: "banco_1", tiempoPorPregunta: TIEMPO }));
      const npA = await waitFor(aluMsgsA, (m) => m.tipo === "nueva_pregunta");
      expect(npA.idx).toBe(0);
      expect(npA.epoca).toBeTruthy();

      // El snapshot persistido está en PREGUNTA y NO pausado (D2: no se
      // persiste remanente por tick → el timer reinicia desde el último
      // valor persistido, normalmente la duración completa).
      const sesRowA = readSesionRow(db2);
      expect(sesRowA).not.toBeNull();
      expect(sesRowA.fase).toBe("pregunta");
      expect(sesRowA.pausado).toBe(0);

      await killChild(childA);
      try { docA.close(); } catch {}
      try { aluA.close(); } catch {}

      // ════════════════════════════════════════════════════════════════════
      // Phase 2: server 2 — reanudar reinicia el timer y la ronda cierra
      // ════════════════════════════════════════════════════════════════════
      const portB = await getFreePort();
      const childB = spawnServer(portB, snap2, db2, ADMIN_TOKEN);
      children.push(childB);
      await waitForPort(portB);
      const urlB = `ws://127.0.0.1:${portB}`;

      const docB = await openWS(urlB);
      const docMsgsB = createCollector(docB);
      docB.send(JSON.stringify({ tipo: "docente_conecta", token: ADMIN_TOKEN }));
      const estadoB = await waitFor(docMsgsB, (m) => m.tipo === "estado_inicial");
      await waitFor(docMsgsB, (m) => m.tipo === "partida_recuperada");
      expect(estadoB.fase).toBe("pregunta");
      expect(estadoB.pausado).toBe(false);

      docB.send(JSON.stringify({ tipo: "recuperar_partida", accion: "reanudar" }));
      await waitFor(docMsgsB, (m) => m.tipo === "partida_reanudada");

      // REQ-WS-10: re-emisión con shape canónico (idx/epoca, sin nro)
      const npRec = await waitFor(docMsgsB, (m) => m.tipo === "nueva_pregunta");
      expect(npRec.idx).toBe(0);
      expect(npRec.epoca).toBeTruthy();
      expect(npRec).not.toHaveProperty("nro");

      // REQ-SP-08: el timer corre → ticks decrecientes
      const ticks = await waitForCount(docMsgsB, (m) => m.tipo === "tick", 3, 15_000);
      for (let i = 1; i < ticks.length; i++) {
        expect(ticks[i].tiempo).toBeLessThanOrEqual(ticks[i - 1].tiempo);
      }
      expect(ticks[0].tiempo).toBeLessThanOrEqual(TIEMPO);

      // La ronda cierra por expiración del timer
      const resB = await waitFor(docMsgsB, (m) => m.tipo === "resultado", 25_000);
      expect(resB.correcta).toBeGreaterThanOrEqual(0);

      try { docB.close(); } catch {}
    } finally {
      try { fs.rmSync(tmpDir2, { recursive: true, force: true }); } catch {}
    }
  });
});
