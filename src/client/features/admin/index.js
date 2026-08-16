import { state } from "./state.js";
const { token } = state;
import { autenticarAdmin, cargarSidebar, seleccionarBanco, abrirModalBanco, guardarBanco, borrarBanco } from "./api.js";
import { abrirModalPregunta, guardarPregunta, borrarPregunta, confirmarBorrarPregunta } from "./api.js";
import { abrirModalImport, switchImport, leerCSV, importar, cerrarModal } from "./api.js";

// Re-exportar toast para que los tests (y cualquier consumidor externo) puedan
// importarlo desde el entry point del módulo, igual que antes.
export { toast } from "./toast.js";

// ── Local Actions ─────────────────────────────────────────────────────────
const cerrarSesion = () => {
  localStorage.removeItem("admin_token");
  try { location.reload(); } catch {}
};

const triggerFileInput = () => {
  const inp = document.getElementById("file-csv");
  if (inp) inp.click();
};

// ── Drag & drop ───────────────────────────────────────────────────────────
const d = document.getElementById("drop-zone");
if (d) {
  d.addEventListener("dragover", e => { e.preventDefault(); d.classList.add("drag"); });
  d.addEventListener("dragleave", () => d.classList.remove("drag"));
  d.addEventListener("drop", e => {
    e.preventDefault();
    d.classList.remove("drag");
    const f = e.dataTransfer.files[0];
    if (f) {
      const inp = document.getElementById("file-csv");
      const dt = new DataTransfer();
      dt.items.add(f);
      inp.files = dt.files;
      leerCSV(inp);
    }
  });
}

// ── Modal overlay click-to-close ──────────────────────────────────────────
// (No usa data-action: cierra al hacer clic en el backdrop, no en un botón.)
document.querySelectorAll(".overlay").forEach(o =>
  o.addEventListener("click", e => {
    if (e.target === o && o.id !== "modal-auth") o.classList.remove("visible");
  })
);

// ── Event Delegation (document-level, como alumno/docente) ────────────────
//
// Tabla de acciones para botones DINÁMICOS (renderizados por api.js dentro de
// #main-content). Los botones estáticos del HTML usan el switch de abajo.
const MANEJADORES = {
  "edit-banco": (el) => abrirModalBanco(el.dataset.bancoId),
  "new-pregunta": (el) => abrirModalPregunta(el.dataset.bancoId),
  "edit-pregunta": (el) => abrirModalPregunta(el.dataset.bancoId, el.dataset.pregId),
  "delete-pregunta": (el) => confirmarBorrarPregunta(el.dataset.bancoId, el.dataset.pregId),
  "import": () => abrirModalImport(),
};

// Acciones estáticas (botones del HTML). El segundo elemento es la función a
// llamar; opcionalmente lee argumentos del elemento vía dataset.
const ACCIONES = {
  "cerrar-sesion": () => cerrarSesion(),
  "abrir-modal-banco": () => abrirModalBanco(),
  "guardar-banco": () => guardarBanco(),
  "borrar-banco": () => borrarBanco(),
  "guardar-pregunta": () => guardarPregunta(),
  "borrar-pregunta": () => borrarPregunta(),
  "switch-import": (el) => switchImport(el.dataset.import),
  "trigger-file-input": () => triggerFileInput(),
  "importar": () => importar(),
  "cerrar-modal": (el) => cerrarModal(el.dataset.modal),
  "autenticar-admin": () => autenticarAdmin(),
};

document.addEventListener("click", (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;

  // 1) Botones dinámicos (tabla de bancos/preguntas dentro de #main-content)
  const fn = MANEJADORES[target.dataset.action];
  if (fn) { e.preventDefault(); fn(target); return; }

  // 2) Botones estáticos (sidebar, mobile-nav, modales)
  const accion = ACCIONES[target.dataset.action];
  if (accion) { e.preventDefault(); accion(target); }
});

// ── change delegation (select de banco móvil + file input CSV) ────────────
document.addEventListener("change", (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "seleccionar-banco") {
    seleccionarBanco(target.value);
  } else if (action === "leer-csv") {
    leerCSV(target);
  }
});

// ── Sidebar: selección de banco por clic en .banco-item ───────────────────
// (No usa data-action — el item se renderiza dinámicamente y se selecciona
// por clase; se mantiene como listener scoped por compatibilidad.)
document.getElementById("banco-lista")?.addEventListener("click", (e) => {
  const item = e.target.closest(".banco-item");
  if (item && item.dataset.bancoId) seleccionarBanco(item.dataset.bancoId);
});

// ── Keyboard: Enter en el input de auth dispara autenticarAdmin ────────────
const authPasswordInput = document.getElementById("auth-password");
if (authPasswordInput) {
  authPasswordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      autenticarAdmin();
    }
  });
}

// ── Exponer en window SOLO durante tests (igual que alumno/docente) ──────
// Permite que los tests unitarios invoquen cerrarSesion directamente.
if (typeof window !== "undefined" && typeof jest !== "undefined") {
  window.cerrarSesion = cerrarSesion;
}

// ── Init ─────────────────────────────────────────────────────────────────
async function init() {
  const authModal = document.getElementById("modal-auth");
  if (!authModal) return;
  if (!token) {
    authModal.classList.add("visible");
    authModal.style.display = "flex";
  } else {
    authModal.classList.remove("visible");
    authModal.style.display = "none";
    await cargarSidebar();
  }
}
if (typeof document !== "undefined") init();
