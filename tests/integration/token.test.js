<<<<<<< HEAD
const path = require("path");
const { resetTestDB } = require("../helpers/db");

const TMP_DB = path.join(__dirname, '..', '..', 'tmp-test-token.db');
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

describe("R1-001: Alumno Secondary Token Validation and Rotation", () => {
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

  it("debería rechazar un mensaje que no sea alumno_entra si no tiene token o si el token es stale", async () => {
    const docente = await connectDocente(wsUrl, ADMIN_TOKEN);
    const alumno = await connectAlumno(wsUrl, "Pedro");
    const id = alumno.msg.id;
    const tokenOriginal = alumno.msg.token;
    expect(tokenOriginal).toBeTruthy();

    docente.ws.send(JSON.stringify({ tipo: "iniciar_juego", bancoId: "banco_1", tiempoPorPregunta: 30 }));
    await waitFor(docente.messages, (m) => m.tipo === "juego_reiniciado");
    await waitFor(alumno.messages, (m) => m.tipo === "nueva_pregunta");

    alumno.ws.send(JSON.stringify({
      tipo: "respuesta",
      opcion: 0,
      token: "un-token-incorrecto"
    }));

    const rechazo = await waitFor(alumno.messages, (m) => m.tipo === "auth_rechazada");
    expect(rechazo.razon).toBe("token_invalido");
    expect(rechazo.token).toBeUndefined();

    // Since we don't get a new token, we can't retry successfully.
    // The connection will be closed or we'll just not get the progresso.
    // The original test sent the new token and checked progress, but now we can't.
    // So we just verify we were rejected.

    await closeWS(alumno.ws);
    await closeWS(docente.ws);
  });

  it("debería rotar el token en el límite de la pregunta y enviar el nuevo token al alumno", async () => {
    const docente = await connectDocente(wsUrl, ADMIN_TOKEN);
    const alumno = await connectAlumno(wsUrl, "Pedro");
    const id = alumno.msg.id;
    const tokenOriginal = alumno.msg.token;
    expect(tokenOriginal).toBeTruthy();

    docente.ws.send(JSON.stringify({ tipo: "iniciar_juego", bancoId: "banco_1", tiempoPorPregunta: 30 }));
    await waitFor(docente.messages, (m) => m.tipo === "juego_reiniciado");
    const np1 = await waitFor(alumno.messages, (m) => m.tipo === "nueva_pregunta");
    expect(np1.tokensPorAlumno).toBeDefined();
    expect(np1.tokensPorAlumno[id]).toBe(tokenOriginal);

    alumno.ws.send(JSON.stringify({
      tipo: "respuesta",
      opcion: 0,
      token: tokenOriginal
    }));
    await waitFor(docente.messages, (m) => m.tipo === "progreso_respuestas" && m.respondieron === 1);

    docente.ws.send(JSON.stringify({ tipo: "siguiente_pregunta" }));
    
    const np2 = await waitFor(alumno.messages, (m) => m.tipo === "nueva_pregunta" && m.idx === 1);
    expect(np2.tokensPorAlumno).toBeDefined();
    const tokenRotated = np2.tokensPorAlumno[id];
    expect(tokenRotated).toBeTruthy();
    expect(tokenRotated).not.toBe(tokenOriginal);

    alumno.ws.send(JSON.stringify({
      tipo: "respuesta",
      opcion: 1,
      token: tokenOriginal
    }));
    const rechazo = await waitFor(alumno.messages, (m) => m.tipo === "auth_rechazada");
    expect(rechazo.razon).toBe("token_invalido");

    alumno.ws.send(JSON.stringify({
      tipo: "respuesta",
      opcion: 1,
      token: tokenRotated
    }));
    const progreso = await waitFor(docente.messages, (m) => m.tipo === "progreso_respuestas" && m.respondieron === 1);
    expect(progreso.respondieron).toBe(1);

    await closeWS(alumno.ws);
    await closeWS(docente.ws);
  });
});
=======
const path = require("path");
const { resetTestDB } = require("../helpers/db");

const TMP_DB = path.join(__dirname, '..', '..', 'tmp-test-token.db');
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

describe("R1-001: Alumno Secondary Token Validation and Rotation", () => {
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

  it("debería rechazar un mensaje que no sea alumno_entra si no tiene token o si el token es stale", async () => {
    const docente = await connectDocente(wsUrl, ADMIN_TOKEN);
    const alumno = await connectAlumno(wsUrl, "Pedro");
    const id = alumno.msg.id;
    const tokenOriginal = alumno.msg.token;
    expect(tokenOriginal).toBeTruthy();

    docente.ws.send(JSON.stringify({ tipo: "iniciar_juego", bancoId: "banco_1", tiempoPorPregunta: 30 }));
    await waitFor(docente.messages, (m) => m.tipo === "juego_reiniciado");
    await waitFor(alumno.messages, (m) => m.tipo === "nueva_pregunta");

    alumno.ws.send(JSON.stringify({
      tipo: "respuesta",
      opcion: 0,
      token: "un-token-incorrecto"
    }));

    const rechazo = await waitFor(alumno.messages, (m) => m.tipo === "auth_rechazada");
    expect(rechazo.razon).toBe("token_invalido");
    expect(rechazo.token).toBeUndefined();

    // Since we don't get a new token, we can't retry successfully.
    // The connection will be closed or we'll just not get the progresso.
    // The original test sent the new token and checked progress, but now we can't.
    // So we just verify we were rejected.

    await closeWS(alumno.ws);
    await closeWS(docente.ws);
  });

  it("debería rotar el token en el límite de la pregunta y enviar el nuevo token al alumno", async () => {
    const docente = await connectDocente(wsUrl, ADMIN_TOKEN);
    const alumno = await connectAlumno(wsUrl, "Pedro");
    const id = alumno.msg.id;
    const tokenOriginal = alumno.msg.token;
    expect(tokenOriginal).toBeTruthy();

    docente.ws.send(JSON.stringify({ tipo: "iniciar_juego", bancoId: "banco_1", tiempoPorPregunta: 30 }));
    await waitFor(docente.messages, (m) => m.tipo === "juego_reiniciado");
    const np1 = await waitFor(alumno.messages, (m) => m.tipo === "nueva_pregunta");
    expect(np1.tokensPorAlumno).toBeDefined();
    expect(np1.tokensPorAlumno[id]).toBe(tokenOriginal);

    alumno.ws.send(JSON.stringify({
      tipo: "respuesta",
      opcion: 0,
      token: tokenOriginal
    }));
    await waitFor(docente.messages, (m) => m.tipo === "progreso_respuestas" && m.respondieron === 1);

    docente.ws.send(JSON.stringify({ tipo: "siguiente_pregunta" }));
    
    const np2 = await waitFor(alumno.messages, (m) => m.tipo === "nueva_pregunta" && m.idx === 1);
    expect(np2.tokensPorAlumno).toBeDefined();
    const tokenRotated = np2.tokensPorAlumno[id];
    expect(tokenRotated).toBeTruthy();
    expect(tokenRotated).not.toBe(tokenOriginal);

    alumno.ws.send(JSON.stringify({
      tipo: "respuesta",
      opcion: 1,
      token: tokenOriginal
    }));
    const rechazo = await waitFor(alumno.messages, (m) => m.tipo === "auth_rechazada");
    expect(rechazo.razon).toBe("token_invalido");

    alumno.ws.send(JSON.stringify({
      tipo: "respuesta",
      opcion: 1,
      token: tokenRotated
    }));
    const progreso = await waitFor(docente.messages, (m) => m.tipo === "progreso_respuestas" && m.respondieron === 1);
    expect(progreso.respondieron).toBe(1);

    await closeWS(alumno.ws);
    await closeWS(docente.ws);
  });
});
>>>>>>> origin/main
