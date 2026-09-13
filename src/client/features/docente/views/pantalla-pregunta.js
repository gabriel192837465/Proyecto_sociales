import { S, setPantalla } from "../state.js";
import { esc } from "../../../shared/dom.js";
import { LETRAS } from "../../../shared/constants.js";
import { actualizarRespuestasEnPregunta } from "./jugadores-chips.js";

export function mostrarPregunta(msg, respondieronIds) {
  setPantalla("pregunta");
  document.getElementById("pregunta-num").textContent = `${msg.idx + 1}/${msg.total}`;
  document.getElementById("pregunta-txt").textContent = msg.pregunta;
  const et = document.getElementById("epoca-tag");
  et.textContent = msg.epoca;
  et.style.background = S.epocaColores[msg.epoca] || "#555";
  et.style.color = "#000";
  const mediaEl = document.getElementById("pregunta-media");
  if (mediaEl) {
    mediaEl.innerHTML = "";
    if (msg.mediaTipo === "image" && msg.mediaUrl) {
      const image = document.createElement("img");
      image.src = msg.mediaUrl;
      image.alt = "Recurso de la pregunta";
      mediaEl.appendChild(image);
    } else if (msg.mediaTipo === "audio" && msg.mediaUrl) {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.src = msg.mediaUrl;
      mediaEl.appendChild(audio);
    }
    mediaEl.style.display = mediaEl.childElementCount ? "block" : "none";
  }
  document.getElementById("opciones-container").innerHTML = msg.opciones.map((op, i) =>
    `<div class="opcion" id="opcion-${i}"><span class="letra">${LETRAS[i]}</span>${esc(op)}</div>`
  ).join("");
  S.idsRespondieronActual = respondieronIds || [];
  actualizarRespuestasEnPregunta(S.idsRespondieronActual);
  actualizarTimer(S.TIEMPO_MAX);
  document.getElementById("btn-siguiente").disabled = true;
  document.getElementById("btn-forzar").disabled = false;
  const btnPausa = document.getElementById("btn-pausa");
  btnPausa.disabled = false;
  btnPausa.textContent = "⏸ Pausar tiempo";
}

export function actualizarTimer(t) {
  const pct = (t / S.TIEMPO_MAX) * 100;
  const bar = document.getElementById("timer-bar");
  bar.style.width = pct + "%";
  bar.style.background = pct > 50 ? "var(--green)" : pct > 25 ? "var(--gold)" : "var(--red)";
  document.getElementById("timer-num").textContent = t + "s";
}
