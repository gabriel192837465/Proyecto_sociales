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
