import { S, setToken, clearToken } from "./state.js";
import { enviar } from "./socket.js";
import { cargarBancos, pedirClave, ocultarError, mostrarError, mostrarAuthError, onBancoChange } from "./api.js";
import { manejarMensaje } from "./manejar-mensaje.js";
import { conectar as wsConectar, onMensaje, getWS } from "../../shared/socket-client.js";
import { mostrarToast } from "./toast.js";
import { exportarInformeCSV, imprimirInforme } from "./views/pantalla-fin.js";

// Expuesto globalmente para tests E2E y unitarios
if (typeof window !== "undefined" && (typeof jest !== "undefined" || window.navigator.webdriver)) {
  window.S = S;
}

// ── Connection ────────────────────────────────────────────────────────────
let _hasConnectedBefore = false;
let registrado = false;

function conectar() {
  if (!registrado) {
    onMensaje(manejarMensaje);
    registrado = true;
  }
  wsConectar({
    onOpen(ws) {
      S.ws = ws;
      ws.send(JSON.stringify({ tipo: "docente_conecta", token: S.token }));
      const stateEl = document.getElementById("estado-cx");
      if (stateEl) stateEl.innerHTML = '<span class="dot-ok"></span>Conectado';
      if (_hasConnectedBefore) {
        mostrarToast("¡Conexión restablecida!", "ok", { duracion: 3000 });
      }
      _hasConnectedBefore = true;
    },
    onClose() {
      S.ws = null;
      const stateEl = document.getElementById("estado-cx");
      if (stateEl) stateEl.innerHTML = '<span class="dot-err"></span>Desconectado...';
      mostrarToast("Conexión perdida. Intentando reconectar...", "err", { duracion: 0 });
    }
  });
}

// ── Local Actions ─────────────────────────────────────────────────────────
const cerrarSesion = () => {
  const wss = getWS();
  if (wss) wss.close();
  clearToken();
  try { location.href = "index.html"; } catch {}
};

const volverAlMenu = () => enviar("volver_a_lobby");
const terminarReiniciar = () => enviar("volver_a_lobby");

const iniciarJuego = () => {
  const select = document.getElementById("banco-select");
  if (!select) return;
  const bancoId = select.value;
  if (!bancoId) { mostrarError("Seleccioná un banco de preguntas antes de iniciar."); return; }
  const onlineCount = Object.values(S.jugadoresOnline).filter(Boolean).length;
  if (!onlineCount) { mostrarError("No hay alumnos conectados. Esperá a que se conecten antes de iniciar."); return; }
  ocultarError();
  const timeSelect = document.getElementById("tiempo-select");
  const tiempoPorPregunta = timeSelect ? (parseInt(timeSelect.value) || 20) : 20;
  enviar("iniciar_juego", { bancoId, tiempoPorPregunta });
};

const siguientePregunta = () => enviar("siguiente_pregunta");
const forzarResultado = () => enviar("mostrar_resultado_manual");
const alternarPausa = () => enviar("alternar_pausa");
const reiniciarRankingGeneral = () => enviar("reiniciar_ranking_general");

// Sección 6/12: el docente elige el curso (opcional) y crea la partida —
// el servidor genera el código de 6 dígitos y, si el curso está mapeado a
// un banco, lo deja preseleccionado para "Comenzar" (ver manejar-mensaje.js).
const crearPartida = () => {
  const cursoSelect = document.getElementById("curso-select");
  const curso = cursoSelect ? cursoSelect.value : "";
  enviar("crear_partida", curso ? { curso } : {});
};

const autenticarDocente = () => {
  const input = document.getElementById("auth-password");
  if (!input) return;
  const pw = input.value.trim();
  if (!pw) { mostrarAuthError("La contraseña no puede estar vacía."); return; }
  setToken(pw);
  const modal = document.getElementById("modal-auth");
  if (modal) modal.style.display = "none";
  const errBox = document.getElementById("auth-error-box");
  if (errBox) errBox.style.display = "none";
  cargarBancos();
  conectar();
};

// Expose globally only during unit tests
if (typeof window !== "undefined" && typeof jest !== "undefined") {
  window.cerrarSesion = cerrarSesion;
  window.volverAlMenu = volverAlMenu;
  window.terminarReiniciar = terminarReiniciar;
  window.iniciarJuego = iniciarJuego;
  window.siguientePregunta = siguientePregunta;
  window.forzarResultado = forzarResultado;
  window.alternarPausa = alternarPausa;
  window.reiniciarRankingGeneral = reiniciarRankingGeneral;
  window.crearPartida = crearPartida;
  window.autenticarDocente = autenticarDocente;
  window.exportarInformeCSV = exportarInformeCSV;
  window.imprimirInforme = imprimirInforme;
}

// ── Event Delegation ──────────────────────────────────────────────────────
document.addEventListener("click", (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  switch (action) {
    case "cerrar-sesion":
      if (typeof window !== "undefined" && typeof window.cerrarSesion === "function") {
        window.cerrarSesion();
      } else {
        cerrarSesion();
      }
      break;
    case "volver-al-menu":
      if (typeof window !== "undefined" && typeof window.volverAlMenu === "function") {
        window.volverAlMenu();
      } else {
        volverAlMenu();
      }
      break;
    case "iniciar-juego":
      if (typeof window !== "undefined" && typeof window.iniciarJuego === "function") {
        window.iniciarJuego();
      } else {
        iniciarJuego();
      }
      break;
    case "terminar-reiniciar":
      if (typeof window !== "undefined" && typeof window.terminarReiniciar === "function") {
        window.terminarReiniciar();
      } else {
        terminarReiniciar();
      }
      break;
    case "siguiente-pregunta":
      if (typeof window !== "undefined" && typeof window.siguientePregunta === "function") {
        window.siguientePregunta();
      } else {
        siguientePregunta();
      }
      break;
    case "alternar-pausa":
      if (typeof window !== "undefined" && typeof window.alternarPausa === "function") {
        window.alternarPausa();
      } else {
        alternarPausa();
      }
      break;
    case "forzar-resultado":
      if (typeof window !== "undefined" && typeof window.forzarResultado === "function") {
        window.forzarResultado();
      } else {
        forzarResultado();
      }
      break;
    case "reiniciar-ranking-general":
      if (typeof window !== "undefined" && typeof window.reiniciarRankingGeneral === "function") {
        window.reiniciarRankingGeneral();
      } else {
        reiniciarRankingGeneral();
      }
      break;
    case "crear-partida":
      if (typeof window !== "undefined" && typeof window.crearPartida === "function") {
        window.crearPartida();
      } else {
        crearPartida();
      }
      break;
    case "exportar-csv":
      if (typeof window !== "undefined" && typeof window.exportarInformeCSV === "function") {
        window.exportarInformeCSV();
      } else {
        exportarInformeCSV();
      }
      break;
    case "imprimir-informe":
      if (typeof window !== "undefined" && typeof window.imprimirInforme === "function") {
        window.imprimirInforme();
      } else {
        imprimirInforme();
      }
      break;
    case "autenticar-docente":
      if (typeof window !== "undefined" && typeof window.autenticarDocente === "function") {
        window.autenticarDocente();
      } else {
        autenticarDocente();
      }
      break;
  }
});

document.addEventListener("change", (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  if (action === "banco-change") {
    onBancoChange();
  }
});

// ── Keyboard Listeners ────────────────────────────────────────────────────
const authPasswordInput = document.getElementById("auth-password");
if (authPasswordInput) {
  authPasswordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (typeof window !== "undefined" && typeof window.autenticarDocente === "function") {
        window.autenticarDocente();
      } else {
        autenticarDocente();
      }
    }
  });
}

// ── Init ─────────────────────────────────────────────────────────────────
if (typeof document !== "undefined" && document.getElementById("estado-cx")) {
  if (!S.token) {
    pedirClave();
  } else {
    cargarBancos();
    conectar();
  }
}
