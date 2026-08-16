const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const { resetTestDB } = require("../helpers/db");

const TMP_DB = path.join(__dirname, '..', '..', 'tmp-test-ws.db');
process.env.HISTORIA_DB_PATH = TMP_DB;

const server = require("../../src/server");
const config = require("../../src/server/config");
const { signId } = require("../../src/server/infra/security");

function preguntasBanco(bancoId) {
  const { bancos } = require("../../src/server/infra/default-bancos.json");
  return bancos.find((b) => b.id === bancoId).preguntas;
}
const {
  openWS,
  createCollector,
  waitFor,
  waitForNone,
  waitForCount,
  connectDocente,
  connectAlumno,
  closeWS
} = require("../helpers/ws-jest");

describe("WebSocket — flujo del juego", () => {
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

  describe("autenticación del docente", () => {
    it("debería aceptar token válido y enviar estado inicial", async () => {
      const { ws, msg } = await connectDocente(wsUrl, ADMIN_TOKEN);
      expect(msg.tipo).toBe("estado_inicial");
      expect(msg.fase).toBe("lobby");
      expect(msg).toHaveProperty("serverIP");
      await closeWS(ws);
    });

    it("debería rechazar token inválido y cerrar la conexión", async () => {
      const ws = await openWS(wsUrl);
      const messages = createCollector(ws);
      const closePromise = new Promise((resolve) => ws.once("close", resolve));
      ws.send(JSON.stringify({ tipo: "docente_conecta", token: "clave-incorrecta" }));

      const error = await waitFor(messages, (m) => m.tipo === "error");
      expect(error.msg).toBe("Clave de docente incorrecta.");

      await Promise.race([closePromise, new Promise((resolve) => setTimeout(resolve, 1000))]);
      expect([WebSocket.CLOSING, WebSocket.CLOSED]).toContain(ws.readyState);
      await closeWS(ws);
    });
  });

  describe("lobby y conexión de alumnos", () => {
    it("debería registrar un alumno nuevo y notificar al docente", async () => {
      const docente = await connectDocente(wsUrl);
      const alumno = await connectAlumno(wsUrl, "Ana Test");

      expect(alumno.msg.reconectado).toBe(false);
      expect(alumno.msg.id).toBeTruthy();

      const unido = await waitFor(docente.messages, (m) => m.tipo === "jugador_unido" && m.nombre === "Ana Test");
      expect(unido.jugadores).toEqual(expect.arrayContaining([
        expect.objectContaining({ nombre: "Ana Test" })
      ]));

      await closeWS(alumno.ws);
      await closeWS(docente.ws);
    });

    it("debería rechazar un alumno nuevo si ya hay un jugador online con nombre duplicado (insensible a mayúsculas/minúsculas)", async () => {
      const docente = await connectDocente(wsUrl);
      const alumno1 = await connectAlumno(wsUrl, "Maxi");

      const alumno2ws = await openWS(wsUrl);
      const alumno2messages = createCollector(alumno2ws);
      alumno2ws.send(JSON.stringify({ tipo: "alumno_entra", nombre: "maxi" }));

      const err = await waitFor(alumno2messages, (m) => m.tipo === "error_nombre");
      expect(err.msg).toContain("ya está en uso");

      await closeWS(alumno1.ws);
      await closeWS(alumno2ws);
      await closeWS(docente.ws);
    });
  });

  describe("REQ-WS-09 — cookie path (dispatcher)", () => {
    it("join sin id: bienvenido.id === cookieId generada por el helper", async () => {
      const docente = await connectDocente(wsUrl);
      const alumno = await connectAlumno(wsUrl, "CookieAna");

      expect(alumno.cookieId).toBeTruthy();
      expect(alumno.msg.id).toBe(alumno.cookieId);

      await closeWS(alumno.ws);
      await closeWS(docente.ws);
    });

    it("misma cookie + mismo nombre: reconectado=true, mismo id, sin error_nombre", async () => {
      const docente = await connectDocente(wsUrl);
      const alumno = await connectAlumno(wsUrl, "CookieRecon");
      const cookieId = alumno.cookieId;

      await closeWS(alumno.ws);
      await waitFor(docente.messages, (m) => m.tipo === "jugador_desconectado" && m.nombre === "CookieRecon");

      const recon = await connectAlumno(wsUrl, "CookieRecon", null, { cookie: cookieId });
      expect(recon.msg.reconectado).toBe(true);
      expect(recon.msg.id).toBe(cookieId);
      await waitForNone(recon.messages, (m) => m.tipo === "error_nombre");

      await closeWS(recon.ws);
      await closeWS(docente.ws);
    });
  });

  describe("R4-002: cierre tardío de socket stale post-reconnect", () => {
    it("el close del socket VIEJO después de reconectar NO saca al alumno del juego", async () => {
      const docente = await connectDocente(wsUrl);
      const a1 = await connectAlumno(wsUrl, "StaleA");
      const b1 = await connectAlumno(wsUrl, "StaleB");
      const cookieB = b1.cookieId;

      docente.ws.send(JSON.stringify({ tipo: "iniciar_juego", bancoId: "banco_1", tiempoPorPregunta: 60 }));
      await waitFor(a1.messages, (m) => m.tipo === "nueva_pregunta");
      await waitFor(b1.messages, (m) => m.tipo === "nueva_pregunta");

      // B se cae (socket viejo queda zombie OPEN hasta el heartbeat) y
      // reconecta con socket nuevo — D1: mismo id de cookie.
      const b2 = await connectAlumno(wsUrl, "StaleB", null, { cookie: cookieB });
      expect(b2.msg.reconectado).toBe(true);
      expect(b2.msg.id).toBe(b1.msg.id);

      // El cierre tardío del socket viejo NO debe marcar offline a B ni
      // decrementar el total — el alumno VIVO está en el socket nuevo.
      await closeWS(b1.ws);
      await waitForNone(docente.messages, (m) => m.tipo === "jugador_desconectado" && m.id === b1.msg.id);

      const app = server.app;
      expect(app.state.estado.jugadores[b1.msg.id].online).toBe(true);
      expect(app.state.estado.totalJugadoresPregunta).toBe(2);

      // B (socket nuevo) sigue jugando: a1 y b2 responden → ronda cierra con total 2
      a1.ws.send(JSON.stringify({ tipo: "respuesta", opcion: 0 }));
      const prog1 = await waitFor(docente.messages, (m) => m.tipo === "progreso_respuestas" && m.respondieron === 1);
      expect(prog1.total).toBe(2);

      b2.ws.send(JSON.stringify({ tipo: "respuesta", opcion: 1 }));
      const resultado = await waitFor(b2.messages, (m) => m.tipo === "resultado");
      expect(resultado.tipo).toBe("resultado");

      await closeWS(b2.ws);
      await closeWS(a1.ws);
      await closeWS(docente.ws);
    });

    it("el close legítimo del socket VIGENTE sigue marcando offline y decrementando (comportamiento preservado)", async () => {
      const docente = await connectDocente(wsUrl);
      const a1 = await connectAlumno(wsUrl, "LegitA");
      const a2 = await connectAlumno(wsUrl, "LegitClose");

      docente.ws.send(JSON.stringify({ tipo: "iniciar_juego", bancoId: "banco_1", tiempoPorPregunta: 60 }));
      await waitFor(a1.messages, (m) => m.tipo === "nueva_pregunta");
      await waitFor(a2.messages, (m) => m.tipo === "nueva_pregunta");

      // a2 cierra siendo el socket vigente: offline + decremento 2 → 1
      await closeWS(a2.ws);
      await waitFor(docente.messages, (m) => m.tipo === "jugador_desconectado" && m.nombre === "LegitClose");

      const app = server.app;
      expect(app.state.estado.jugadores[a2.msg.id].online).toBe(false);
      expect(app.state.estado.totalJugadoresPregunta).toBe(1);

      await closeWS(a1.ws);
      await closeWS(docente.ws);
    });
  });

  describe("security: token fresco ligado a la cookie del socket (gatekeeper fix)", () => {
    it("socket raw sin cookie presentando id+nombre ajeno → auth_rechazada SIN token y SIN kick de la víctima", async () => {
      const docente = await connectDocente(wsUrl);
      const victima = await connectAlumno(wsUrl, "VictimaLig");
      const idVictima = victima.msg.id;
      const tokenVictima = victima.msg.token;
      expect(tokenVictima).toBeTruthy();

      // Atacante: WS crudo (sin cookie), conoce id+nombre de la víctima
      const atacante = await openWS(wsUrl);
      const msgsAtacante = createCollector(atacante);
      atacante.send(JSON.stringify({
        tipo: "alumno_entra",
        nombre: "VictimaLig",
        id: idVictima,
        token: "token-incorrecto",
      }));

      const rechazo = await waitFor(msgsAtacante, (m) => m.tipo === "auth_rechazada");
      expect(rechazo.razon).toBe("token_rotado");
      // Rechazo muerto: sin token fresco para quien no viene ligado a la cookie
      expect(rechazo).not.toHaveProperty("token");

      // La víctima NO fue kickeada: su token sigue válido y puede reconectar
      const recon = await connectAlumno(wsUrl, "VictimaLig", null, { cookie: idVictima });
      expect(recon.msg.reconectado).toBe(true);
      expect(recon.msg.id).toBe(idVictima);

      await closeWS(atacante);
      await closeWS(recon.ws);
      await closeWS(victima.ws);
      await closeWS(docente.ws);
    });

    it("cookie no-UUID no se asigna como identidad (bienvenido normal, sin crash)", async () => {
      const docente = await connectDocente(wsUrl);
      const ws = new WebSocket(wsUrl, { headers: { cookie: "historia_quiz_id=__proto__" } });
      await new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
      const msgs = createCollector(ws);
      ws.send(JSON.stringify({ tipo: "alumno_entra", nombre: "CookieNoUuid" }));

      const bienvenido = await waitFor(msgs, (m) => m.tipo === "bienvenido");
      expect(bienvenido.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(bienvenido.id).not.toBe("__proto__");

      await closeWS(ws);
      await closeWS(docente.ws);
    });

    it("cookie legítima FIRMADA (ws.alumnoId === id) con token stale → auth_rechazada CON token fresco", async () => {
      const docente = await connectDocente(wsUrl);
      const alumno = await connectAlumno(wsUrl, "LigadaOk");
      const id = alumno.msg.id;

      const recon = new WebSocket(wsUrl, { headers: { cookie: `historia_quiz_id=${signId(id, config.COOKIE_SECRET)}` } });
      await new Promise((resolve, reject) => { recon.once("open", resolve); recon.once("error", reject); });
      const msgsRecon = createCollector(recon);
      recon.send(JSON.stringify({ tipo: "alumno_entra", nombre: "LigadaOk", token: "token-stale" }));

      const rechazo = await waitFor(msgsRecon, (m) => m.tipo === "auth_rechazada");
      expect(rechazo.razon).toBe("token_rotado");
      expect(rechazo.token).toBeTruthy();
      expect(rechazo.token).not.toBe("token-stale");

      await closeWS(recon);
      await closeWS(alumno.ws);
      await closeWS(docente.ws);
    });

    it("cookie de víctima SIN firma no liga identidad (forja de cookie bloqueada)", async () => {
      const docente = await connectDocente(wsUrl);
      const victima = await connectAlumno(wsUrl, "VictimaForja");
      const idVictima = victima.msg.id;

      // Atacante: el UUID viaja público en los rankings y lo manda como cookie
      // SIN firma. R4-001: sin firma HMAC válida el dispatcher NO asigna
      // ws.alumnoId — la forja no liga sesión ni reemplaza el slot.
      const atacante = new WebSocket(wsUrl, { headers: { cookie: `historia_quiz_id=${idVictima}` } });
      await new Promise((resolve, reject) => { atacante.once("open", resolve); atacante.once("error", reject); });
      const msgsAtacante = createCollector(atacante);
      atacante.send(JSON.stringify({
        tipo: "alumno_entra",
        nombre: "IntrusoForja",
        id: idVictima,
      }));

      // Sin ligadura: reemplazo de slot con nombre distinto → rechazo limpio
      const rechazo = await waitFor(msgsAtacante, (m) => m.tipo === "auth_rechazada");
      expect(rechazo.razon).toBe("id_ajeno");
      expect(rechazo).not.toHaveProperty("token");
      expect(rechazo).not.toHaveProperty("id");

      // La víctima sigue intacta: su cookie firmada + token siguen funcionando
      const recon = await connectAlumno(wsUrl, "VictimaForja", null, { cookie: idVictima });
      expect(recon.msg.reconectado).toBe(true);
      expect(recon.msg.id).toBe(idVictima);

      await closeWS(atacante);
      await closeWS(recon.ws);
      await closeWS(victima.ws);
      await closeWS(docente.ws);
    });
  });

  describe("broadcast filter del sender", () => {
    it("alumno_entra: el joiner NO recibe su propio jugador_unido_alumno; los demás sí (REQ-WS-05)", async () => {
      const docente = await connectDocente(wsUrl);
      const wsA = await connectAlumno(wsUrl, "FiltroA");
      const wsB = await connectAlumno(wsUrl, "FiltroB");
      const wsC = await connectAlumno(wsUrl, "FiltroC");

      // FiltroC se acaba de unir → su propio socket NO debe contener
      // jugador_unido_alumno { nombre: "FiltroC" }.
      await waitForNone(
        wsC.messages,
        (m) => m.tipo === "jugador_unido_alumno" && m.nombre === "FiltroC"
      );

      // Los OTROS alumnos sí lo ven.
      await waitFor(
        wsA.messages,
        (m) => m.tipo === "jugador_unido_alumno" && m.nombre === "FiltroC"
      );
      await waitFor(
        wsB.messages,
        (m) => m.tipo === "jugador_unido_alumno" && m.nombre === "FiltroC"
      );

      await closeWS(wsC.ws);
      await closeWS(wsB.ws);
      await closeWS(wsA.ws);
      await closeWS(docente.ws);
    });

    it("cambiar_nombre: el renamer recibe targeted nombre_cambiado pero NO su propio par; los demás sí reciben el par (REQ-WS-05/06/07)", async () => {
      const docente = await connectDocente(wsUrl);
      const wsA = await connectAlumno(wsUrl, "FiltroAna");
      const wsB = await connectAlumno(wsUrl, "FiltroJuan");

      // Esperar a que la unión de B haya sido vista por A (sincronización).
      await waitFor(
        wsA.messages,
        (m) => m.tipo === "jugador_unido_alumno" && m.nombre === "FiltroJuan"
      );

      // B renombra.
      wsB.ws.send(JSON.stringify({ tipo: "cambiar_nombre", nombre: "FiltroJuancito" }));

      // B recibe el targeted self-ack con oldNombre.
      const selfAck = await waitFor(
        wsB.messages,
        (m) => m.tipo === "nombre_cambiado" && m.nombre === "FiltroJuancito"
      );
      expect(selfAck.oldNombre).toBe("FiltroJuan");
      expect(selfAck.nombre).toBe("FiltroJuancito");

      // B NO debe ver su propio jugador_salio/unido_alumno (REQ-WS-05).
      await waitForNone(
        wsB.messages,
        (m) => m.tipo === "jugador_salio_alumno" && m.nombre === "FiltroJuan"
      );
      await waitForNone(
        wsB.messages,
        (m) => m.tipo === "jugador_unido_alumno" && m.nombre === "FiltroJuancito"
      );

      // A (otro alumno) SÍ debe ver el par (REQ-WS-06).
      const aSalio = await waitFor(
        wsA.messages,
        (m) => m.tipo === "jugador_salio_alumno" && m.nombre === "FiltroJuan"
      );
      const aUnido = await waitFor(
        wsA.messages,
        (m) => m.tipo === "jugador_unido_alumno" && m.nombre === "FiltroJuancito"
      );
      expect(aSalio).toBeTruthy();
      expect(aUnido).toBeTruthy();

      // A NO debe recibir un nombre_cambiado (ese evento es targeted sólo al renamer).
      await waitForNone(
        wsA.messages,
        (m) => m.tipo === "nombre_cambiado" && m.nombre === "FiltroJuancito"
      );

      await closeWS(wsB.ws);
      await closeWS(wsA.ws);
      await closeWS(docente.ws);
    });
  });

  describe("iniciar juego", () => {
    it("debería lanzar la primera pregunta y notificar a docente y alumnos", async () => {
      const docente = await connectDocente(wsUrl);
      const alumno = await connectAlumno(wsUrl, "Bruno Test");

      docente.ws.send(JSON.stringify({
        tipo: "iniciar_juego",
        bancoId: "banco_1",
        tiempoPorPregunta: 15
      }));

      const reinicioDocente = await waitFor(docente.messages, (m) => m.tipo === "juego_reiniciado");
      const reinicioAlumno = await waitFor(alumno.messages, (m) => m.tipo === "juego_reiniciado");
      const preguntaDocente = await waitFor(docente.messages, (m) => m.tipo === "nueva_pregunta");
      const preguntaAlumno = await waitFor(alumno.messages, (m) => m.tipo === "nueva_pregunta");

      expect(reinicioDocente.tiempoPorPregunta).toBe(15);
      expect(reinicioAlumno.tiempoPorPregunta).toBe(15);
      expect(preguntaDocente.idx).toBe(0);
      expect(preguntaAlumno.pregunta).toBeTruthy();
      expect(preguntaAlumno.opciones).toHaveLength(4);
      expect(preguntaAlumno.tiempo).toBe(15);

      await closeWS(alumno.ws);
      await closeWS(docente.ws);
    });

    it("debería rechazar iniciar juego desde un alumno", async () => {
      await connectDocente(wsUrl);
      const alumno = await connectAlumno(wsUrl, "Carla Test");

      alumno.ws.send(JSON.stringify({
        tipo: "iniciar_juego",
        bancoId: "banco_1",
        tiempoPorPregunta: 15
      }));

      const error = await waitFor(alumno.messages, (m) => m.tipo === "error");
      expect(error.msg).toBe("No autorizado.");

      await closeWS(alumno.ws);
    });
  });

  describe("respuestas", () => {
    async function setupPartida(nombreAlumno) {
      const docente = await connectDocente(wsUrl);
      const alumno = await connectAlumno(wsUrl, nombreAlumno);

      docente.ws.send(JSON.stringify({
        tipo: "iniciar_juego",
        bancoId: "banco_1",
        tiempoPorPregunta: 20
      }));

      await waitFor(alumno.messages, (m) => m.tipo === "nueva_pregunta");
      return { docente, alumno };
    }

    it("debería confirmar respuesta válida y reportar progreso al docente", async () => {
      const { docente, alumno } = await setupPartida("Diego Test");

      alumno.ws.send(JSON.stringify({ tipo: "respuesta", opcion: 0 }));

      const ok = await waitFor(alumno.messages, (m) => m.tipo === "respuesta_ok");
      const progreso = await waitFor(docente.messages, (m) => m.tipo === "progreso_respuestas");

      expect(ok.tipo).toBe("respuesta_ok");
      expect(progreso.respondieron).toBe(1);
      expect(progreso.total).toBe(1);

      await closeWS(alumno.ws);
      await closeWS(docente.ws);
    });

    it("debería rechazar opción inválida", async () => {
      const { docente, alumno } = await setupPartida("Elena Test");

      alumno.ws.send(JSON.stringify({ tipo: "respuesta", opcion: 9 }));

      const rechazo = await waitFor(alumno.messages, (m) => m.tipo === "respuesta_rechazada");
      expect(rechazo.razon).toBe("opcion_invalida");
      await waitForNone(alumno.messages, (m) => m.tipo === "respuesta_ok");
      await waitForNone(alumno.messages, (m) => m.tipo === "error");

      await closeWS(alumno.ws);
      await closeWS(docente.ws);
    });

    it("debería rechazar con razon=ya_respondio cuando el alumno responde dos veces", async () => {
      // Se necesitan 2 alumnos: si hay 1, responder completa la ronda
      // y el segundo intento cae en fase_invalida, no en ya_respondio.
      const docente = await connectDocente(wsUrl);
      const alumno1 = await connectAlumno(wsUrl, "Yago A");
      const alumno2 = await connectAlumno(wsUrl, "Yago B");

      docente.ws.send(JSON.stringify({
        tipo: "iniciar_juego",
        bancoId: "banco_1",
        tiempoPorPregunta: 20
      }));
      await waitFor(alumno1.messages, (m) => m.tipo === "nueva_pregunta");
      await waitFor(alumno2.messages, (m) => m.tipo === "nueva_pregunta");

      alumno1.ws.send(JSON.stringify({ tipo: "respuesta", opcion: 0 }));
      await waitFor(alumno1.messages, (m) => m.tipo === "respuesta_ok");

      // Snapshot de mensajes previos al segundo intento
      const prevCount = alumno1.messages.length;

      // El mismo alumno intenta de nuevo, mientras la ronda sigue activa
      alumno1.ws.send(JSON.stringify({ tipo: "respuesta", opcion: 1 }));
      const rechazo = await waitFor(alumno1.messages, (m) => m.tipo === "respuesta_rechazada");
      expect(rechazo.razon).toBe("ya_respondio");

      // Verifica que no llegó un NUEVO respuesta_ok desde el segundo envío
      const nuevos = alumno1.messages.slice(prevCount).filter(m => m.tipo === "respuesta_ok");
      expect(nuevos).toHaveLength(0);

      await closeWS(alumno1.ws);
      await closeWS(alumno2.ws);
      await closeWS(docente.ws);
    });

    it("debería rechazar con razon=pausado cuando el juego está pausado", async () => {
      const docente = await connectDocente(wsUrl);
      const alumno = await connectAlumno(wsUrl, "Pausa Test");

      docente.ws.send(JSON.stringify({
        tipo: "iniciar_juego",
        bancoId: "banco_1",
        tiempoPorPregunta: 20
      }));
      await waitFor(alumno.messages, (m) => m.tipo === "nueva_pregunta");

      docente.ws.send(JSON.stringify({ tipo: "alternar_pausa" }));
      await waitFor(alumno.messages, (m) => m.tipo === "juego_pausado");

      alumno.ws.send(JSON.stringify({ tipo: "respuesta", opcion: 0 }));
      const rechazo = await waitFor(alumno.messages, (m) => m.tipo === "respuesta_rechazada");
      expect(rechazo.razon).toBe("pausado");
      await waitForNone(alumno.messages, (m) => m.tipo === "respuesta_ok");

      await closeWS(alumno.ws);
      await closeWS(docente.ws);
    });

    it("debería rechazar con razon=fase_invalida cuando se envía respuesta antes de iniciar", async () => {
      await connectDocente(wsUrl);
      const alumno = await connectAlumno(wsUrl, "Fase Test");

      // No se inicia_juego: fase sigue siendo "lobby"
      alumno.ws.send(JSON.stringify({ tipo: "respuesta", opcion: 0 }));
      const rechazo = await waitFor(alumno.messages, (m) => m.tipo === "respuesta_rechazada");
      expect(rechazo.razon).toBe("fase_invalida");
      await waitForNone(alumno.messages, (m) => m.tipo === "respuesta_ok");

      await closeWS(alumno.ws);
    });

    it("debería rechazar con razon=no_sesion cuando el WS no está registrado", async () => {
      await connectDocente(wsUrl);
      // WS crudo, nunca llamó alumno_entra
      const ws = await openWS(wsUrl);
      const messages = createCollector(ws);
      ws.send(JSON.stringify({ tipo: "respuesta", opcion: 0 }));

      const rechazo = await waitFor(messages, (m) => m.tipo === "respuesta_rechazada");
      expect(rechazo.razon).toBe("no_sesion");
      await waitForNone(messages, (m) => m.tipo === "respuesta_ok");

      await closeWS(ws);
    });

    it("debería mostrar resultado cuando todos responden", async () => {
      const { docente, alumno } = await setupPartida("Florencia Test");

      alumno.ws.send(JSON.stringify({ tipo: "respuesta", opcion: 0 }));

      const resultadoAlumno = await waitFor(alumno.messages, (m) => m.tipo === "resultado");
      const resultadoDocente = await waitFor(docente.messages, (m) => m.tipo === "resultado");

      expect(resultadoAlumno).toHaveProperty("correcta");
      expect(resultadoAlumno).toHaveProperty("jugadores");
      expect(resultadoDocente.respuestas).toHaveProperty(alumno.msg.id);

      await closeWS(alumno.ws);
      await closeWS(docente.ws);
    });

    it("debería manejar respuestas simultáneas de múltiples alumnos de forma consistente y sin condiciones de carrera", async () => {
      const docente = await connectDocente(wsUrl);
      const nombres = ["Concurrent1", "Concurrent2", "Concurrent3", "Concurrent4", "Concurrent5"];
      const alumnos = await Promise.all(
        nombres.map(n => connectAlumno(wsUrl, n))
      );

      docente.ws.send(JSON.stringify({
        tipo: "iniciar_juego",
        bancoId: "banco_1",
        tiempoPorPregunta: 20
      }));

      await Promise.all(
        alumnos.map(a => waitFor(a.messages, (m) => m.tipo === "nueva_pregunta"))
      );

      alumnos.forEach((a) => {
        a.ws.send(JSON.stringify({ tipo: "respuesta", opcion: 0 }));
      });

      await Promise.all(
        alumnos.map(a => waitFor(a.messages, (m) => m.tipo === "resultado"))
      );

      const resultadoDocente = await waitFor(docente.messages, (m) => m.tipo === "resultado");

      nombres.forEach(nombre => {
        const jugador = Object.values(resultadoDocente.jugadores).find(j => j.nombre === nombre);
        expect(jugador).toBeDefined();
        expect(jugador.puntaje).toBeGreaterThan(0);
      });

      await Promise.all(alumnos.map(a => closeWS(a.ws)));
      await closeWS(docente.ws);
    });
  });

  describe("pausa y reanudación", () => {
    it("debería pausar el juego, bloquear respuestas y reanudar desde el mismo tiempo", async () => {
      const docente = await connectDocente(wsUrl);
      const alumno = await connectAlumno(wsUrl, "Gustavo Test");

      docente.ws.send(JSON.stringify({
        tipo: "iniciar_juego",
        bancoId: "banco_1",
        tiempoPorPregunta: 20
      }));

      await waitFor(alumno.messages, (m) => m.tipo === "nueva_pregunta");

      docente.ws.send(JSON.stringify({ tipo: "alternar_pausa" }));
      await waitFor(alumno.messages, (m) => m.tipo === "juego_pausado");
      await waitFor(docente.messages, (m) => m.tipo === "juego_pausado");

      alumno.ws.send(JSON.stringify({ tipo: "respuesta", opcion: 0 }));
      await waitForNone(alumno.messages, (m) => m.tipo === "respuesta_ok");

      docente.ws.send(JSON.stringify({ tipo: "alternar_pausa" }));
      const reanudado = await waitFor(alumno.messages, (m) => m.tipo === "juego_reanudado");
      expect(reanudado.tiempo).toBe(20);

      alumno.ws.send(JSON.stringify({ tipo: "respuesta", opcion: 0 }));
      await waitFor(alumno.messages, (m) => m.tipo === "respuesta_ok");

      await closeWS(alumno.ws);
      await closeWS(docente.ws);
    });
  });

  describe("reconexión de alumnos", () => {
    it("debería permitir reconectar con el mismo id y nombre", async () => {
      const docente = await connectDocente(wsUrl);
      const alumno = await connectAlumno(wsUrl, "Helena Test");
      const idAlumno = alumno.msg.id;

      await closeWS(alumno.ws);
      await waitFor(docente.messages, (m) => m.tipo === "jugador_desconectado" && m.nombre === "Helena Test");

      const reconectado = await connectAlumno(wsUrl, "Helena Test", idAlumno);
      expect(reconectado.msg.reconectado).toBe(true);
      expect(reconectado.msg.id).toBe(idAlumno);

      const avisoDocente = await waitFor(docente.messages, (m) => m.tipo === "jugador_reconectado" && m.nombre === "Helena Test");
      expect(avisoDocente.id).toBe(idAlumno);

      await closeWS(reconectado.ws);
      await closeWS(docente.ws);
    });

    it("debería reemplazar al jugador si el nombre no coincide con el id (con la cookie propia)", async () => {
      const docente = await connectDocente(wsUrl);
      const alumno = await connectAlumno(wsUrl, "Iván Test");
      const idAlumno = alumno.msg.id;

      await closeWS(alumno.ws);
      await waitFor(docente.messages, (m) => m.tipo === "jugador_desconectado");

      // Path legítimo (gatekeeper #2): el reemplazo del slot requiere la
      // MISMA cookie (ws.alumnoId === id) — un socket raw ya no puede tomarlo.
      const nuevo = await connectAlumno(wsUrl, "Otro Nombre", null, { cookie: idAlumno });
      expect(nuevo.msg.reconectado).toBe(false);
      // D1 (REQ-WS-08): el slot huérfano se re-crea bajo el MISMO id —
      // la cookie (msg.id) es la identidad del jugador.
      expect(nuevo.msg.id).toBe(idAlumno);
      expect(nuevo.msg.jugadores).toEqual([{ nombre: "Otro Nombre" }]);

      const salida = await waitFor(docente.messages, (m) => m.tipo === "jugador_salio" && m.nombre === "Iván Test");
      expect(salida.id).toBe(idAlumno);

      const unido = await waitFor(docente.messages, (m) => m.tipo === "jugador_unido" && m.nombre === "Otro Nombre");
      expect(unido.id).toBe(nuevo.msg.id);

      await closeWS(nuevo.ws);
      await closeWS(docente.ws);
    });

    it("socket raw sin cookie NO puede tomar el slot de un jugador existente con nombre distinto (gatekeeper #2)", async () => {
      const docente = await connectDocente(wsUrl);
      const victima = await connectAlumno(wsUrl, "VictimaOrphan");
      const idVictima = victima.msg.id;
      expect(victima.msg.token).toBeTruthy();

      // Atacante: WS crudo (sin cookie), conoce el id (público en rankings),
      // usa un nombre distinto para caer en el branch de slot huérfano.
      const atacante = await openWS(wsUrl);
      const msgsAtacante = createCollector(atacante);
      atacante.send(JSON.stringify({ tipo: "alumno_entra", nombre: "Impostor", id: idVictima }));

      // Rechazo limpio — NUNCA bienvenido con la identidad de la víctima
      const respuesta = await waitFor(
        msgsAtacante,
        (m) => m.tipo === "auth_rechazada" || m.tipo === "bienvenido"
      );
      expect(respuesta.tipo).toBe("auth_rechazada");
      expect(respuesta.razon).toBe("id_ajeno");

      // Slot de la víctima INTACTO: su cookie + token siguen funcionando
      const recon = await connectAlumno(wsUrl, "VictimaOrphan", null, { cookie: idVictima });
      expect(recon.msg.reconectado).toBe(true);
      expect(recon.msg.id).toBe(idVictima);

      await closeWS(atacante);
      await closeWS(recon.ws);
      await closeWS(victima.ws);
      await closeWS(docente.ws);
    });
  });

  describe("avance de preguntas", () => {
    it("debería pasar a la siguiente pregunta cuando el docente lo indica", async () => {
      const docente = await connectDocente(wsUrl);
      const alumno = await connectAlumno(wsUrl, "Julia Test");

      docente.ws.send(JSON.stringify({
        tipo: "iniciar_juego",
        bancoId: "banco_1",
        tiempoPorPregunta: 15
      }));

      const primera = await waitFor(alumno.messages, (m) => m.tipo === "nueva_pregunta");
      expect(primera.idx).toBe(0);

      alumno.ws.send(JSON.stringify({ tipo: "respuesta", opcion: 0 }));
      await waitFor(alumno.messages, (m) => m.tipo === "resultado");

      docente.ws.send(JSON.stringify({ tipo: "siguiente_pregunta" }));

      const segunda = await waitFor(alumno.messages, (m) => m.tipo === "nueva_pregunta" && m.idx === 1);
      expect(segunda.idx).toBe(1);
      expect(segunda.pregunta).not.toBe(primera.pregunta);

      await closeWS(alumno.ws);
      await closeWS(docente.ws);
    });
  });

  describe("edge cases — inicio de juego", () => {
    it("debería rechazar iniciar juego sin bancoId", async () => {
      const docente = await connectDocente(wsUrl);
      await connectAlumno(wsUrl, "Alumno Edge");

      docente.ws.send(JSON.stringify({ tipo: "iniciar_juego", tiempoPorPregunta: 20 }));

      const err = await waitFor(docente.messages, (m) => m.tipo === "error" && m.msg.includes("banco"));
      expect(err).toBeTruthy();

      await closeWS(docente.ws);
    });

    it("debería rechazar iniciar juego sin alumnos conectados", async () => {
      const docente = await connectDocente(wsUrl);

      docente.ws.send(JSON.stringify({
        tipo: "iniciar_juego",
        bancoId: "banco_1",
        tiempoPorPregunta: 20
      }));

      const err = await waitFor(docente.messages, (m) => m.tipo === "error" && m.msg.includes("alumnos"));
      expect(err).toBeTruthy();

      await closeWS(docente.ws);
    });

    it("debería rechazar iniciar juego con banco vacío", async () => {
      // Create empty bank via API, then WS attempt
      const docente = await connectDocente(wsUrl);
      await connectAlumno(wsUrl, "Alumno Empty");

      docente.ws.send(JSON.stringify({
        tipo: "iniciar_juego",
        bancoId: "banco_inexistente",
        tiempoPorPregunta: 20
      }));

      const err = await waitFor(docente.messages, (m) => m.tipo === "error" && m.msg.includes("vacío"));
      expect(err).toBeTruthy();

      await closeWS(docente.ws);
    });

    it("debería usar tiempo por defecto si el enviado es inválido", async () => {
      const docente = await connectDocente(wsUrl);
      const alumno = await connectAlumno(wsUrl, "Alumno Tiempo");

      docente.ws.send(JSON.stringify({
        tipo: "iniciar_juego",
        bancoId: "banco_1",
        tiempoPorPregunta: 999
      }));

      const reinicio = await waitFor(docente.messages, (m) => m.tipo === "juego_reiniciado");
      expect(reinicio.tiempoPorPregunta).toBe(20);
      const pregunta = await waitFor(alumno.messages, (m) => m.tipo === "nueva_pregunta");
      expect(pregunta.tiempo).toBe(20);

      await closeWS(alumno.ws);
      await closeWS(docente.ws);
    });
  });

  describe("edge cases — fin de juego", () => {
    async function jugarCompleto() {
      const docente = await connectDocente(wsUrl);
      const alumno = await connectAlumno(wsUrl, "Fin Test");
      const totalPregs = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/api/bancos/banco_1`, { headers: { "X-Admin-Token": ADMIN_TOKEN } }, (res) => {
          let data = "";
          res.on("data", (chunk) => data += chunk);
          res.on("end", () => {
            try { resolve(JSON.parse(data).preguntas.length); } catch (e) { reject(e); }
          });
        }).on("error", reject);
      });

      docente.ws.send(JSON.stringify({
        tipo: "iniciar_juego",
        bancoId: "banco_1",
        tiempoPorPregunta: 5
      }));
      await waitFor(alumno.messages, (m) => m.tipo === "nueva_pregunta");

      for (let i = 0; i < totalPregs; i++) {
        alumno.ws.send(JSON.stringify({ tipo: "respuesta", opcion: 0 }));
        // REQ-GF-01: siguiente() sólo avanza desde RESULTADO. Hay que esperar
        // el resultado DE ESTA pregunta (conteo i+1) y el broadcast de la
        // SIGUIENTE (conteo i+2 — el de la pregunta 0 llega en iniciar_juego,
        // fuera del loop). Si no, el cliente responde con el token viejo y el
        // guard descarta el siguiente (deadlock).
        await waitForCount(alumno.messages, (m) => m.tipo === "resultado", i + 1);
        if (i < totalPregs - 1) {
          docente.ws.send(JSON.stringify({ tipo: "siguiente_pregunta" }));
          await waitForCount(alumno.messages, (m) => m.tipo === "nueva_pregunta", i + 2);
        }
      }
      return { docente, alumno, totalPregs };
    }

    it("debería llegar a fin_juego tras responder todas las preguntas", async () => {
      const { docente, alumno, totalPregs } = await jugarCompleto();

      // Avanzar desde la última pregunta (sin nueva_pregunta, debe emitir fin_juego)
      docente.ws.send(JSON.stringify({ tipo: "siguiente_pregunta" }));

      const finDocente = await waitFor(docente.messages, (m) => m.tipo === "fin_juego");
      const finAlumno = await waitFor(alumno.messages, (m) => m.tipo === "fin_juego");

      expect(finDocente.ranking).toBeTruthy();
      expect(finDocente.rankingGeneral).toBeTruthy();
      expect(finAlumno.jugadores).toBeTruthy();

      await closeWS(alumno.ws);
      await closeWS(docente.ws);
    });

    // REQ-WS-12: cada socket recibe SÓLO su propio historial en fin_juego.
    it("debería enviar a cada alumno su propio miHistorial sin filtrar el del compañero", async () => {
      const docente = await connectDocente(wsUrl);
      const a1 = await connectAlumno(wsUrl, "HistA");
      const a2 = await connectAlumno(wsUrl, "HistB");
      const totalPregs = preguntasBanco("banco_1").length;
      expect(totalPregs).toBeGreaterThan(1);

      docente.ws.send(JSON.stringify({
        tipo: "iniciar_juego",
        bancoId: "banco_1",
        tiempoPorPregunta: 5
      }));
      await waitFor(a1.messages, (m) => m.tipo === "nueva_pregunta");

      for (let i = 0; i < totalPregs; i++) {
        // a1 siempre responde la opción 0 (letra A); a2 la opción 3 (letra D).
        a1.ws.send(JSON.stringify({ tipo: "respuesta", opcion: 0 }));
        a2.ws.send(JSON.stringify({ tipo: "respuesta", opcion: 3 }));
        await waitForCount(a1.messages, (m) => m.tipo === "resultado", i + 1);
        await waitForCount(a2.messages, (m) => m.tipo === "resultado", i + 1);
        if (i < totalPregs - 1) {
          docente.ws.send(JSON.stringify({ tipo: "siguiente_pregunta" }));
          await waitForCount(a1.messages, (m) => m.tipo === "nueva_pregunta", i + 2);
        }
      }
      docente.ws.send(JSON.stringify({ tipo: "siguiente_pregunta" }));

      const finA1 = await waitFor(a1.messages, (m) => m.tipo === "fin_juego");
      const finA2 = await waitFor(a2.messages, (m) => m.tipo === "fin_juego");

      // REQ-WS-04: los campos existentes siguen presentes.
      expect(finA1.jugadores).toBeTruthy();
      expect(finA1.rankingGeneral).toBeTruthy();
      expect(finA2.rankingGeneral).toBeTruthy();
      // REQ-WS-12: cada socket lleva su propia historia, completa y sin datos del otro.
      expect(finA1.miHistorial).toHaveLength(totalPregs);
      expect(finA2.miHistorial).toHaveLength(totalPregs);
      expect(finA1.miHistorial.every((h) => h.opcionLetra === "A")).toBe(true);
      expect(finA2.miHistorial.every((h) => h.opcionLetra === "D")).toBe(true);

      await closeWS(a1.ws);
      await closeWS(a2.ws);
      await closeWS(docente.ws);
    });

    // REQ-WS-12: la reconexión en fase FIN conserva el mismo historial.
    it("debería reenviar el mismo miHistorial al alumno que reconecta en FIN", async () => {
      const docente = await connectDocente(wsUrl);
      const alumno = await connectAlumno(wsUrl, "ReconFinHist");
      const totalPregs = preguntasBanco("banco_1").length;

      docente.ws.send(JSON.stringify({
        tipo: "iniciar_juego",
        bancoId: "banco_1",
        tiempoPorPregunta: 5
      }));
      await waitFor(alumno.messages, (m) => m.tipo === "nueva_pregunta");

      for (let i = 0; i < totalPregs; i++) {
        alumno.ws.send(JSON.stringify({ tipo: "respuesta", opcion: 2 }));
        await waitForCount(alumno.messages, (m) => m.tipo === "resultado", i + 1);
        if (i < totalPregs - 1) {
          docente.ws.send(JSON.stringify({ tipo: "siguiente_pregunta" }));
          await waitForCount(alumno.messages, (m) => m.tipo === "nueva_pregunta", i + 2);
        }
      }
      docente.ws.send(JSON.stringify({ tipo: "siguiente_pregunta" }));

      const finAlumno = await waitFor(alumno.messages, (m) => m.tipo === "fin_juego");
      expect(finAlumno.miHistorial).toHaveLength(totalPregs);

      await closeWS(alumno.ws);
      await waitFor(docente.messages, (m) => m.tipo === "jugador_desconectado" && m.nombre === "ReconFinHist");

      const recon = await connectAlumno(wsUrl, "ReconFinHist", alumno.msg.id);
      expect(recon.msg.reconectado).toBe(true);
      expect(recon.msg.fase).toBe("fin");
      expect(recon.msg.miHistorial).toEqual(finAlumno.miHistorial);
      expect(Array.isArray(recon.msg.jugadores)).toBe(true);
      expect(Array.isArray(recon.msg.rankingGeneral)).toBe(true);

      await closeWS(recon.ws);
      await closeWS(docente.ws);
    });
  });

  describe("edge cases — volver a lobby", () => {
    it("debería volver al lobby durante el juego", async () => {
      const docente = await connectDocente(wsUrl);
      const alumno = await connectAlumno(wsUrl, "Lobby Test");

      docente.ws.send(JSON.stringify({
        tipo: "iniciar_juego",
        bancoId: "banco_1",
        tiempoPorPregunta: 20
      }));
      await waitFor(alumno.messages, (m) => m.tipo === "nueva_pregunta");

      docente.ws.send(JSON.stringify({ tipo: "volver_a_lobby" }));

      const lobbyDocente = await waitFor(docente.messages, (m) => m.tipo === "volver_a_lobby");
      const lobbyAlumno = await waitFor(alumno.messages, (m) => m.tipo === "volver_a_lobby");
      expect(lobbyDocente).toBeTruthy();
      expect(lobbyAlumno).toBeTruthy();

      await closeWS(alumno.ws);
      await closeWS(docente.ws);
    });
  });

  describe("edge cases — reiniciar ranking general", () => {
    it("debería reiniciar el ranking general", async () => {
      const docente = await connectDocente(wsUrl);
      const alumno = await connectAlumno(wsUrl, "Rank Test");

      docente.ws.send(JSON.stringify({ tipo: "reiniciar_ranking_general" }));

      const reinicio = await waitFor(docente.messages, (m) => m.tipo === "ranking_general_reiniciado");
      // Ranking general includes all players with 0 after reset
      expect(reinicio.rankingGeneral.every(j => j.puntajeGeneral === 0)).toBe(true);

      await closeWS(alumno.ws);
      await closeWS(docente.ws);
    });
  });

  describe("edge cases — mensajes inválidos", () => {
    it("debería ignorar JSON inválido sin cerrar conexión", async () => {
      const ws = await openWS(wsUrl);
      ws.send("esto no es json");
      // wait a bit — server should not crash nor close
      await new Promise(r => setTimeout(r, 300));
      expect(ws.readyState).toBe(WebSocket.OPEN);
      await closeWS(ws);
    });

    it("debería ignorar tipo desconocido", async () => {
      const ws = await openWS(wsUrl);
      ws.send(JSON.stringify({ tipo: "tipo_inventado" }));
      await new Promise(r => setTimeout(r, 300));
      expect(ws.readyState).toBe(WebSocket.OPEN);
      await closeWS(ws);
    });
  });

  describe("edge cases — reconexión en fase pregunta", () => {
    it("debería reconectar durante una pregunta activa y reanudar", async () => {
      const docente = await connectDocente(wsUrl);
      const alumno = await connectAlumno(wsUrl, "ReconPreg");
      // Segundo alumno para mantener la pregunta activa cuando el primero
      // se desconecta — R3-003 cierra la ronda cuando total=0, así que
      // necesitamos al menos un respondedor potencial restante.
      const companiero = await connectAlumno(wsUrl, "AcompPreg");

      docente.ws.send(JSON.stringify({
        tipo: "iniciar_juego",
        bancoId: "banco_1",
        tiempoPorPregunta: 30
      }));
      await waitFor(alumno.messages, (m) => m.tipo === "nueva_pregunta");
      const idAlumno = alumno.msg.id;

      await closeWS(alumno.ws);
      await waitFor(docente.messages, (m) => m.tipo === "jugador_desconectado");

      const recon = await connectAlumno(wsUrl, "ReconPreg", idAlumno);
      expect(recon.msg.reconectado).toBe(true);
      expect(recon.msg.fase).toBe("pregunta");
      expect(recon.msg.pregunta).toBeTruthy();
      expect(recon.msg.opciones).toHaveLength(4);

      await closeWS(recon.ws);
      await closeWS(companiero.ws);
      await closeWS(docente.ws);
    });
  });

  describe("edge cases — reconexión del docente en partida activa", () => {
    it("debería enviar estado completo (pregunta + tiempo + respuestas) al recargar el docente durante una pregunta", async () => {
      const docente = await connectDocente(wsUrl);
      const a1 = await connectAlumno(wsUrl, "ReconDoc1");
      const a2 = await connectAlumno(wsUrl, "ReconDoc2");

      docente.ws.send(JSON.stringify({
        tipo: "iniciar_juego",
        bancoId: "banco_1",
        tiempoPorPregunta: 30
      }));
      await waitFor(a1.messages, (m) => m.tipo === "nueva_pregunta");

      a1.ws.send(JSON.stringify({ tipo: "respuesta", opcion: 1 }));
      await waitFor(docente.messages, (m) => m.tipo === "progreso_respuestas");

      // Simular recarga del docente: cerrar el ws del docente y reconectar.
      // El cierre del docente NO genera jugador_desconectado (sólo lo generan los alumnos).
      await closeWS(docente.ws);

      const doc2 = await connectDocente(wsUrl, ADMIN_TOKEN);
      expect(doc2.msg.tipo).toBe("estado_inicial");
      expect(doc2.msg.fase).toBe("pregunta");
      expect(doc2.msg.pregunta).toBeTruthy();
      expect(doc2.msg.pregunta.idx).toBe(0);
      expect(doc2.msg.tiempoPorPregunta).toBe(30);
      expect(doc2.msg.tiempoRestante).toBeGreaterThan(0);
      expect(doc2.msg.respuestasActuales).toBeTruthy();
      expect(Object.keys(doc2.msg.respuestasActuales)).toHaveLength(1);
      expect(doc2.msg.pausado).toBe(false);

      await closeWS(doc2.ws);
      await closeWS(a1.ws);
      await closeWS(a2.ws);
    });

    it("debería enviar resultado actual al docente que recarga durante fase resultado", async () => {
      const docente = await connectDocente(wsUrl);
      const alumno = await connectAlumno(wsUrl, "ReconDocRes");

      docente.ws.send(JSON.stringify({
        tipo: "iniciar_juego",
        bancoId: "banco_1",
        tiempoPorPregunta: 30
      }));
      await waitFor(alumno.messages, (m) => m.tipo === "nueva_pregunta");

      docente.ws.send(JSON.stringify({ tipo: "mostrar_resultado_manual" }));
      await waitFor(alumno.messages, (m) => m.tipo === "resultado");

      await closeWS(docente.ws);

      const doc2 = await connectDocente(wsUrl, ADMIN_TOKEN);
      expect(doc2.msg.fase).toBe("resultado");
      expect(doc2.msg.resultado).toBeTruthy();
      expect(doc2.msg.resultado.correcta).toBeGreaterThanOrEqual(0);

      await closeWS(doc2.ws);
      await closeWS(alumno.ws);
    });

    it("debería enviar informe final al docente que recarga durante fase fin", async () => {
      const docente = await connectDocente(wsUrl);
      const alumno = await connectAlumno(wsUrl, "ReconDocFin");

      docente.ws.send(JSON.stringify({
        tipo: "iniciar_juego",
        bancoId: "banco_1",
        tiempoPorPregunta: 5
      }));
      await waitFor(alumno.messages, (m) => m.tipo === "nueva_pregunta");

      const total = preguntasBanco("banco_1").length;
      for (let i = 0; i < total; i++) {
        alumno.ws.send(JSON.stringify({ tipo: "respuesta", opcion: 0 }));
        // REQ-GF-01: esperar el resultado de ESTA pregunta (i+1) y el
        // broadcast de la siguiente (i+2, el de la pregunta 0 llega en
        // iniciar_juego) — el guard de siguiente() descarta llamadas en PREGUNTA.
        await waitForCount(alumno.messages, (m) => m.tipo === "resultado", i + 1);
        if (i < total - 1) {
          docente.ws.send(JSON.stringify({ tipo: "siguiente_pregunta" }));
          await waitForCount(alumno.messages, (m) => m.tipo === "nueva_pregunta", i + 2);
        }
      }
      docente.ws.send(JSON.stringify({ tipo: "siguiente_pregunta" }));
      await waitFor(docente.messages, (m) => m.tipo === "fin_juego");

      await closeWS(docente.ws);

      const doc2 = await connectDocente(wsUrl, ADMIN_TOKEN);
      expect(doc2.msg.fase).toBe("fin");
      expect(doc2.msg.informe).toBeTruthy();
      expect(Array.isArray(doc2.msg.informe)).toBe(true);

      await closeWS(doc2.ws);
      await closeWS(alumno.ws);
    });
  });

  describe("edge cases — mostrar resultado manual", () => {
    it("debería forzar resultado manualmente", async () => {
      const docente = await connectDocente(wsUrl);
      const alumno = await connectAlumno(wsUrl, "ManualTest");

      docente.ws.send(JSON.stringify({
        tipo: "iniciar_juego",
        bancoId: "banco_1",
        tiempoPorPregunta: 30
      }));
      await waitFor(alumno.messages, (m) => m.tipo === "nueva_pregunta");

      docente.ws.send(JSON.stringify({ tipo: "mostrar_resultado_manual" }));

      const res = await waitFor(alumno.messages, (m) => m.tipo === "resultado");
      expect(res.correcta).toBeGreaterThanOrEqual(0);

      await closeWS(alumno.ws);
      await closeWS(docente.ws);
    });
  });

  describe("edge cases — mostrar resultado manual en fase incorrecta", () => {
    it("no debería hacer nada si no está en fase pregunta", async () => {
      const docente = await connectDocente(wsUrl);

      docente.ws.send(JSON.stringify({ tipo: "mostrar_resultado_manual" }));

      // No debería recibir resultado porque está en lobby
      await expect(
        waitFor(docente.messages, (m) => m.tipo === "resultado", 500)
      ).rejects.toThrow("Timeout");

      await closeWS(docente.ws);
    });
  });

  describe("edge cases — alumno sin nombre", () => {
    it("debería ignorar alumno_entra sin nombre", async () => {
      const docente = await connectDocente(wsUrl);
      const ws = await openWS(wsUrl);
      const msgs = createCollector(ws);
      ws.send(JSON.stringify({ tipo: "alumno_entra", nombre: "" }));

      await new Promise(r => setTimeout(r, 300));
      expect(msgs.length).toBe(0);

      await closeWS(ws);
      await closeWS(docente.ws);
    });
  });

  describe("US4 - Auto-pausa en desconexión docente y persistencia en SQLite", () => {
    it("debería pausar la partida, persistir el estado autoPausado en SQLite al desconectarse el docente, y recuperarse", async () => {
      const { cargarEstado } = require("../../src/server/application/app-state");
      
      const docente = await connectDocente(wsUrl);
      const alumno = await connectAlumno(wsUrl, "PersistAlumno");

      docente.ws.send(JSON.stringify({
        tipo: "iniciar_juego",
        bancoId: "banco_1",
        tiempoPorPregunta: 20
      }));

      await waitFor(alumno.messages, (m) => m.tipo === "nueva_pregunta");

      await closeWS(docente.ws);

      await new Promise(resolve => setTimeout(resolve, 100));

      const snapshot = cargarEstado();
      expect(snapshot).toBeTruthy();
      expect(snapshot.fase).toBe("pregunta");
      expect(snapshot.pausado).toBe(true);

      await closeWS(alumno.ws);
    });
  });
});
