// Tests for R3-003: alumno WS close mid-pregunta sin responder.
//
// El escenario: una pregunta está activa con N alumnos. Uno cierra su
// conexión sin haber respondido. El server debe:
//   1. Decrementar state.estado.totalJugadoresPregunta
//   2. Broadcast `progreso_respuestas { respondieron, total: N-1 }` al docente
//   3. Cuando los restantes respondan, `resultado` debe emitirse.
//
// Si el alumno que cierra SÍ había respondido (respondioActual === true),
// el total NO se decrementa — su respuesta ya contaba.

const http = require("http");
const path = require("path");
const { resetTestDB } = require("../helpers/db");

const TMP_DB = path.join(__dirname, "..", "..", "tmp-test-r3-003.db");
process.env.HISTORIA_DB_PATH = TMP_DB;

const server = require("../../src/server");

const {
  openWS,
  createCollector,
  waitFor,
  waitForNone,
  connectDocente,
  connectAlumno,
  closeWS
} = require("../helpers/ws-jest");

describe("R3-003: alumno close mid-pregunta sin responder", () => {
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

  it("decrementa totalJugadoresPregunta cuando un alumno cierra sin responder", async () => {
    const docente = await connectDocente(wsUrl);
    const a1 = await connectAlumno(wsUrl, "Pendiente1");
    const a2 = await connectAlumno(wsUrl, "Pendiente2");

    docente.ws.send(JSON.stringify({
      tipo: "iniciar_juego",
      bancoId: "banco_1",
      tiempoPorPregunta: 60
    }));
    await waitFor(a1.messages, (m) => m.tipo === "nueva_pregunta");
    await waitFor(a2.messages, (m) => m.tipo === "nueva_pregunta");

    // a1 cierra sin responder
    await closeWS(a1.ws);
    await waitFor(docente.messages, (m) => m.tipo === "jugador_desconectado");

    // El docente debe recibir un progreso_respuestas con total=1
    const progresoActualizado = await waitFor(
      docente.messages,
      (m) => m.tipo === "progreso_respuestas" && m.total === 1
    );
    expect(progresoActualizado.respondieron).toBe(0);

    // a2 responde — la ronda debe cerrar (resultado) ya que respondieron(1) === total(1)
    a2.ws.send(JSON.stringify({ tipo: "respuesta", opcion: 0 }));
    const ok = await waitFor(a2.messages, (m) => m.tipo === "respuesta_ok");
    expect(ok).toBeTruthy();
    const resultado = await waitFor(a2.messages, (m) => m.tipo === "resultado");
    expect(resultado.tipo).toBe("resultado");

    await closeWS(a2.ws);
    await closeWS(docente.ws);
  });

  it("NO decrementa totalJugadoresPregunta si el alumno que cierra YA respondió", async () => {
    const docente = await connectDocente(wsUrl);
    const a1 = await connectAlumno(wsUrl, "Respondedor1");
    const a2 = await connectAlumno(wsUrl, "Pendiente");

    docente.ws.send(JSON.stringify({
      tipo: "iniciar_juego",
      bancoId: "banco_1",
      tiempoPorPregunta: 60
    }));
    await waitFor(a1.messages, (m) => m.tipo === "nueva_pregunta");
    await waitFor(a2.messages, (m) => m.tipo === "nueva_pregunta");

    // a1 responde — eso dispara el primer progreso_respuestas { total: 2, respondieron: 1 }
    a1.ws.send(JSON.stringify({ tipo: "respuesta", opcion: 0 }));
    const primerProgreso = await waitFor(
      docente.messages,
      (m) => m.tipo === "progreso_respuestas" && m.total === 2
    );
    expect(primerProgreso.respondieron).toBe(1);

    // a1 cierra después de haber respondido
    await closeWS(a1.ws);
    await waitFor(docente.messages, (m) => m.tipo === "jugador_desconectado");

    // NO debe llegar un NUEVO progreso_respuestas con total=1 — el total se mantiene en 2
    // (la respuesta de a1 ya contaba y el decremento no debe ocurrir)
    const mensajesProgresoTrasDesconexion = docente.messages
      .slice(docente.messages.indexOf(primerProgreso) + 1)
      .filter((m) => m.tipo === "progreso_respuestas");
    expect(mensajesProgresoTrasDesconexion).toHaveLength(0);

    await closeWS(a2.ws);
    await closeWS(docente.ws);
  });

  // R3-003: si AMBOS alumnos cierran sin responder, total llega a 0.
  // El round debe cerrarse automáticamente (mostrarResultado), no quedar
  // zombie en fase PREGUNTA esperando el timer absoluto.
  it("cierra la ronda cuando todos los alumnos cierran sin responder (total=0)", async () => {
    const docente = await connectDocente(wsUrl);
    const a1 = await connectAlumno(wsUrl, "Zombie1");
    const a2 = await connectAlumno(wsUrl, "Zombie2");

    docente.ws.send(JSON.stringify({
      tipo: "iniciar_juego",
      bancoId: "banco_1",
      tiempoPorPregunta: 60
    }));
    await waitFor(a1.messages, (m) => m.tipo === "nueva_pregunta");
    await waitFor(a2.messages, (m) => m.tipo === "nueva_pregunta");

    // Ambos cierran sin responder
    await closeWS(a1.ws);
    await closeWS(a2.ws);

    // El docente debe recibir un progreso_respuestas con total=0
    // (después de a2 cerrar) y luego un `resultado` que cierra la ronda.
    const progresoFinal = await waitFor(
      docente.messages,
      (m) => m.tipo === "progreso_respuestas" && m.total === 0
    );
    expect(progresoFinal.respondieron).toBe(0);

    // La ronda debe haber cerrado — el docente recibe `resultado`,
    // no un zombie PREGUNTA esperando el timer.
    const resultado = await waitFor(
      docente.messages,
      (m) => m.tipo === "resultado"
    );
    expect(resultado.tipo).toBe("resultado");

    // Verificar que la fase pasó a RESULTADO, no quedó en PREGUNTA.
    const app = server.app;
    expect(app.state.estado.fase).toBe("resultado");
    // Timer cleared para no leakear el setTimeout del pregunta.
    expect(app.state.timer).toBeNull();

    await closeWS(docente.ws);
  });
});
