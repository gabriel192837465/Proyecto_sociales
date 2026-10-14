import { S, clearToken } from "./state.js";
export { clearToken };
import { esc } from "../../shared/dom.js";

export async function cargarBancos() {
  try {
    const r = await fetch("/api/bancos", {
      headers: { "X-Admin-Token": S.token }
    });
    if (r.status === 401 || r.status === 403) {
      clearToken();
      pedirClave("Clave incorrecta o no autorizada.");
      return;
    }
    S.bancosCache = await r.json();
    onCursoChange();
  } catch (e) { console.error("Error cargando bancos", e); }
}

export function onCursoChange() {
  const curso = document.getElementById("curso-select")?.value || "";
  const sel = document.getElementById("banco-select");
  const disponibilidad = document.getElementById("banco-disponibilidad");
  const crearBtn = document.querySelector('[data-action="crear-partida"]');
  if (!sel) return;

  sel.replaceChildren();
  const disponibles = S.bancosCache.filter((b) =>
    String(b.anio || "").trim() === curso && Number(b.cantidad) > 0
  );
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = !curso
    ? "– Primero elegí el año –"
    : "– Elegí un banco –";
  sel.appendChild(placeholder);
  sel.disabled = !curso || disponibles.length === 0;

  disponibles.forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = `${esc(b.nombre)} (${esc(b.cantidad)} preg.)`;
    sel.appendChild(opt);
  });
  if (disponibilidad) disponibilidad.textContent = curso && !disponibles.length
    ? `No hay bancos con preguntas cargadas para ${curso}.`
    : "";
  const meta = document.getElementById("banco-meta");
  if (meta) meta.innerHTML = "";
  if (crearBtn) crearBtn.disabled = true;
}

export function onBancoChange() {
  const id = document.getElementById("banco-select")?.value;
  const meta = document.getElementById("banco-meta");
  const crearBtn = document.querySelector('[data-action="crear-partida"]');
  if (!id) {
    if (meta) meta.innerHTML = "";
    if (crearBtn) crearBtn.disabled = true;
    return;
  }
  const b = S.bancosCache.find(x => x.id === id);
  if (!b) return;
  if (meta) meta.innerHTML = `<span class="tag tag-nivel">📚 ${esc(b.nivel)}</span><span class="tag tag-anio">🎓 ${esc(b.anio)}</span><span class="tag tag-tema">📌 ${esc(b.tema)}</span><span class="tag tag-cant">❓ ${esc(b.cantidad)} preguntas</span>`;
  if (crearBtn) crearBtn.disabled = false;
}

export function mostrarError(msg) {
  const el = document.getElementById("error-box");
  el.textContent = "⚠️ " + msg;
  el.style.display = "block";
}

export function ocultarError() {
  document.getElementById("error-box").style.display = "none";
}

export function pedirClave(err = "") {
  document.getElementById("modal-auth").style.display = "flex";
  if (err) {
    mostrarAuthError(err);
  } else {
    document.getElementById("auth-error-box").style.display = "none";
  }
}

export function mostrarAuthError(msg) {
  const errBox = document.getElementById("auth-error-box");
  errBox.textContent = "⚠️ " + msg;
  errBox.style.display = "block";
}
