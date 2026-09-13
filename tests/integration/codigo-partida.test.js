const path = require("path");
const request = require("supertest");
const { resetTestDB } = require("../helpers/db");

const TMP_DB = path.join(__dirname, '..', '..', 'tmp-test-codigo-partida.db');
process.env.HISTORIA_DB_PATH = TMP_DB;

const server = require("../../src/server");
const {
  openWS,
  createCollector,
  waitFor,
  connectDocente,
  connectAlumno,
  closeWS
} = require("../helpers/ws-jest");

describe("Código de partida de 6 dígitos", () => {
  const ADMIN_TOKEN = "historia";
  let port;
  let wsUrl;

  beforeAll((done) => {
    server.resetForTests();
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

  it("el docente crea una partida y recibe un código de 6 dígitos", async () => {
    const docente = await connectDocente(wsUrl, ADMIN_TOKEN);
    docente.ws.send(JSON.stringify({ tipo: "crear_partida" }));

    const creada = await waitFor(docente.messages, (m) => m.tipo === "partida_creada");
    expect(creada.codigo).toMatch(/^\d{6}$/);
    expect(creada.codigo).not.toBe("000000");
    expect(creada.codigo).not.toBe("111111");

    await closeWS(docente.ws);
  });

  it("un alumno anónimo (sin autorización) no puede crear una partida", async () => {
    const ws = await openWS(wsUrl);
    const messages = createCollector(ws);
    ws.send(JSON.stringify({ tipo: "crear_partida" }));

    const error = await waitFor(messages, (m) => m.tipo === "error");
    expect(error.msg).toBe("No autorizado.");
    await closeWS(ws);
  });

  it("un alumno con el código correcto entra a la partida", async () => {
    const docente = await connectDocente(wsUrl, ADMIN_TOKEN);
    docente.ws.send(JSON.stringify({ tipo: "crear_partida" }));
    const { codigo } = await waitFor(docente.messages, (m) => m.tipo === "partida_creada");

    const ws = await openWS(wsUrl);
    const messages = createCollector(ws);
    ws.send(JSON.stringify({ tipo: "alumno_entra", nombre: "Lucía", codigo }));

    const bienvenido = await waitFor(messages, (m) => m.tipo === "bienvenido");
    expect(bienvenido.id).toBeTruthy();

    await closeWS(ws);
    await closeWS(docente.ws);
  });

  it("un alumno con un código incorrecto recibe codigo_invalido y no entra", async () => {
    const docente = await connectDocente(wsUrl, ADMIN_TOKEN);
    docente.ws.send(JSON.stringify({ tipo: "crear_partida" }));
    await waitFor(docente.messages, (m) => m.tipo === "partida_creada");

    const ws = await openWS(wsUrl);
    const messages = createCollector(ws);
    ws.send(JSON.stringify({ tipo: "alumno_entra", nombre: "Lucía", codigo: "999999" }));

    const rechazo = await waitFor(messages, (m) => m.tipo === "codigo_invalido");
    expect(rechazo.mensaje).toBe("Código de partida inválido o finalizado.");

    await closeWS(ws);
    await closeWS(docente.ws);
  });

  it("un alumno sin código recibe codigo_invalido si ya existe una partida creada", async () => {
    const docente = await connectDocente(wsUrl, ADMIN_TOKEN);
    docente.ws.send(JSON.stringify({ tipo: "crear_partida" }));
    await waitFor(docente.messages, (m) => m.tipo === "partida_creada");

    const ws = await openWS(wsUrl);
    const messages = createCollector(ws);
    ws.send(JSON.stringify({ tipo: "alumno_entra", nombre: "Lucía" }));

    const rechazo = await waitFor(messages, (m) => m.tipo === "codigo_invalido");
    expect(rechazo.mensaje).toBe("Código de partida inválido o finalizado.");

    await closeWS(ws);
    await closeWS(docente.ws);
  });

  it("sin partida creada (codigoPartida null), la entrada libre histórica sigue funcionando", async () => {
    // Compatibilidad hacia atrás: si el docente nunca usó crear_partida.
    const { ws, msg } = await connectAlumno(wsUrl, "Alumno Legacy");
    expect(msg.tipo).toBe("bienvenido");
    await closeWS(ws);
  });

  it("crear una partida nueva invalida el código anterior", async () => {
    const docente = await connectDocente(wsUrl, ADMIN_TOKEN);
    docente.ws.send(JSON.stringify({ tipo: "crear_partida" }));
    const primera = await waitFor(docente.messages, (m) => m.tipo === "partida_creada");

    docente.ws.send(JSON.stringify({ tipo: "crear_partida" }));
    await waitFor(docente.messages, (m) => m.tipo === "partida_creada" && m.codigo !== primera.codigo);

    const ws = await openWS(wsUrl);
    const messages = createCollector(ws);
    ws.send(JSON.stringify({ tipo: "alumno_entra", nombre: "Lucía", codigo: primera.codigo }));
    const rechazo = await waitFor(messages, (m) => m.tipo === "codigo_invalido");
    expect(rechazo.mensaje).toBe("Código de partida inválido o finalizado.");

    await closeWS(ws);
    await closeWS(docente.ws);
  });

  describe("selección automática de banco por curso (sección 13)", () => {
    it("crear_partida con curso mapeado resuelve el banco automáticamente", async () => {
      const bancoId = "banco_1";
      await request(server)
        .post("/api/curso-banco")
        .set("X-Admin-Token", ADMIN_TOKEN)
        .send({ curso: "1°", bancoId });

      const docente = await connectDocente(wsUrl, ADMIN_TOKEN);
      docente.ws.send(JSON.stringify({ tipo: "crear_partida", curso: "1°" }));
      const creada = await waitFor(docente.messages, (m) => m.tipo === "partida_creada");

      expect(creada.curso).toBe("1°");
      expect(creada.bancoIdSeleccionado).toBe(bancoId);
      expect(creada.avisoBanco).toBeUndefined();

      await closeWS(docente.ws);
    });

    it("crear_partida con curso sin mapear avisa pero igual crea la partida", async () => {
      const docente = await connectDocente(wsUrl, ADMIN_TOKEN);
      docente.ws.send(JSON.stringify({ tipo: "crear_partida", curso: "3°" }));
      const creada = await waitFor(docente.messages, (m) => m.tipo === "partida_creada");

      expect(creada.codigo).toMatch(/^\d{6}$/);
      expect(creada.bancoIdSeleccionado).toBeNull();
      expect(creada.avisoBanco).toMatch(/No hay un banco/);

      await closeWS(docente.ws);
    });

    it("iniciar_juego sin bancoId explícito usa el banco resuelto por curso", async () => {
      const bancoId = "banco_1";
      await request(server)
        .post("/api/curso-banco")
        .set("X-Admin-Token", ADMIN_TOKEN)
        .send({ curso: "1°", bancoId });

      const docente = await connectDocente(wsUrl, ADMIN_TOKEN);
      docente.ws.send(JSON.stringify({ tipo: "crear_partida", curso: "1°" }));
      const { codigo } = await waitFor(docente.messages, (m) => m.tipo === "partida_creada");

      const alumno = await openWS(wsUrl);
      const alumnoMsgs = createCollector(alumno);
      alumno.send(JSON.stringify({ tipo: "alumno_entra", nombre: "Lucía", codigo }));
      await waitFor(alumnoMsgs, (m) => m.tipo === "bienvenido");

      // Sin bancoId — sección 20: el docente no lo vuelve a elegir a mano.
      docente.ws.send(JSON.stringify({ tipo: "iniciar_juego" }));
      const iniciado = await waitFor(docente.messages, (m) => m.tipo === "juego_reiniciado");
      expect(iniciado.totalPreguntas).toBeGreaterThan(0);

      await closeWS(alumno);
      await closeWS(docente.ws);
    });

    it("iniciar_juego sin bancoId y sin curso mapeado devuelve error", async () => {
      const docente = await connectDocente(wsUrl, ADMIN_TOKEN);
      docente.ws.send(JSON.stringify({ tipo: "crear_partida" }));
      const { codigo } = await waitFor(docente.messages, (m) => m.tipo === "partida_creada");

      const alumno = await openWS(wsUrl);
      const alumnoMsgs = createCollector(alumno);
      alumno.send(JSON.stringify({ tipo: "alumno_entra", nombre: "Lucía", codigo }));
      await waitFor(alumnoMsgs, (m) => m.tipo === "bienvenido");

      docente.ws.send(JSON.stringify({ tipo: "iniciar_juego" }));
      const error = await waitFor(docente.messages, (m) => m.tipo === "error");
      expect(error.msg).toBe("Seleccioná un banco de preguntas.");

      await closeWS(alumno);
      await closeWS(docente.ws);
    });
  });
});
