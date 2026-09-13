import { S } from "../state.js";
import { esc } from "../../../shared/dom.js";

export function actualizarRespuestasEnPregunta(idsRespondieron) {
  const el = document.getElementById("resp-estado-alumnos");
  if (!el) return;
  const respondieron = idsRespondieron || [];
  const todos = Object.keys(S.jugadoresMap);
  if (!todos.length) {
    el.innerHTML = '<p class="sin-alumnos">Sin alumnos conectados</p>';
    return;
  }
  const pendientes = todos.filter(id => !respondieron.includes(id) && S.jugadoresOnline[id] !== false);
  let html = "";
  if (respondieron.length) {
    html += `<p class="resp-label">Ya respondieron</p><div class="resp-chips">${
      respondieron.map(id => `<span class="resp-chip ok">✓ ${esc(S.jugadoresMap[id])}</span>`).join("")
    }</div>`;
  }
  if (pendientes.length) {
    html += `<p class="resp-label">Esperando respuesta</p><div class="resp-chips">${
      pendientes.map(id => `<span class="resp-chip pend">${esc(S.jugadoresMap[id])}</span>`).join("")
    }</div>`;
  }
  el.innerHTML = html;
}
