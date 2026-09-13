<<<<<<< HEAD
const crypto = require("node:crypto");
const { parse } = require("csv-parse/sync");
const { guardarDB, getCursoBancoMap, setCursoBanco, quitarCursoBanco } = require("../../infra/db");
const { parseBody } = require("../middleware/parse-body");
const { safeEq } = require("../../infra/security");
const { FASES } = require("../../domain/constants");
const logger = require("../../infra/logger");

function json(res, data, code = 200) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function generarIdUnico() {
  return "p_" + Date.now().toString(36) + "_" + crypto.randomBytes(4).toString("hex");
}

function requireAdmin(req, res, { adminToken }) {
  const token = req.headers["x-admin-token"] || "";
  if (!safeEq(token, adminToken)) {
    json(res, { error: "No autorizado" }, 401);
    return false;
  }
  return true;
}

function toStr(v) { return String(v ?? ""); }

const TIPOS_PREGUNTA = new Set(["multiple_choice", "true_false", "completion", "media"]);
const MEDIA_TIPOS = new Set(["", "image", "audio"]);

function validarPregunta(body) {
  const pregunta = toStr(body.pregunta).trim();
  if (!pregunta) return { error: "La pregunta es obligatoria" };
  const tipo = TIPOS_PREGUNTA.has(body.tipo) ? body.tipo : "multiple_choice";
  const cantidadOpciones = tipo === "true_false" ? 2 : 4;
  if (!Array.isArray(body.opciones) || body.opciones.length !== cantidadOpciones)
    return { error: `Las opciones deben ser un arreglo de ${cantidadOpciones} elementos` };
  const opciones = body.opciones.map((o) => String(o || "").trim());
  if (opciones.some((o) => !o))
    return { error: "Todas las opciones deben tener texto" };
  const correcta = Number(body.correcta);
  if (!Number.isInteger(correcta) || correcta < 0 || correcta >= cantidadOpciones)
    return { error: `La respuesta correcta debe ser un entero entre 0 y ${cantidadOpciones - 1}` };
  const epoca = toStr(body.epoca).trim() || "General";
  const materia = toStr(body.materia).trim() || "Historia";
  const mediaTipo = toStr(body.mediaTipo).trim();
  const mediaUrl = toStr(body.mediaUrl).trim();
  if (!MEDIA_TIPOS.has(mediaTipo)) return { error: "Tipo de multimedia inválido" };
  if (tipo === "media" && !mediaTipo) return { error: "La pregunta multimedia requiere imagen o audio" };
  if (mediaTipo && !mediaUrl) return { error: "La multimedia requiere una URL o archivo" };
  return { pregunta, opciones, correcta, epoca, tipo, materia, mediaTipo, mediaUrl };
}

async function handleBancosApi(req, res, pathname, { db, adminToken, state }) {
  if (!requireAdmin(req, res, { adminToken })) return;

  try {
    // ── Colección de bancos ────────────────────────────────────────────────
    if (req.method === "GET" && pathname === "/api/bancos") {
      return json(
        res,
        db.bancos.map((b) => ({
          id: b.id,
          nombre: b.nombre,
          nivel: b.nivel,
          anio: b.anio,
          tema: b.tema,
          cantidad: b.preguntas.length
        }))
      );
    }

    if (req.method === "POST" && pathname === "/api/bancos") {
      const body = await parseBody(req);
      if (!body || typeof body !== "object") return json(res, { error: "Cuerpo inválido" }, 400);
      const nombre = toStr(body.nombre).trim();
      if (!nombre) return json(res, { error: "El nombre del banco es obligatorio" }, 400);
      const nuevo = {
        id: "banco_" + crypto.randomUUID(),
        nombre,
        nivel: toStr(body.nivel).trim(),
        anio: toStr(body.anio).trim(),
        tema: toStr(body.tema).trim(),
        preguntas: []
      };
      db.bancos.push(nuevo);
      guardarDB(db);
      return json(res, nuevo, 201);
    }

    // ── Banco individual ───────────────────────────────────────────────────
    const bancoMatch = pathname.match(/^\/api\/bancos\/([^/]+)$/);
    if (bancoMatch) {
      const id = bancoMatch[1];
      const idx = db.bancos.findIndex((b) => b.id === id);
      if (idx === -1) return json(res, { error: "No encontrado" }, 404);

      if (req.method === "GET") {
        return json(res, db.bancos[idx]);
      }

      if (req.method === "PUT") {
        const body = await parseBody(req);
        if (!body || typeof body !== "object") return json(res, { error: "Cuerpo inválido" }, 400);
        const nombre = toStr(body.nombre).trim();
        if (!nombre) return json(res, { error: "El nombre del banco es obligatorio" }, 400);
        db.bancos[idx] = {
          ...db.bancos[idx],
          nombre,
          nivel: toStr(body.nivel).trim(),
          anio: toStr(body.anio).trim(),
          tema: toStr(body.tema).trim()
        };
        guardarDB(db);
        return json(res, db.bancos[idx]);
      }

      if (req.method === "DELETE") {
        // R3-004: solo bloquear si hay una pregunta en vuelo (PREGUNTA).
        // En FIN/RESULTADO las preguntas ya no están en juego y se puede
        // borrar el banco sin dejar la partida huérfana.
        if (state && state.estado && state.estado.fase === FASES.PREGUNTA) {
          const target = db.bancos[idx];
          const bancoPregIds = new Set(target.preguntas.map((p) => p.id));
          const enUso = state.estado.preguntasActivas.some((p) => bancoPregIds.has(p.id));
          if (enUso) {
            return json(res, {
              error: "banco_en_uso",
              pregunta_count: bancoPregIds.size
            }, 409);
          }
        }
        db.bancos.splice(idx, 1);
        guardarDB(db);
        return json(res, { ok: true });
      }
    }

    // ── Preguntas de un banco ──────────────────────────────────────────────
    const preguntaMatch = pathname.match(/^\/api\/bancos\/([^/]+)\/preguntas(?:\/([^/]+))?$/);
    if (preguntaMatch) {
      const [, bancoId, preguntaId] = preguntaMatch;
      const banco = db.bancos.find((b) => b.id === bancoId);
      if (!banco) return json(res, { error: "No encontrado" }, 404);

      if (req.method === "POST" && !preguntaId) {
        const body = await parseBody(req);
        if (!body || typeof body !== "object") return json(res, { error: "Cuerpo inválido" }, 400);
        const v = validarPregunta(body);
        if (v.error) return json(res, { error: v.error }, 400);
        const nueva = { id: generarIdUnico(), ...v };
        banco.preguntas.push(nueva);
        guardarDB(db);
        return json(res, nueva, 201);
      }

      if (preguntaId) {
        const idx = banco.preguntas.findIndex((q) => q.id === preguntaId);
        if (idx === -1) return json(res, { error: "Pregunta no encontrada" }, 404);

        if (req.method === "PUT") {
          const body = await parseBody(req);
          if (!body || typeof body !== "object") return json(res, { error: "Cuerpo inválido" }, 400);
          const v = validarPregunta(body);
          if (v.error) return json(res, { error: v.error }, 400);
          banco.preguntas[idx] = { id: preguntaId, ...v };
          guardarDB(db);
          return json(res, banco.preguntas[idx]);
        }

        if (req.method === "DELETE") {
          banco.preguntas.splice(idx, 1);
          guardarDB(db);
          return json(res, { ok: true });
        }
      }
    }

    // ── Importar CSV ───────────────────────────────────────────────────────
    const csvMatch = pathname.match(/^\/api\/bancos\/([^/]+)\/importar-csv$/);
    if (csvMatch && req.method === "POST") {
      const banco = db.bancos.find((b) => b.id === csvMatch[1]);
      if (!banco) return json(res, { error: "No encontrado" }, 404);
      const body = await parseBody(req);
      if (!body || typeof body !== "object") return json(res, { error: "Cuerpo inválido" }, 400);

      const letras = { A: 0, B: 1, C: 2, D: 3 };
      let importadas = 0;
      let omitidas = 0;
      const errores = [];

      // R3-005: parser hand-rolled reemplazado por csv-parse (RFC 4180).
      // Maneja correctamente "" escapes, ; dentro de comillas, y celdas
      // multi-línea. La columna correcta acepta solo letras A/B/C/D.
      // csv-parse con relax_column_count: true casi nunca throwea; el
      // per-row cols.length !== 7 cubre los casos de columnas incorrectas.
      // Si el CSV entero está malformado (p.ej. comilla sin cerrar que
      // rompe el stream), propagamos el error al try/catch exterior que
      // devuelve 500 — un CSV totalmente inválido no debe importarse en
      // absoluto.
      const HEADER_LINE_COUNT = 1;
      const filas = parse(String(body.csv || ""), {
        delimiter: ";",
        columns: false,
        relax_column_count: true,
        from_line: HEADER_LINE_COUNT + 1,
        skip_empty_lines: true
      });

      filas.forEach((cols, i) => {
        const linea = i + HEADER_LINE_COUNT + 1;
        if (cols.length !== 7) { omitidas++; errores.push({ linea, motivo: `columnas=${cols.length}` }); return; }
        const [pregunta, opA, opB, opC, opD, cLetra, epoca] = cols.map((c) => String(c ?? "").trim());
        if (!pregunta || !opA || !opB || !opC || !opD) { omitidas++; errores.push({ linea, motivo: "campos_vacios" }); return; }
        const cUpper = (cLetra || "A").toUpperCase();
        // Object.hasOwn (no `in`) para evitar prototype keys como "toString"
        // que escribirían un Function en pregunta.correcta.
        if (!Object.hasOwn(letras, cUpper)) { omitidas++; errores.push({ linea, motivo: `correcta_invalida=${cLetra}` }); return; }
        banco.preguntas.push({
          id: generarIdUnico(),
          pregunta,
          opciones: [opA, opB, opC, opD],
          correcta: letras[cUpper],
          epoca: epoca || "General"
        });
        importadas++;
      });
      guardarDB(db);
      return json(res, { importadas, omitidas, errores });
    }

    // ── Importar JSON ──────────────────────────────────────────────────────
    const jsonMatch = pathname.match(/^\/api\/bancos\/([^/]+)\/importar-json$/);
    if (jsonMatch && req.method === "POST") {
      const banco = db.bancos.find((b) => b.id === jsonMatch[1]);
      if (!banco) return json(res, { error: "No encontrado" }, 404);
      const body = await parseBody(req);
      if (!body || !Array.isArray(body.preguntas))
        return json(res, { error: "Se esperaba un objeto con un arreglo de preguntas" }, 400);
      for (const q of body.preguntas) {
        const v = validarPregunta(q);
        if (v.error) return json(res, { error: v.error }, 400);
      }
      body.preguntas.forEach((q) => {
        const v = validarPregunta(q);
        banco.preguntas.push({ id: generarIdUnico(), ...v });
      });
      guardarDB(db);
      return json(res, { importadas: body.preguntas.length });
    }

    if (req.method === "GET" && pathname === "/api/curso-banco") {
      return json(res, { mapa: getCursoBancoMap() });
    }

    if (req.method === "POST" && pathname === "/api/curso-banco") {
      const body = await parseBody(req);
      if (!body || typeof body !== "object") return json(res, { error: "Cuerpo inválido" }, 400);
      const curso = toStr(body.curso).trim();
      const bancoId = toStr(body.bancoId).trim();
      if (!curso) return json(res, { error: "El curso es obligatorio" }, 400);
      if (!bancoId) return json(res, { error: "El bancoId es obligatorio" }, 400);
      if (!db.bancos.some((b) => b.id === bancoId)) {
        return json(res, { error: "No existe un banco con ese id" }, 404);
      }
      const mapa = setCursoBanco(curso, bancoId);
      return json(res, { mapa });
    }

    if (req.method === "DELETE" && pathname === "/api/curso-banco") {
      const body = await parseBody(req);
      const curso = toStr(body && body.curso).trim();
      if (!curso) return json(res, { error: "El curso es obligatorio" }, 400);
      const mapa = quitarCursoBanco(curso);
      return json(res, { mapa });
    }

    return json(res, { error: "Ruta no encontrada" }, 404);
  } catch (err) {
    if (err.message === "PAYLOAD_TOO_LARGE") {
      return json(res, { error: "El cuerpo de la solicitud excede el límite de 512 KB" }, 413);
    }
    logger.error({ err }, "API Error en bancos");
    return json(res, { error: "Error al procesar la solicitud" }, 500);
  }
}

module.exports = { handleBancosApi };
=======
const crypto = require("node:crypto");
const { parse } = require("csv-parse/sync");
const { guardarDB } = require("../../infra/db");
const { parseBody } = require("../middleware/parse-body");
const { safeEq } = require("../../infra/security");
const { FASES } = require("../../domain/constants");
const logger = require("../../infra/logger");

function json(res, data, code = 200) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function generarIdUnico() {
  return "p_" + Date.now().toString(36) + "_" + crypto.randomBytes(4).toString("hex");
}

function requireAdmin(req, res, { adminToken }) {
  const token = req.headers["x-admin-token"] || "";
  if (!safeEq(token, adminToken)) {
    json(res, { error: "No autorizado" }, 401);
    return false;
  }
  return true;
}

function toStr(v) { return String(v ?? ""); }

function validarPregunta(body) {
  const pregunta = toStr(body.pregunta).trim();
  if (!pregunta) return { error: "La pregunta es obligatoria" };
  if (!Array.isArray(body.opciones) || body.opciones.length !== 4)
    return { error: "Las opciones deben ser un arreglo de 4 elementos" };
  const opciones = body.opciones.map((o) => String(o || "").trim());
  if (opciones.some((o) => !o))
    return { error: "Todas las opciones deben tener texto" };
  const correcta = Number(body.correcta);
  if (!Number.isInteger(correcta) || correcta < 0 || correcta > 3)
    return { error: "La respuesta correcta debe ser un entero entre 0 y 3" };
  const epoca = toStr(body.epoca).trim() || "General";
  return { pregunta, opciones, correcta, epoca };
}

async function handleBancosApi(req, res, pathname, { db, adminToken, state }) {
  if (!requireAdmin(req, res, { adminToken })) return;

  try {
    // ── Colección de bancos ────────────────────────────────────────────────
    if (req.method === "GET" && pathname === "/api/bancos") {
      return json(
        res,
        db.bancos.map((b) => ({
          id: b.id,
          nombre: b.nombre,
          nivel: b.nivel,
          anio: b.anio,
          tema: b.tema,
          cantidad: b.preguntas.length
        }))
      );
    }

    if (req.method === "POST" && pathname === "/api/bancos") {
      const body = await parseBody(req);
      if (!body || typeof body !== "object") return json(res, { error: "Cuerpo inválido" }, 400);
      const nombre = toStr(body.nombre).trim();
      if (!nombre) return json(res, { error: "El nombre del banco es obligatorio" }, 400);
      const nuevo = {
        id: "banco_" + crypto.randomUUID(),
        nombre,
        nivel: toStr(body.nivel).trim(),
        anio: toStr(body.anio).trim(),
        tema: toStr(body.tema).trim(),
        preguntas: []
      };
      db.bancos.push(nuevo);
      guardarDB(db);
      return json(res, nuevo, 201);
    }

    // ── Banco individual ───────────────────────────────────────────────────
    const bancoMatch = pathname.match(/^\/api\/bancos\/([^/]+)$/);
    if (bancoMatch) {
      const id = bancoMatch[1];
      const idx = db.bancos.findIndex((b) => b.id === id);
      if (idx === -1) return json(res, { error: "No encontrado" }, 404);

      if (req.method === "GET") {
        return json(res, db.bancos[idx]);
      }

      if (req.method === "PUT") {
        const body = await parseBody(req);
        if (!body || typeof body !== "object") return json(res, { error: "Cuerpo inválido" }, 400);
        const nombre = toStr(body.nombre).trim();
        if (!nombre) return json(res, { error: "El nombre del banco es obligatorio" }, 400);
        db.bancos[idx] = {
          ...db.bancos[idx],
          nombre,
          nivel: toStr(body.nivel).trim(),
          anio: toStr(body.anio).trim(),
          tema: toStr(body.tema).trim()
        };
        guardarDB(db);
        return json(res, db.bancos[idx]);
      }

      if (req.method === "DELETE") {
        // R3-004: solo bloquear si hay una pregunta en vuelo (PREGUNTA).
        // En FIN/RESULTADO las preguntas ya no están en juego y se puede
        // borrar el banco sin dejar la partida huérfana.
        if (state && state.estado && state.estado.fase === FASES.PREGUNTA) {
          const target = db.bancos[idx];
          const bancoPregIds = new Set(target.preguntas.map((p) => p.id));
          const enUso = state.estado.preguntasActivas.some((p) => bancoPregIds.has(p.id));
          if (enUso) {
            return json(res, {
              error: "banco_en_uso",
              pregunta_count: bancoPregIds.size
            }, 409);
          }
        }
        db.bancos.splice(idx, 1);
        guardarDB(db);
        return json(res, { ok: true });
      }
    }

    // ── Preguntas de un banco ──────────────────────────────────────────────
    const preguntaMatch = pathname.match(/^\/api\/bancos\/([^/]+)\/preguntas(?:\/([^/]+))?$/);
    if (preguntaMatch) {
      const [, bancoId, preguntaId] = preguntaMatch;
      const banco = db.bancos.find((b) => b.id === bancoId);
      if (!banco) return json(res, { error: "No encontrado" }, 404);

      if (req.method === "POST" && !preguntaId) {
        const body = await parseBody(req);
        if (!body || typeof body !== "object") return json(res, { error: "Cuerpo inválido" }, 400);
        const v = validarPregunta(body);
        if (v.error) return json(res, { error: v.error }, 400);
        const nueva = { id: generarIdUnico(), ...v };
        banco.preguntas.push(nueva);
        guardarDB(db);
        return json(res, nueva, 201);
      }

      if (preguntaId) {
        const idx = banco.preguntas.findIndex((q) => q.id === preguntaId);
        if (idx === -1) return json(res, { error: "Pregunta no encontrada" }, 404);

        if (req.method === "PUT") {
          const body = await parseBody(req);
          if (!body || typeof body !== "object") return json(res, { error: "Cuerpo inválido" }, 400);
          const v = validarPregunta(body);
          if (v.error) return json(res, { error: v.error }, 400);
          banco.preguntas[idx] = { id: preguntaId, ...v };
          guardarDB(db);
          return json(res, banco.preguntas[idx]);
        }

        if (req.method === "DELETE") {
          banco.preguntas.splice(idx, 1);
          guardarDB(db);
          return json(res, { ok: true });
        }
      }
    }

    // ── Importar CSV ───────────────────────────────────────────────────────
    const csvMatch = pathname.match(/^\/api\/bancos\/([^/]+)\/importar-csv$/);
    if (csvMatch && req.method === "POST") {
      const banco = db.bancos.find((b) => b.id === csvMatch[1]);
      if (!banco) return json(res, { error: "No encontrado" }, 404);
      const body = await parseBody(req);
      if (!body || typeof body !== "object") return json(res, { error: "Cuerpo inválido" }, 400);

      const letras = { A: 0, B: 1, C: 2, D: 3 };
      let importadas = 0;
      let omitidas = 0;
      const errores = [];

      // R3-005: parser hand-rolled reemplazado por csv-parse (RFC 4180).
      // Maneja correctamente "" escapes, ; dentro de comillas, y celdas
      // multi-línea. La columna correcta acepta solo letras A/B/C/D.
      // csv-parse con relax_column_count: true casi nunca throwea; el
      // per-row cols.length !== 7 cubre los casos de columnas incorrectas.
      // Si el CSV entero está malformado (p.ej. comilla sin cerrar que
      // rompe el stream), propagamos el error al try/catch exterior que
      // devuelve 500 — un CSV totalmente inválido no debe importarse en
      // absoluto.
      const HEADER_LINE_COUNT = 1;
      const filas = parse(String(body.csv || ""), {
        delimiter: ";",
        columns: false,
        relax_column_count: true,
        from_line: HEADER_LINE_COUNT + 1,
        skip_empty_lines: true
      });

      filas.forEach((cols, i) => {
        const linea = i + HEADER_LINE_COUNT + 1;
        if (cols.length !== 7) { omitidas++; errores.push({ linea, motivo: `columnas=${cols.length}` }); return; }
        const [pregunta, opA, opB, opC, opD, cLetra, epoca] = cols.map((c) => String(c ?? "").trim());
        if (!pregunta || !opA || !opB || !opC || !opD) { omitidas++; errores.push({ linea, motivo: "campos_vacios" }); return; }
        const cUpper = (cLetra || "A").toUpperCase();
        // Object.hasOwn (no `in`) para evitar prototype keys como "toString"
        // que escribirían un Function en pregunta.correcta.
        if (!Object.hasOwn(letras, cUpper)) { omitidas++; errores.push({ linea, motivo: `correcta_invalida=${cLetra}` }); return; }
        banco.preguntas.push({
          id: generarIdUnico(),
          pregunta,
          opciones: [opA, opB, opC, opD],
          correcta: letras[cUpper],
          epoca: epoca || "General"
        });
        importadas++;
      });
      guardarDB(db);
      return json(res, { importadas, omitidas, errores });
    }

    // ── Importar JSON ──────────────────────────────────────────────────────
    const jsonMatch = pathname.match(/^\/api\/bancos\/([^/]+)\/importar-json$/);
    if (jsonMatch && req.method === "POST") {
      const banco = db.bancos.find((b) => b.id === jsonMatch[1]);
      if (!banco) return json(res, { error: "No encontrado" }, 404);
      const body = await parseBody(req);
      if (!body || !Array.isArray(body.preguntas))
        return json(res, { error: "Se esperaba un objeto con un arreglo de preguntas" }, 400);
      for (const q of body.preguntas) {
        const v = validarPregunta(q);
        if (v.error) return json(res, { error: v.error }, 400);
      }
      body.preguntas.forEach((q) => {
        const v = validarPregunta(q);
        banco.preguntas.push({ id: generarIdUnico(), ...v });
      });
      guardarDB(db);
      return json(res, { importadas: body.preguntas.length });
    }

    return json(res, { error: "Ruta no encontrada" }, 404);
  } catch (err) {
    if (err.message === "PAYLOAD_TOO_LARGE") {
      return json(res, { error: "El cuerpo de la solicitud excede el límite de 512 KB" }, 413);
    }
    logger.error({ err }, "API Error en bancos");
    return json(res, { error: "Error al procesar la solicitud" }, 500);
  }
}

module.exports = { handleBancosApi };
>>>>>>> origin/main
