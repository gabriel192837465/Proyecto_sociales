/**
 * Toast helper para el alumno.
 * Espejo del `toast()` de admin, con 4s de auto-dismiss, botón ✕ manual,
 * y reemplazo idempotente (un nuevo toast cancela el timer previo).
 *
 * Variantes de tipo: "ok" | "err" | "info".
 * Si #toast no existe en el DOM, es no-op defensivo.
 */

let timerId = null;

function clearTimer() {
  if (timerId !== null) {
    clearTimeout(timerId);
    timerId = null;
  }
}

function dismiss(t) {
  clearTimer();
  if (!t) return;
  t.className = "toast";
  t.innerHTML = "";
  t.removeAttribute("role");
}

export function mostrarToast(mensaje, tipo = "ok", { duracion = 4000 } = {}) {
  const t = document.getElementById("toast");
  if (!t) return;

  // Reemplazo idempotente: descarta el toast previo y su timer
  clearTimer();
  t.className = "toast";
  t.innerHTML = "";

  const safeTipo = ["ok", "err", "info"].includes(tipo) ? tipo : "ok";
  t.className = `toast ${safeTipo} show`;
  t.setAttribute("role", "alert");

  const msgSpan = document.createElement("span");
  msgSpan.className = "toast-msg";
  msgSpan.textContent = mensaje;
  t.appendChild(msgSpan);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "toast-close";
  closeBtn.setAttribute("aria-label", "Cerrar");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => dismiss(t));
  t.appendChild(closeBtn);

  if (duracion > 0) {
    timerId = setTimeout(() => dismiss(t), duracion);
  }
}
