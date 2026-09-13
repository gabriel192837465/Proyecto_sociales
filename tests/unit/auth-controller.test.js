const EventEmitter = require("events");
const { handleAuthApi } = require("../../src/server/http/controllers/auth.controller");
const { signId, verifySignedId } = require("../../src/server/infra/security");
const config = require("../../src/server/config");

describe("auth.controller — handleAuthApi", () => {
  function createMockReqRes(method, pathname, cookie = null) {
    const req = new EventEmitter();
    req.method = method;
    req.headers = cookie ? { cookie } : {};
    req.destroy = jest.fn(() => {
      req.emit("error", new Error("destroyed"));
    });

    const res = {
      statusCode: 200,
      headers: {},
      headersSent: false,
      body: "",
      writeHead: jest.fn((code, headers) => {
        res.statusCode = code;
        res.headersSent = true;
        Object.assign(res.headers, headers);
      }),
      setHeader: jest.fn((name, value) => {
        res.headers[name] = value;
      }),
      end: jest.fn((chunk) => {
        if (chunk) res.body = chunk;
      })
    };

    return { req, res };
  }

  test("debería retornar false si la ruta o el método no coinciden", () => {
    const { req, res } = createMockReqRes("GET", "/api/alumno/entrar");
    expect(handleAuthApi(req, res, "/api/alumno/entrar")).toBe(false);

    const { req: req2, res: res2 } = createMockReqRes("POST", "/api/otro");
    expect(handleAuthApi(req2, res2, "/api/otro")).toBe(false);
  });

  test("debería autenticar un alumno nuevo y fijar la cookie Set-Cookie HttpOnly firmada", (done) => {
    const { req, res } = createMockReqRes("POST", "/api/alumno/entrar");
    const handled = handleAuthApi(req, res, "/api/alumno/entrar");
    expect(handled).toBe(true);

    req.emit("data", JSON.stringify({ nombre: " San Martín " }));
    req.emit("end");

    process.nextTick(() => {
      expect(res.statusCode).toBe(200);
      // R4-001: el valor de la cookie es `<id>.<firma>` — la firma HMAC debe
      // verificarse con el secret del server (config.COOKIE_SECRET).
      const setCookie = res.headers["Set-Cookie"];
      expect(setCookie).toMatch(/^historia_quiz_id=[0-9a-f-]+\.[A-Za-z0-9_-]+; Path=\/; HttpOnly; SameSite=Lax$/);
      const cookieValue = setCookie.match(/^historia_quiz_id=([^;]+)/)[1];
      const signedId = verifySignedId(cookieValue, config.COOKIE_SECRET);
      expect(signedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      const parsedBody = JSON.parse(res.body);
      expect(parsedBody).toEqual({ ok: true, nombre: "San Martín" });
      done();
    });
  });

  test("debería reutilizar el id de la cookie si el alumno ya la poseía (cookie firmada)", (done) => {
    const existingId = "12345678-1234-4234-8234-123456789abc";
    const cookieHeader = `historia_quiz_id=${signId(existingId, config.COOKIE_SECRET)}; otra_cookie=abc`;
    const { req, res } = createMockReqRes("POST", "/api/alumno/entrar", cookieHeader);

    handleAuthApi(req, res, "/api/alumno/entrar");
    req.emit("data", JSON.stringify({ nombre: "Belgrano" }));
    req.emit("end");

    process.nextTick(() => {
      expect(res.statusCode).toBe(200);
      expect(res.headers["Set-Cookie"]).toBe(`historia_quiz_id=${signId(existingId, config.COOKIE_SECRET)}; Path=/; HttpOnly; SameSite=Lax`);
      const parsedBody = JSON.parse(res.body);
      expect(parsedBody).toEqual({ ok: true, nombre: "Belgrano" });
      done();
    });
  });

  test("debería emitir un id NUEVO si la cookie llega SIN firma (formato viejo)", (done) => {
    // R4-001: la cookie legada sin firma deja de ser una identidad válida — el
    // alumno recibe un id nuevo al recargar (compatibilidad aceptada).
    const legacyId = "12345678-1234-4234-8234-123456789abc";
    const cookieHeader = `historia_quiz_id=${legacyId}; otra_cookie=abc`;
    const { req, res } = createMockReqRes("POST", "/api/alumno/entrar", cookieHeader);

    handleAuthApi(req, res, "/api/alumno/entrar");
    req.emit("data", JSON.stringify({ nombre: "Belgrano" }));
    req.emit("end");

    process.nextTick(() => {
      expect(res.statusCode).toBe(200);
      const setCookie = res.headers["Set-Cookie"];
      const cookieValue = setCookie.match(/^historia_quiz_id=([^;]+)/)[1];
      expect(verifySignedId(cookieValue, config.COOKIE_SECRET)).not.toBe(legacyId);
      done();
    });
  });

  test("debería emitir un id NUEVO si la cookie tiene firma inválida", (done) => {
    const forgedId = "12345678-1234-4234-8234-123456789abc";
    const cookieHeader = `historia_quiz_id=${forgedId}.firma_forjada_invalida; otra_cookie=abc`;
    const { req, res } = createMockReqRes("POST", "/api/alumno/entrar", cookieHeader);

    handleAuthApi(req, res, "/api/alumno/entrar");
    req.emit("data", JSON.stringify({ nombre: "Belgrano" }));
    req.emit("end");

    process.nextTick(() => {
      expect(res.statusCode).toBe(200);
      const setCookie = res.headers["Set-Cookie"];
      const cookieValue = setCookie.match(/^historia_quiz_id=([^;]+)/)[1];
      expect(verifySignedId(cookieValue, config.COOKIE_SECRET)).not.toBe(forgedId);
      done();
    });
  });

  test("debería rechazar si el nombre está vacío o sólo contiene espacios", (done) => {
    const { req, res } = createMockReqRes("POST", "/api/alumno/entrar");

    handleAuthApi(req, res, "/api/alumno/entrar");
    req.emit("data", JSON.stringify({ nombre: "   " }));
    req.emit("end");

    process.nextTick(() => {
      expect(res.statusCode).toBe(400);
      const parsedBody = JSON.parse(res.body);
      expect(parsedBody).toEqual({ error: "nombre_requerido" });
      done();
    });
  });

  test("debería rechazar si el JSON enviado es inválido", (done) => {
    const { req, res } = createMockReqRes("POST", "/api/alumno/entrar");

    handleAuthApi(req, res, "/api/alumno/entrar");
    req.emit("data", "esto_no_es_json");
    req.emit("end");

    process.nextTick(() => {
      expect(res.statusCode).toBe(400);
      const parsedBody = JSON.parse(res.body);
      expect(parsedBody).toEqual({ error: "bad_request" });
      done();
    });
  });

  test("debería destruir la request y responder bad_request si el payload supera 512KB", (done) => {
    const { req, res } = createMockReqRes("POST", "/api/alumno/entrar");

    handleAuthApi(req, res, "/api/alumno/entrar");
    const hugeChunk = "x".repeat(513 * 1024);
    req.emit("data", hugeChunk);

    process.nextTick(() => {
      expect(req.destroy).toHaveBeenCalled();
      expect(res.statusCode).toBe(400);
      const parsedBody = JSON.parse(res.body);
      expect(parsedBody).toEqual({ error: "bad_request" });
      done();
    });
  });
});
