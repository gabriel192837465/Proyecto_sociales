<<<<<<< HEAD
import { state, setWS, setMiNombre, setMiRespuesta, setMiPuntaje, setPendienteEnvio, setSessionToken, setCodigoPartida, setCuenta } from "./state.js";
import { conectar, manejarMensaje, enviar } from "./socket.js";
import { setPantalla } from "./views.js";
import { setAutoReconnectEnabled } from "../../shared/socket-client.js";
import { esc } from "../../shared/dom.js";

// ── Cuenta de alumno (secciones 3-9) ────────────────────────────────────
function mostrarErrorCuenta(elId, texto) {
  const el = document.getElementById(elId);
  if (el) { el.textContent = texto; el.style.display = "block"; }
}
function ocultarErrorCuenta(elId) {
  const el = document.getElementById(elId);
  if (el) el.style.display = "none";
}

const mostrarTabLogin = () => {
  document.getElementById("tab-login")?.classList.add("activa");
  document.getElementById("tab-registro")?.classList.remove("activa");
  const fl = document.getElementById("form-login"); if (fl) fl.style.display = "block";
  const fr = document.getElementById("form-registro"); if (fr) fr.style.display = "none";
};

const mostrarTabRegistro = () => {
  document.getElementById("tab-registro")?.classList.add("activa");
  document.getElementById("tab-login")?.classList.remove("activa");
  const fl = document.getElementById("form-login"); if (fl) fl.style.display = "none";
  const fr = document.getElementById("form-registro"); if (fr) fr.style.display = "block";
};

// Pasa a la pantalla de código, mostrando el nombre de la cuenta autenticada
// (sección 7: "una vez autenticado, el alumno no vuelve a introducir su nombre").
function irAPantallaCodigo(usuario) {
  setCuenta(usuario);
  setMiNombre(usuario.nombreUsuario);
  const disp = document.getElementById("cuenta-nombre-display");
  if (disp) disp.textContent = usuario.nombreUsuario;
  const inputCodigo = document.getElementById("input-codigo");
  if (inputCodigo) inputCodigo.focus();
  setPantalla("s-unirse");
}

const login = async () => {
  ocultarErrorCuenta("error-login");
  const email = (document.getElementById("login-email")?.value || "").trim();
  const password = document.getElementById("login-password")?.value || "";
  const btn = document.getElementById("btn-login");
  if (btn) btn.disabled = true;
  try {
    const res = await fetch("/api/alumno/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      mostrarErrorCuenta("error-login", data.mensaje || "No se pudo iniciar sesión.");
      return;
    }
    irAPantallaCodigo(data.usuario);
  } catch (err) {
    mostrarErrorCuenta("error-login", "Error al conectar con el servidor.");
  } finally {
    if (btn) btn.disabled = false;
  }
};

const registro = async () => {
  ocultarErrorCuenta("error-registro");
  const email = (document.getElementById("registro-email")?.value || "").trim();
  const nombreUsuario = (document.getElementById("registro-nombre-usuario")?.value || "").trim();
  const password = document.getElementById("registro-password")?.value || "";
  const btn = document.getElementById("btn-registro");
  if (btn) btn.disabled = true;
  try {
    const res = await fetch("/api/alumno/registro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, nombreUsuario, password })
    });
    const data = await res.json();
    if (!res.ok) {
      mostrarErrorCuenta("error-registro", data.mensaje || "No se pudo crear la cuenta.");
      return;
    }
    irAPantallaCodigo(data.usuario);
  } catch (err) {
    mostrarErrorCuenta("error-registro", "Error al conectar con el servidor.");
  } finally {
    if (btn) btn.disabled = false;
  }
};

const cerrarSesion = async () => {
  try { await fetch("/api/alumno/logout", { method: "POST" }); } catch (e) {}
  setCuenta(null);
  setMiNombre("");
  setAutoReconnectEnabled(false);
  if (state.ws) { state.ws.close(); setWS(null); }
  setPantalla("s-cuenta");
  document.getElementById("account-panel")?.classList.add("visible");
  mostrarTabLogin();
};

const mostrarCuenta = () => {
  if (state.cuenta) {
    irAPantallaCodigo(state.cuenta);
    return;
  }
  setPantalla("s-cuenta");
  const panel = document.getElementById("account-panel");
  panel?.classList.add("visible");
  if (panel?.scrollIntoView) panel.scrollIntoView({ behavior: "smooth", block: "center" });
  document.getElementById("login-email")?.focus();
};

const mostrarCuentaCodigo = () => {
  if (state.cuenta) {
    irAPantallaCodigo(state.cuenta);
    return;
  }
  mostrarCuenta();
};

const volverInicio = () => setPantalla("s-cuenta");

const salirPartida = () => {
  setAutoReconnectEnabled(false);
  if (state.ws) {
    state.ws.close();
    setWS(null);
  }
  setSessionToken("");
  setCodigoPartida("");
  try {
    localStorage.removeItem("historia_quiz_token");
    localStorage.removeItem("historia_quiz_codigo");
  } catch (e) {}
  setMiRespuesta(null);
  setPendienteEnvio(false);
  setPantalla("s-cuenta");
};

function leerResumen() {
  try { return JSON.parse(localStorage.getItem("historia_quiz_resumen") || "null"); } catch (e) { return null; }
}

function mostrarSeccion(id) {
  const resumen = leerResumen();
  if (id === "s-ranking") {
    const lista = document.getElementById("nav-ranking-list");
    if (lista) lista.innerHTML = resumen?.ranking?.length
      ? resumen.ranking.map((jugador, index) => `<div class="rank-item ${jugador.nombre === state.miNombre ? "rank-yo" : ""}"><span class="rank-pos">${index + 1}°</span><span class="ranking-nombre">${esc(jugador.nombre)}</span><span class="ranking-pts">${esc(String(jugador.puntaje))} pts</span></div>`).join("")
      : '<p class="empty-nav-state">Jugá una partida para aparecer en el ranking.</p>';
    const puntaje = document.getElementById("nav-ranking-puntaje");
    if (puntaje) puntaje.textContent = String(resumen?.puntaje ?? state.miPuntaje ?? 0);
  }
  if (id === "s-perfil") {
    const nombre = document.getElementById("perfil-nombre");
    const puntos = document.getElementById("perfil-puntos");
    const partidas = document.getElementById("perfil-partidas");
    const aciertos = document.getElementById("perfil-aciertos");
    if (nombre) nombre.textContent = state.miNombre || "Tu perfil";
    if (puntos) puntos.textContent = String(resumen?.puntaje ?? state.miPuntaje ?? 0);
    if (partidas) partidas.textContent = String(resumen?.partidas ?? (resumen ? 1 : 0));
    if (aciertos) aciertos.textContent = resumen?.aciertos || "0%";
  }
  setPantalla(id);
}

const mostrarPartidas = () => mostrarSeccion("s-partidas");
const mostrarRanking = () => mostrarSeccion("s-ranking");
const mostrarPerfil = () => mostrarSeccion("s-perfil");
const jugarIndividual = () => mostrarCuentaCodigo();
const continuarRecorrido = () => mostrarPartidas();
const usarCodigo = (inputId, errorId) => {
  const input = document.getElementById(inputId);
  const codigo = (input?.value || "").replace(/\D/g, "");
  if (codigo.length !== 6) {
    const error = document.getElementById(errorId);
    if (error) error.textContent = "Ingresá un código de 6 dígitos.";
    return;
  }
  const error = document.getElementById(errorId);
  if (error) error.textContent = "";
  const destino = document.getElementById("input-codigo");
  if (destino) destino.value = codigo;
  mostrarCuentaCodigo();
};
const usarCodigoNav = () => usarCodigo("nav-input-codigo", "nav-code-error");
const usarCodigoInicio = () => usarCodigo("home-input-codigo", "home-code-error");

// ── Local Actions ─────────────────────────────────────────────────────────
const entrar = async () => {
  const inputCodigo = document.getElementById("input-codigo");
  const codigo = (inputCodigo ? inputCodigo.value : "").trim();
  if (!/^\d{6}$/.test(codigo)) {
    const errEl = document.getElementById("error-nombre");
    if (errEl) { errEl.textContent = "Ingresá el código de 6 dígitos que te dio el docente."; errEl.style.display = "block"; }
    return;
  }
  setCodigoPartida(codigo);
  const nombre = state.miNombre;
  if (!nombre) return;
  // REQ-UI-08 (D3): acción explícita del usuario → re-habilita la
  // auto-reconexión compartida (un error_nombre previo la deshabilitó).
  setAutoReconnectEnabled(true);
  const btnEntrar = document.getElementById("btn-entrar");
  if (btnEntrar) btnEntrar.disabled = true;
  const errEl = document.getElementById("error-nombre");
  if (errEl) errEl.style.display = "none";

  try {
    const res = await fetch("/api/alumno/entrar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre })
    });
    if (!res.ok) throw new Error("Error en el login");
  } catch (err) {
    if (btnEntrar) btnEntrar.disabled = false;
    if (errEl) { errEl.innerText = "Error al conectar con el servidor"; errEl.style.display = "block"; }
    return;
  }

  conectar();
  enviar({ tipo: "alumno_entra", nombre, codigo });
};

const responder = (opcion) => {
  if (state.miRespuesta !== null) return;
  setMiRespuesta(opcion);
  setPendienteEnvio(true);
  ["op-0", "op-1", "op-2", "op-3"].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = true;
      el.classList.add("disabled");
      if (i === opcion) el.classList.add("seleccionada");
    }
  });
  enviar({ tipo: "respuesta", opcion });
  setPantalla("s-respondio");
};

const volverAlLobby = () => {
  setMiPuntaje(0);
  setMiRespuesta(null);
  setPendienteEnvio(false);
  setPantalla("s-espera");
};

const toggleCambiarNombre = () => {
  const row = document.getElementById("cambiar-nombre-row");
  const input = document.getElementById("input-cambiar-nombre");
  if (!row || !input) return;
  if (row.style.display === "none") {
    row.style.display = "flex";
    input.value = state.miNombre;
    input.focus();
  } else {
    row.style.display = "none";
  }
};

const cambiarNombre = () => {
  const input = document.getElementById("input-cambiar-nombre");
  if (!input) return;
  const nuevo = input.value.trim();
  if (!nuevo || nuevo === state.miNombre) {
    const row = document.getElementById("cambiar-nombre-row");
    if (row) row.style.display = "none";
    return;
  }
  enviar({ tipo: "cambiar_nombre", nombre: nuevo });
  const row = document.getElementById("cambiar-nombre-row");
  if (row) row.style.display = "none";
};

// Expose globally only during unit tests
if (typeof window !== "undefined" && typeof jest !== "undefined") {
  window.entrar = entrar;
  window.responder = responder;
  window.volverAlLobby = volverAlLobby;
  window.toggleCambiarNombre = toggleCambiarNombre;
  window.cambiarNombre = cambiarNombre;
  window.login = login;
  window.registro = registro;
  window.cerrarSesion = cerrarSesion;
  window.mostrarCuenta = mostrarCuenta;
  window.mostrarCuentaCodigo = mostrarCuentaCodigo;
  window.volverInicio = volverInicio;
  window.salirPartida = salirPartida;
  window.mostrarPartidas = mostrarPartidas;
  window.mostrarRanking = mostrarRanking;
  window.mostrarPerfil = mostrarPerfil;
}

// ── Event Delegation ──────────────────────────────────────────────────────
document.addEventListener("click", (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  switch (action) {
    case "entrar":
      if (typeof window !== "undefined" && typeof window.entrar === "function") {
        window.entrar();
      } else {
        entrar();
      }
      break;
    case "login":
      (typeof window !== "undefined" && typeof window.login === "function" ? window.login : login)();
      break;
    case "registro":
      (typeof window !== "undefined" && typeof window.registro === "function" ? window.registro : registro)();
      break;
    case "cerrar-sesion":
      (typeof window !== "undefined" && typeof window.cerrarSesion === "function" ? window.cerrarSesion : cerrarSesion)();
      break;
    case "mostrar-cuenta":
      (typeof window !== "undefined" && typeof window.mostrarCuenta === "function" ? window.mostrarCuenta : mostrarCuenta)();
      break;
    case "mostrar-cuenta-codigo":
      (typeof window !== "undefined" && typeof window.mostrarCuentaCodigo === "function" ? window.mostrarCuentaCodigo : mostrarCuentaCodigo)();
      break;
    case "volver-inicio":
      (typeof window !== "undefined" && typeof window.volverInicio === "function" ? window.volverInicio : volverInicio)();
      break;
    case "salir-partida":
      (typeof window !== "undefined" && typeof window.salirPartida === "function" ? window.salirPartida : salirPartida)();
      break;
    case "mostrar-partidas": mostrarPartidas(); break;
    case "mostrar-ranking": mostrarRanking(); break;
    case "mostrar-perfil": mostrarPerfil(); break;
    case "jugar-individual": jugarIndividual(); break;
    case "continuar-recorrido": continuarRecorrido(); break;
    case "usar-codigo-nav": usarCodigoNav(); break;
    case "usar-codigo-inicio": usarCodigoInicio(); break;
    case "mostrar-tab-login":
      mostrarTabLogin();
      break;
    case "mostrar-tab-registro":
      mostrarTabRegistro();
      break;
    case "responder":
      const index = parseInt(target.dataset.index, 10);
      if (!isNaN(index)) {
        if (typeof window !== "undefined" && typeof window.responder === "function") {
          window.responder(index);
        } else {
          responder(index);
        }
      }
      break;
    case "toggle-cambiar-nombre":
      if (typeof window !== "undefined" && typeof window.toggleCambiarNombre === "function") {
        window.toggleCambiarNombre();
      } else {
        toggleCambiarNombre();
      }
      break;
    case "cambiar-nombre":
      if (typeof window !== "undefined" && typeof window.cambiarNombre === "function") {
        window.cambiarNombre();
      } else {
        cambiarNombre();
      }
      break;
    case "volver-al-lobby":
      if (typeof window !== "undefined" && typeof window.volverAlLobby === "function") {
        window.volverAlLobby();
      } else {
        volverAlLobby();
      }
      break;
  }
});

// ── Keyboard Listeners ────────────────────────────────────────────────────
const inputCodigo = document.getElementById("input-codigo");
if (inputCodigo) {
  inputCodigo.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (typeof window !== "undefined" && typeof window.entrar === "function") {
        window.entrar();
      } else {
        entrar();
      }
    }
  });
}

const navCodigoInputs = [
  ["nav-input-codigo", "usar-codigo-nav"],
  ["home-input-codigo", "usar-codigo-inicio"]
];
navCodigoInputs.forEach(([inputId, action]) => {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (action === "usar-codigo-nav") usarCodigoNav();
    else usarCodigoInicio();
  });
});

const loginPasswordInput = document.getElementById("login-password");
if (loginPasswordInput) {
  loginPasswordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      (typeof window !== "undefined" && typeof window.login === "function" ? window.login : login)();
    }
  });
}

const registroPasswordInput = document.getElementById("registro-password");
if (registroPasswordInput) {
  registroPasswordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      (typeof window !== "undefined" && typeof window.registro === "function" ? window.registro : registro)();
    }
  });
}

const inputCambiarNombre = document.getElementById("input-cambiar-nombre");
if (inputCambiarNombre) {
  inputCambiarNombre.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (typeof window !== "undefined" && typeof window.cambiarNombre === "function") {
        window.cambiarNombre();
      } else {
        cambiarNombre();
      }
    }
  });
}

/**
 * Re-habilita las 4 opciones de respuesta y remueve la marca
 * `.seleccionada`. No toca `state.miRespuesta` — el caller decide
 * si resetearla (típicamente sólo en `opcion_invalida`).
 */
export { restaurarOpciones } from "./views.js";

// ── Auto-reconnect ────────────────────────────────────────────────────────
// Al cargar la página: 1) resolver si hay una cuenta autenticada (cookie de
// sesión), 2) si hay una partida en curso guardada (nombre+token+código),
// reconectar directo saltando ambas pantallas.
(async function inicializar() {
  let usuario = null;
  try {
    const res = await fetch("/api/alumno/me");
    if (res.ok) {
      const data = await res.json();
      usuario = data.usuario || null;
    }
  } catch (e) { /* sin conexión: se resuelve al reintentar login manual */ }

  const codigoDesdeUrl = new URLSearchParams(window.location.search).get("codigo") || "";
  const savedCodigo = (codigoDesdeUrl.match(/^\d{6}$/) ? codigoDesdeUrl : localStorage.getItem("historia_quiz_codigo") || "").trim();
  const savedName = usuario ? usuario.nombreUsuario : localStorage.getItem("historia_quiz_nombre");

  if (/^\d{6}$/.test(codigoDesdeUrl)) {
    localStorage.setItem("historia_quiz_codigo", codigoDesdeUrl);
    const inputCodigo = document.getElementById("input-codigo");
    if (inputCodigo) inputCodigo.value = codigoDesdeUrl;
  }

  if (usuario) {
    setCuenta(usuario);
    irAPantallaCodigo(usuario);
    const inputCodigo = document.getElementById("input-codigo");
    if (inputCodigo && savedCodigo) inputCodigo.value = savedCodigo;
  }

  if (codigoDesdeUrl && !/^\d{6}$/.test(codigoDesdeUrl)) {
    const error = document.getElementById("home-code-error");
    if (error) error.textContent = "El código del QR no es válido.";
  }

  if (!savedName || !savedCodigo) return;

  const savedToken = sessionStorage.getItem("historia_quiz_token") || localStorage.getItem("historia_quiz_token");
  if (savedToken) {
    setSessionToken(savedToken);
  }

  setMiNombre(savedName);
  setCodigoPartida(savedCodigo);
  entrar_reconexion();
})();

// Variante de `entrar()` usada sólo por la auto-reconexión: no depende del
// input del DOM (la sesión guardada ya tiene nombre+código), pero sí repite
// el paso HTTP de `/api/alumno/entrar` (fija la cookie anónima de jugador
// antes de abrir el WS, igual que el flujo manual).
async function entrar_reconexion() {
  try {
    const res = await fetch("/api/alumno/entrar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: state.miNombre })
    });
    if (!res.ok) return;
  } catch (e) {
    return;
  }
  conectar();
  enviar({ tipo: "alumno_entra", nombre: state.miNombre, codigo: state.codigoPartida });
}
=======
import { state, setWS, setMiNombre, setMiRespuesta, setMiPuntaje, setPendienteEnvio, setSessionToken } from "./state.js";
import { conectar, manejarMensaje, enviar } from "./socket.js";
import { setPantalla } from "./views.js";
import { setAutoReconnectEnabled } from "../../shared/socket-client.js";

// ── Local Actions ─────────────────────────────────────────────────────────
const entrar = async () => {
  const nombreDisplayEl = document.getElementById("input-nombre");
  if (!nombreDisplayEl) return;
  const nombre = nombreDisplayEl.value.trim();
  if (!nombre) return;
  setMiNombre(nombre);
  // REQ-UI-08 (D3): acción explícita del usuario → re-habilita la
  // auto-reconexión compartida (un error_nombre previo la deshabilitó).
  setAutoReconnectEnabled(true);
  const btnEntrar = document.getElementById("btn-entrar");
  if (btnEntrar) btnEntrar.disabled = true;
  const errEl = document.getElementById("error-nombre");
  if (errEl) errEl.style.display = "none";

  try {
    const res = await fetch("/api/alumno/entrar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre })
    });
    if (!res.ok) throw new Error("Error en el login");
  } catch (err) {
    if (btnEntrar) btnEntrar.disabled = false;
    if (errEl) { errEl.innerText = "Error al conectar con el servidor"; errEl.style.display = "block"; }
    return;
  }

  conectar();
  enviar({ tipo: "alumno_entra", nombre });
};

const responder = (opcion) => {
  if (state.miRespuesta !== null) return;
  setMiRespuesta(opcion);
  setPendienteEnvio(true);
  ["op-0", "op-1", "op-2", "op-3"].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = true;
      el.classList.add("disabled");
      if (i === opcion) el.classList.add("seleccionada");
    }
  });
  enviar({ tipo: "respuesta", opcion });
  setPantalla("s-respondio");
};

const volverAlLobby = () => {
  setMiPuntaje(0);
  setMiRespuesta(null);
  setPendienteEnvio(false);
  setPantalla("s-espera");
};

const toggleCambiarNombre = () => {
  const row = document.getElementById("cambiar-nombre-row");
  const input = document.getElementById("input-cambiar-nombre");
  if (!row || !input) return;
  if (row.style.display === "none") {
    row.style.display = "flex";
    input.value = state.miNombre;
    input.focus();
  } else {
    row.style.display = "none";
  }
};

const cambiarNombre = () => {
  const input = document.getElementById("input-cambiar-nombre");
  if (!input) return;
  const nuevo = input.value.trim();
  if (!nuevo || nuevo === state.miNombre) {
    const row = document.getElementById("cambiar-nombre-row");
    if (row) row.style.display = "none";
    return;
  }
  enviar({ tipo: "cambiar_nombre", nombre: nuevo });
  const row = document.getElementById("cambiar-nombre-row");
  if (row) row.style.display = "none";
};

// Expose globally only during unit tests
if (typeof window !== "undefined" && typeof jest !== "undefined") {
  window.entrar = entrar;
  window.responder = responder;
  window.volverAlLobby = volverAlLobby;
  window.toggleCambiarNombre = toggleCambiarNombre;
  window.cambiarNombre = cambiarNombre;
}

// ── Event Delegation ──────────────────────────────────────────────────────
document.addEventListener("click", (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  switch (action) {
    case "entrar":
      if (typeof window !== "undefined" && typeof window.entrar === "function") {
        window.entrar();
      } else {
        entrar();
      }
      break;
    case "responder":
      const index = parseInt(target.dataset.index, 10);
      if (!isNaN(index)) {
        if (typeof window !== "undefined" && typeof window.responder === "function") {
          window.responder(index);
        } else {
          responder(index);
        }
      }
      break;
    case "toggle-cambiar-nombre":
      if (typeof window !== "undefined" && typeof window.toggleCambiarNombre === "function") {
        window.toggleCambiarNombre();
      } else {
        toggleCambiarNombre();
      }
      break;
    case "cambiar-nombre":
      if (typeof window !== "undefined" && typeof window.cambiarNombre === "function") {
        window.cambiarNombre();
      } else {
        cambiarNombre();
      }
      break;
    case "volver-al-lobby":
      if (typeof window !== "undefined" && typeof window.volverAlLobby === "function") {
        window.volverAlLobby();
      } else {
        volverAlLobby();
      }
      break;
  }
});

// ── Keyboard Listeners ────────────────────────────────────────────────────
const inputNombre = document.getElementById("input-nombre");
if (inputNombre) {
  inputNombre.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (typeof window !== "undefined" && typeof window.entrar === "function") {
        window.entrar();
      } else {
        entrar();
      }
    }
  });
}

const inputCambiarNombre = document.getElementById("input-cambiar-nombre");
if (inputCambiarNombre) {
  inputCambiarNombre.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (typeof window !== "undefined" && typeof window.cambiarNombre === "function") {
        window.cambiarNombre();
      } else {
        cambiarNombre();
      }
    }
  });
}

/**
 * Re-habilita las 4 opciones de respuesta y remueve la marca
 * `.seleccionada`. No toca `state.miRespuesta` — el caller decide
 * si resetearla (típicamente sólo en `opcion_invalida`).
 */
export { restaurarOpciones } from "./views.js";

// ── Auto-reconnect ────────────────────────────────────────────────────────
// Lee localStorage e intenta reconectar automáticamente.
// Si el WebSocket falla, socket.js reintenta la conexión via onclose.
(function autoReconectar() {
  const savedName = localStorage.getItem("historia_quiz_nombre");
  if (!savedName) return;

  const savedToken = sessionStorage.getItem("historia_quiz_token") || localStorage.getItem("historia_quiz_token");
  if (savedToken) {
    setSessionToken(savedToken);
  }

  setMiNombre(savedName);
  const inp = document.getElementById("input-nombre");
  if (inp) inp.value = savedName;
  entrar();
})();
>>>>>>> origin/main
