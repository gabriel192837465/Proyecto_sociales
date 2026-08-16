import { setPantalla } from "../state.js";
import { actualizarRanking, actualizarRankingGeneral } from "./ranking-lista.js";
import { LETRAS } from "../../../shared/constants.js";

export function mostrarResultado(msg) {
  setPantalla("resultado");
  document.getElementById("btn-siguiente").disabled = false;
  document.getElementById("btn-forzar").disabled = true;
  const btnPausa = document.getElementById("btn-pausa");
  btnPausa.disabled = true;
  btnPausa.textContent = "⏸ Pausar tiempo";
  actualizarRanking(msg.jugadores);
  actualizarRankingGeneral(msg.rankingGeneral);
  const totalResp = Object.keys(msg.respuestas || {}).length;
  const conteo = [0, 0, 0, 0];
  Object.values(msg.respuestas || {}).forEach(r => { if (r >= 0 && r < 4) conteo[r]++; });
  document.getElementById("resultado-contenido").innerHTML = `
    <p class="resultado-resumen">Respondieron: <strong>${totalResp}</strong> alumnos</p>
    ${[0, 1, 2, 3].map(i => `
      <div class="resultado-barra-row">
        <span class="resultado-letra ${i === msg.correcta ? "correcta" : ""}">${LETRAS[i]}</span>
        <div class="resultado-barra-track-wrap"><div class="resultado-barra-track"><div class="resultado-barra-fill ${i === msg.correcta ? "correcta" : ""}" style="width:${totalResp ? Math.round(conteo[i] / totalResp * 100) : 0}%"></div></div></div>
        <span class="resultado-conteo">${conteo[i]}</span>
      </div>`).join("")}
    <p class="resultado-correcta-info">✅ Correcta: opción ${LETRAS[msg.correcta]}</p>`;
}
