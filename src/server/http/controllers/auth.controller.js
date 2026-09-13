const crypto = require("node:crypto");
const config = require("../../config");
const { signId, verifySignedId, hashPassword, verifyPassword, safeEq } = require("../../infra/security");
const db = require("../../infra/db");
const {
  EMAIL_DOMINIO_INSTITUCIONAL,
  PASSWORD_MIN_LENGTH,
  NOMBRE_USUARIO_MIN_LENGTH,
  NOMBRE_USUARIO_MAX_LENGTH
} = require("../../domain/constants");

const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOMBRE_USUARIO_RE = /^[a-zA-Z0-9_.-]+$/;
const USUARIO_COOKIE_NAME = "historia_quiz_uid";

function json(res, data, code = 200) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readJsonBody(req, res, onBody) {
  let bodyStr = "";
  req.on("data", chunk => {
    bodyStr += chunk;
    if (bodyStr.length > 512 * 1024) {
      req.destroy();
    }
  });
  req.on("error", () => {
    if (!res.headersSent) json(res, { error: "bad_request" }, 400);
  });
  req.on("end", () => {
    try {
      onBody(JSON.parse(bodyStr));
    } catch {
      json(res, { error: "bad_request" }, 400);
    }
  });
}

function setUsuarioCookie(res, usuarioId) {
  const cookieValue = `${USUARIO_COOKIE_NAME}=${signId(usuarioId, config.COOKIE_SECRET)}; Path=/; HttpOnly; SameSite=Lax`;
  res.setHeader("Set-Cookie", cookieValue);
}

function usuarioPublico(usuario) {
  // Nunca exponer passwordHash ni el email a otros (sólo al propio dueño en su respuesta de login/registro).
  return {
    id: usuario.id,
    nombreUsuario: usuario.nombreUsuario,
    rol: usuario.rol
  };
}

function requireAdmin(req, res, adminToken) {
  const token = req.headers["x-admin-token"] || "";
  if (!safeEq(token, adminToken)) {
    json(res, { error: "No autorizado" }, 401);
    return false;
  }
  return true;
}

// Vista de administración de una cuenta (sección 21): incluye email
// (el admin lo necesita para buscar/identificar), pero NUNCA passwordHash.
function usuarioAdminView(usuario) {
  return {
    id: usuario.id,
    email: usuario.email,
    nombreUsuario: usuario.nombreUsuario,
    rol: usuario.rol,
    creadoEn: usuario.creadoEn,
    activo: usuario.activo
  };
}

// GET /api/admin/usuarios?q=busqueda — lista/busca alumnos registrados.
function handleListarUsuarios(req, res, adminToken) {
  if (!requireAdmin(req, res, adminToken)) return;
  const busqueda = new URL(req.url, "http://localhost").searchParams.get("q");
  let usuarios = db.listarUsuarios();
  if (busqueda) {
    const q = busqueda.trim().toLowerCase();
    usuarios = usuarios.filter((u) =>
      u.nombreUsuario.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }
  return json(res, { usuarios: usuarios.map(usuarioAdminView) });
}

// POST /api/admin/usuarios/:id/activo — activa/desactiva una cuenta.
function handleSetUsuarioActivo(req, res, usuarioId, adminToken) {
  if (!requireAdmin(req, res, adminToken)) return;
  readJsonBody(req, res, (body) => {
    const usuario = db.buscarUsuarioPorId(usuarioId);
    if (!usuario) return json(res, { error: "no_encontrado" }, 404);
    const activo = !!(body && body.activo);
    db.setUsuarioActivo(usuarioId, activo);
    return json(res, { ok: true, usuario: usuarioAdminView({ ...usuario, activo }) });
  });
}

// POST /api/alumno/registro — crea una cuenta de alumno con correo institucional.
// Requisitos: sección 3 del pedido (correo @alu.tecnica29de6.edu.ar, password hasheada, sin datos personales extra).
function handleRegistro(req, res) {
  readJsonBody(req, res, (body) => {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const nombreUsuario = String(body.nombreUsuario || "").trim();

    if (!email || !EMAIL_FORMAT_RE.test(email)) {
      return json(res, { error: "email_invalido", mensaje: "El correo no tiene un formato válido." }, 400);
    }
    if (!email.endsWith(EMAIL_DOMINIO_INSTITUCIONAL)) {
      return json(res, {
        error: "dominio_no_institucional",
        mensaje: `Debes utilizar un correo ${EMAIL_DOMINIO_INSTITUCIONAL}`
      }, 400);
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      return json(res, {
        error: "password_invalida",
        mensaje: `La contraseña no cumple los requisitos (mínimo ${PASSWORD_MIN_LENGTH} caracteres).`
      }, 400);
    }
    if (
      nombreUsuario.length < NOMBRE_USUARIO_MIN_LENGTH ||
      nombreUsuario.length > NOMBRE_USUARIO_MAX_LENGTH ||
      !NOMBRE_USUARIO_RE.test(nombreUsuario)
    ) {
      return json(res, {
        error: "nombre_usuario_invalido",
        mensaje: `El nombre de usuario debe tener entre ${NOMBRE_USUARIO_MIN_LENGTH} y ${NOMBRE_USUARIO_MAX_LENGTH} caracteres (letras, números, "_", "-", ".").`
      }, 400);
    }

    if (db.buscarUsuarioPorEmail(email)) {
      return json(res, { error: "email_duplicado", mensaje: "El correo ya está registrado." }, 409);
    }
    if (db.buscarUsuarioPorNombreUsuario(nombreUsuario)) {
      return json(res, { error: "nombre_usuario_duplicado", mensaje: "El nombre de usuario ya está en uso." }, 409);
    }

    let usuario;
    try {
      usuario = db.crearUsuario({
        id: crypto.randomUUID(),
        email,
        passwordHash: hashPassword(password),
        nombreUsuario,
        rol: "alumno"
      });
    } catch (err) {
      // Condición de carrera: otro registro concurrente ganó el UNIQUE constraint.
      return json(res, { error: "email_duplicado", mensaje: "El correo ya está registrado." }, 409);
    }

    setUsuarioCookie(res, usuario.id);
    return json(res, { ok: true, usuario: usuarioPublico(usuario) }, 201);
  });
}

// POST /api/alumno/login — autentica con correo institucional + contraseña.
function handleLogin(req, res) {
  readJsonBody(req, res, (body) => {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      return json(res, { error: "credenciales_invalidas", mensaje: "Correo y contraseña son obligatorios." }, 400);
    }

    const usuario = db.buscarUsuarioPorEmail(email);
    // Mismo mensaje de error tanto si el usuario no existe como si la contraseña
    // es incorrecta, para no filtrar qué correos están registrados.
    if (!usuario || !verifyPassword(password, usuario.passwordHash)) {
      return json(res, { error: "credenciales_invalidas", mensaje: "Correo o contraseña incorrectos." }, 401);
    }
    if (!usuario.activo) {
      return json(res, { error: "cuenta_inactiva", mensaje: "Esta cuenta está desactivada." }, 403);
    }

    setUsuarioCookie(res, usuario.id);
    return json(res, { ok: true, usuario: usuarioPublico(usuario) });
  });
}

// POST /api/alumno/logout — limpia la cookie de sesión de cuenta.
function handleLogout(req, res) {
  res.setHeader("Set-Cookie", `${USUARIO_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return json(res, { ok: true });
}

// GET /api/alumno/me — devuelve el usuario autenticado según la cookie de sesión, o null.
function handleMe(req, res) {
  const usuario = resolverUsuarioDesdeCookie(req);
  if (!usuario) return json(res, { usuario: null });
  return json(res, { usuario: usuarioPublico(usuario) });
}

// Resuelve el usuario autenticado a partir de la cookie firmada de la request.
// Exportado para que otros handlers (p. ej. WS handshake HTTP upgrade o futuras
// rutas de partida) puedan identificar al alumno sin repetir el parseo de cookies.
function resolverUsuarioDesdeCookie(req) {
  if (!req.headers.cookie) return null;
  const match = req.headers.cookie.match(new RegExp(`${USUARIO_COOKIE_NAME}=([^;]+)`));
  if (!match || !match[1]) return null;
  const usuarioId = verifySignedId(match[1], config.COOKIE_SECRET);
  if (!usuarioId) return null;
  const usuario = db.buscarUsuarioPorId(usuarioId);
  if (!usuario || !usuario.activo) return null;
  return usuario;
}

function handleAuthApi(req, res, pathname, ctx) {
  if (req.method === "POST" && pathname === "/api/alumno/registro") {
    handleRegistro(req, res);
    return true;
  }
  if (req.method === "POST" && pathname === "/api/alumno/login") {
    handleLogin(req, res);
    return true;
  }
  if (req.method === "POST" && pathname === "/api/alumno/logout") {
    handleLogout(req, res);
    return true;
  }
  if (req.method === "GET" && pathname === "/api/alumno/me") {
    handleMe(req, res);
    return true;
  }
  if (req.method === "GET" && pathname === "/api/admin/usuarios") {
    handleListarUsuarios(req, res, ctx && ctx.adminToken);
    return true;
  }
  {
    const matchActivo = pathname.match(/^\/api\/admin\/usuarios\/([^/]+)\/activo$/);
    if (req.method === "POST" && matchActivo) {
      handleSetUsuarioActivo(req, res, matchActivo[1], ctx && ctx.adminToken);
      return true;
    }
  }
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

module.exports = { handleAuthApi, resolverUsuarioDesdeCookie, USUARIO_COOKIE_NAME };
