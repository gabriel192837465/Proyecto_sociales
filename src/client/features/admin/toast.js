<<<<<<< HEAD
// ── Toast — notificaciones efímeras ────────────────────────────────────────
// Módulo dedicado (evita dependencia circular index↔api y elimina la
// contaminación del namespace `window.toast` que existía antes).
export function toast(msg, tipo = "ok") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${tipo} show`;
  setTimeout(() => (t.className = "toast"), 2800);
}
=======
// ── Toast — notificaciones efímeras ────────────────────────────────────────
// Módulo dedicado (evita dependencia circular index↔api y elimina la
// contaminación del namespace `window.toast` que existía antes).
export function toast(msg, tipo = "ok") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${tipo} show`;
  setTimeout(() => (t.className = "toast"), 2800);
}
>>>>>>> origin/main
