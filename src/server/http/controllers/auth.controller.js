const crypto = require("node:crypto");
const config = require("../../config");
const { signId, verifySignedId } = require("../../infra/security");

function json(res, data, code = 200) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function handleAuthApi(req, res, pathname) {
  if (req.method === "POST" && pathname === "/api/alumno/entrar") {
    let bodyStr = "";
    req.on("data", chunk => { 
      bodyStr += chunk; 
      if (bodyStr.length > 512 * 1024) {
        req.destroy();
      }
    });
    req.on("error", () => {
      if (!res.headersSent) {
        json(res, { error: "bad_request" }, 400);
      }
    });
    req.on("end", () => {
      try {
        const body = JSON.parse(bodyStr);
        const nombre = (body.nombre || "").trim();
        if (!nombre) {
          return json(res, { error: "nombre_requerido" }, 400);
        }

        // Recuperar ID de la cookie si existe — R4-001: sólo una cookie
        // FIRMADA (HMAC-SHA256 con COOKIE_SECRET) es una identidad válida.
        // La cookie legada sin firma (o con firma inválida) se descarta: el
        // alumno recibe un id nuevo al recargar (compatibilidad aceptada).
        let alumnoId = null;
        if (req.headers.cookie) {
          const match = req.headers.cookie.match(/historia_quiz_id=([^;]+)/);
          if (match && match[1]) {
            alumnoId = verifySignedId(match[1], config.COOKIE_SECRET);
          }
        }

        if (!alumnoId) {
          alumnoId = crypto.randomUUID();
        }

        const cookieValue = `historia_quiz_id=${signId(alumnoId, config.COOKIE_SECRET)}; Path=/; HttpOnly; SameSite=Lax`;
        res.setHeader("Set-Cookie", cookieValue);
        
        return json(res, { ok: true, nombre });
      } catch (err) {
        return json(res, { error: "bad_request" }, 400);
      }
    });
    return true;
  }
  return false;
}

module.exports = { handleAuthApi };
