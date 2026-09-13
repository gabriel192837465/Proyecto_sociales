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
    const sel = document.getElementById("banco-select");
    sel.innerHTML = '<option value="">– Elegí un banco –</option>';
    S.bancosCache.forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = `${esc(b.nombre)} (${esc(b.nivel)} · ${esc(b.anio)} · ${esc(b.cantidad)} preg.)`;
      sel.appendChild(opt);
    });
  } catch (e) { console.error("Error cargando bancos", e); }
}

export function onBancoChange() {
  const id = document.getElementById("banco-select").value;
  const meta = document.getElementById("banco-meta");
  if (!id) { meta.innerHTML = ""; return; }
  const b = S.bancosCache.find(x => x.id === id);
  if (!b) return;
  meta.innerHTML = `<span class="tag tag-nivel">📚 ${esc(b.nivel)}</span><span class="tag tag-anio">🎓 ${esc(b.anio)}</span><span class="tag tag-tema">📌 ${esc(b.tema)}</span><span class="tag tag-cant">❓ ${esc(b.cantidad)} preguntas</span>`;
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
