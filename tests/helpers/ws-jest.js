<<<<<<< HEAD
const WebSocket = require("ws");
const crypto = require("node:crypto");
const config = require("../../src/server/config");
const { signId } = require("../../src/server/infra/security");

function openWS(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

// REQ-WS-09: abre el socket con el header cookie que manda un navegador real.
// R4-001: como el navegador, el helper envía la cookie FIRMADA (el server la
// firmó vía /api/alumno/entrar) — una cookie sin firma no liga identidad.
function openWSCookie(url, cookieId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers: { cookie: `historia_quiz_id=${signId(cookieId, config.COOKIE_SECRET)}` } });
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

function createCollector(ws) {
  const messages = [];
  ws.on("message", (raw) => {
    try {
      messages.push(JSON.parse(raw));
    } catch {
      // ignorar mensajes no JSON
    }
  });
  return messages;
}

function waitFor(messages, predicate, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const found = messages.find(predicate);
      if (found) return resolve(found);
      if (Date.now() - start > timeout) {
        return reject(new Error(`Timeout esperando mensaje. Recibidos: ${JSON.stringify(messages)}`));
      }
      setTimeout(check, 30);
    };
    check();
  });
}

function waitForNone(messages, predicate, timeout = 800) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (messages.some(predicate)) {
        return reject(new Error(`Mensaje inesperado: ${JSON.stringify(messages.find(predicate))}`));
      }
      if (Date.now() - start > timeout) return resolve();
      setTimeout(check, 30);
    };
    check();
  });
}

// Espera hasta que haya `count` mensajes que cumplan `predicate`. A diferencia
// de waitFor (que devuelve el PRIMER match del array, útil para mensajes
// únicos), esta variante es imprescindible para mensajes repetidos
// (resultado/nueva_pregunta por ronda): evita que una espera resuelva con un
// mensaje viejo y dispare carreras aguas abajo.
function waitForCount(messages, predicate, count, timeout = 8000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const found = messages.filter(predicate);
      if (found.length >= count) return resolve(found);
      if (Date.now() - start > timeout) {
        return reject(new Error(`Timeout esperando ${count} mensajes, tengo ${found.length}. Recibidos: ${JSON.stringify(messages.slice(-5))}`));
      }
      setTimeout(check, 30);
    };
    check();
  });
}

async function connectDocente(wsUrl, token = "historia") {
  const ws = await openWS(wsUrl);
  const messages = createCollector(ws);
  ws.send(JSON.stringify({ tipo: "docente_conecta", token }));
  const msg = await waitFor(messages, (m) => m.tipo === "estado_inicial");
  return { ws, messages, msg };
}

const clientTokens = new Map();

async function connectAlumno(wsUrl, nombre, id = null, opts = {}) {
  // REQ-WS-09: sin id explícito el helper recorre el camino real del navegador:
  // cookie `historia_quiz_id` FRESCA por defecto; reuso SOLO con opts.cookie
  // (opt-in explícito, nunca implícito por nombre). Con id explícito (path
  // legacy) NO se manda cookie — el dispatcher pisaría msg.id.
  const cookieId = id ? null : (opts.cookie || crypto.randomUUID());
  const ws = id ? await openWS(wsUrl) : await openWSCookie(wsUrl, cookieId);
  const messages = createCollector(ws);
  const payload = { tipo: "alumno_entra", nombre };
  if (id) {
    payload.id = id;
    const token = clientTokens.get(id);
    if (token) {
      payload.token = token;
    }
  } else if (cookieId) {
    const token = clientTokens.get(cookieId);
    if (token) {
      payload.token = token;
    }
  }
  ws.send(JSON.stringify(payload));
  const msg = await waitFor(messages, (m) => m.tipo === "bienvenido");

  // Keep track of the current token
  let currentToken = msg.token;
  if (currentToken) {
    clientTokens.set(msg.id, currentToken);
  }

  // Listen to incoming messages on the test socket to update currentToken on rotation or re-auth
  ws.on("message", (raw) => {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.tipo === "auth_rechazada" && parsed.token) {
        currentToken = parsed.token;
        clientTokens.set(msg.id, currentToken);
      } else if (parsed.tipo === "nueva_pregunta" && parsed.tokensPorAlumno) {
        const myId = msg.id;
        if (parsed.tokensPorAlumno[myId]) {
          currentToken = parsed.tokensPorAlumno[myId];
          clientTokens.set(msg.id, currentToken);
        }
      }
    } catch (e) {}
  });

  // Wrap ws.send
  const originalSend = ws.send;
  ws.send = function (data, cb) {
    try {
      const parsed = JSON.parse(data);
      if (parsed.tipo !== "alumno_entra") {
        if (parsed.token === undefined) {
          parsed.token = currentToken;
        }
      }
      return originalSend.call(ws, JSON.stringify(parsed), cb);
    } catch (e) {
      return originalSend.call(ws, data, cb);
    }
  };

  return { ws, messages, msg, cookieId };
}

function closeWS(ws) {
  return new Promise((resolve) => {
    if (!ws || ws.readyState === WebSocket.CLOSED) return resolve();
    ws.once("close", resolve);
    ws.close();
  });
}

module.exports = {
  openWS,
  createCollector,
  waitFor,
  waitForNone,
  waitForCount,
  connectDocente,
  connectAlumno,
  closeWS
};
=======
const WebSocket = require("ws");
const crypto = require("node:crypto");
const config = require("../../src/server/config");
const { signId } = require("../../src/server/infra/security");

function openWS(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

// REQ-WS-09: abre el socket con el header cookie que manda un navegador real.
// R4-001: como el navegador, el helper envía la cookie FIRMADA (el server la
// firmó vía /api/alumno/entrar) — una cookie sin firma no liga identidad.
function openWSCookie(url, cookieId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers: { cookie: `historia_quiz_id=${signId(cookieId, config.COOKIE_SECRET)}` } });
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

function createCollector(ws) {
  const messages = [];
  ws.on("message", (raw) => {
    try {
      messages.push(JSON.parse(raw));
    } catch {
      // ignorar mensajes no JSON
    }
  });
  return messages;
}

function waitFor(messages, predicate, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const found = messages.find(predicate);
      if (found) return resolve(found);
      if (Date.now() - start > timeout) {
        return reject(new Error(`Timeout esperando mensaje. Recibidos: ${JSON.stringify(messages)}`));
      }
      setTimeout(check, 30);
    };
    check();
  });
}

function waitForNone(messages, predicate, timeout = 800) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (messages.some(predicate)) {
        return reject(new Error(`Mensaje inesperado: ${JSON.stringify(messages.find(predicate))}`));
      }
      if (Date.now() - start > timeout) return resolve();
      setTimeout(check, 30);
    };
    check();
  });
}

// Espera hasta que haya `count` mensajes que cumplan `predicate`. A diferencia
// de waitFor (que devuelve el PRIMER match del array, útil para mensajes
// únicos), esta variante es imprescindible para mensajes repetidos
// (resultado/nueva_pregunta por ronda): evita que una espera resuelva con un
// mensaje viejo y dispare carreras aguas abajo.
function waitForCount(messages, predicate, count, timeout = 8000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const found = messages.filter(predicate);
      if (found.length >= count) return resolve(found);
      if (Date.now() - start > timeout) {
        return reject(new Error(`Timeout esperando ${count} mensajes, tengo ${found.length}. Recibidos: ${JSON.stringify(messages.slice(-5))}`));
      }
      setTimeout(check, 30);
    };
    check();
  });
}

async function connectDocente(wsUrl, token = "historia") {
  const ws = await openWS(wsUrl);
  const messages = createCollector(ws);
  ws.send(JSON.stringify({ tipo: "docente_conecta", token }));
  const msg = await waitFor(messages, (m) => m.tipo === "estado_inicial");
  return { ws, messages, msg };
}

const clientTokens = new Map();

async function connectAlumno(wsUrl, nombre, id = null, opts = {}) {
  // REQ-WS-09: sin id explícito el helper recorre el camino real del navegador:
  // cookie `historia_quiz_id` FRESCA por defecto; reuso SOLO con opts.cookie
  // (opt-in explícito, nunca implícito por nombre). Con id explícito (path
  // legacy) NO se manda cookie — el dispatcher pisaría msg.id.
  const cookieId = id ? null : (opts.cookie || crypto.randomUUID());
  const ws = id ? await openWS(wsUrl) : await openWSCookie(wsUrl, cookieId);
  const messages = createCollector(ws);
  const payload = { tipo: "alumno_entra", nombre };
  if (id) {
    payload.id = id;
    const token = clientTokens.get(id);
    if (token) {
      payload.token = token;
    }
  } else if (cookieId) {
    const token = clientTokens.get(cookieId);
    if (token) {
      payload.token = token;
    }
  }
  ws.send(JSON.stringify(payload));
  const msg = await waitFor(messages, (m) => m.tipo === "bienvenido");

  // Keep track of the current token
  let currentToken = msg.token;
  if (currentToken) {
    clientTokens.set(msg.id, currentToken);
  }

  // Listen to incoming messages on the test socket to update currentToken on rotation or re-auth
  ws.on("message", (raw) => {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.tipo === "auth_rechazada" && parsed.token) {
        currentToken = parsed.token;
        clientTokens.set(msg.id, currentToken);
      } else if (parsed.tipo === "nueva_pregunta" && parsed.tokensPorAlumno) {
        const myId = msg.id;
        if (parsed.tokensPorAlumno[myId]) {
          currentToken = parsed.tokensPorAlumno[myId];
          clientTokens.set(msg.id, currentToken);
        }
      }
    } catch (e) {}
  });

  // Wrap ws.send
  const originalSend = ws.send;
  ws.send = function (data, cb) {
    try {
      const parsed = JSON.parse(data);
      if (parsed.tipo !== "alumno_entra") {
        if (parsed.token === undefined) {
          parsed.token = currentToken;
        }
      }
      return originalSend.call(ws, JSON.stringify(parsed), cb);
    } catch (e) {
      return originalSend.call(ws, data, cb);
    }
  };

  return { ws, messages, msg, cookieId };
}

function closeWS(ws) {
  return new Promise((resolve) => {
    if (!ws || ws.readyState === WebSocket.CLOSED) return resolve();
    ws.once("close", resolve);
    ws.close();
  });
}

module.exports = {
  openWS,
  createCollector,
  waitFor,
  waitForNone,
  waitForCount,
  connectDocente,
  connectAlumno,
  closeWS
};
>>>>>>> origin/main
