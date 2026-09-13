import { state, setMiRespuesta, setMiPuntaje } from "./state.js";
import { esc } from "../../shared/dom.js";
import { LETRAS, MEDALLAS } from "../../shared/constants.js";


export function setPantalla(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("activa"));
  const el = document.getElementById(id);
  if (el) el.classList.add("activa");

  const navTarget = {
    "s-cuenta": "volver-inicio",
    "s-partidas": "mostrar-partidas",
    "s-ranking": "mostrar-ranking",
    "s-perfil": "mostrar-perfil"
  }[id];
  document.querySelectorAll(".bottom-nav .nav-item").forEach((item) => {
    item.classList.toggle("activo", navTarget !== undefined && item.dataset.action === navTarget);
  });
}

export function mostrarPregunta(msg) {
  setPantalla("s-pregunta");
  
  const alertEl = document.getElementById("pausa-alerta");
  if (alertEl) alertEl.style.display = "none";
  
  const txtEl = document.getElementById("pregunta-txt");
  if (txtEl) txtEl.textContent = msg.pregunta;

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
  
  actualizarTimer(msg.tiempo);

  const cont = document.getElementById("opciones-container");
  if (cont) {
    cont.innerHTML = msg.opciones.map((op, i) => `
      <button class="opcion-btn ${LETRAS[i]}" id="op-${i}" data-action="responder" data-index="${i}">
        <span class="letra-grande">${LETRAS[i]}</span>
        <span class="opcion-txt">${esc(op)}</span>
      </button>`).join("");
  }
}

export function actualizarTimer(t) {
  const pct = (t / state.TIEMPO_MAX) * 100;
  const bar = document.getElementById("timer-bar");
  if (bar) {
    bar.style.width = pct + "%";
    bar.style.background = pct > 50 ? "var(--green)" : pct > 25 ? "var(--gold)" : "var(--red)";
  }
  const numEl = document.getElementById("timer-num");
  if (numEl) numEl.textContent = t + "s";
}

export function mostrarResultado(msg) {
  const resScreen = document.getElementById("s-resultado");
  if (resScreen && resScreen.classList.contains("activa")) return;

  const correcta = msg.correcta;
  const respondioCorrect = state.miRespuesta === correcta;
  const noRespondio = state.miRespuesta === null;

  const miRanking = (msg.jugadores || []).find(j => j.id === state.miId);
  if (miRanking) {
    setMiPuntaje(miRanking.puntaje);
  }

  const iconEl = document.getElementById("res-icono");
  if (iconEl) iconEl.textContent = noRespondio ? "⏰" : respondioCorrect ? "✅" : "❌";
  
  const titleEl = document.getElementById("res-titulo");
  if (titleEl) titleEl.textContent = noRespondio ? "¡Se acabó el tiempo!" : respondioCorrect ? "¡Correcto!" : "Incorrecto";
  
  const pts = document.getElementById("res-pts");
  if (pts) {
    if (respondioCorrect) {
      pts.style.display = "block";
      pts.textContent = "+100 pts · Total: " + (miRanking ? miRanking.puntaje : 0);
    } else {
      pts.style.display = "none";
    }
  }
  
  const descEl = document.getElementById("res-desc");
  if (descEl) {
    descEl.textContent = noRespondio
      ? "No respondiste a tiempo."
      : respondioCorrect
        ? "¡Sumaste 100 puntos! 🎉"
        : "La respuesta era la opción " + LETRAS[correcta];
  }

  setPantalla("s-resultado");
}

export function mostrarFin(ranking, rankingGeneral, miHistorial) {
  setPantalla("s-fin");
  const miJugador = ranking.find(j => j.id === state.miId);
  const correctas = miHistorial?.filter(r => r.acerto).length || 0;
  const puntajeEl = document.getElementById("fin-puntaje");
  const correctasEl = document.getElementById("fin-correctas");
  const posicionEl = document.getElementById("fin-posicion");
  const precisionEl = document.getElementById("fin-precision");
  if (puntajeEl) puntajeEl.textContent = miJugador?.puntaje || 0;
  if (correctasEl) correctasEl.textContent = `${correctas}/${miHistorial?.length || 0}`;
  if (posicionEl) posicionEl.textContent = miJugador ? `#${ranking.findIndex(j => j.id === state.miId) + 1}` : "#-";
  if (precisionEl) precisionEl.textContent = miHistorial?.length ? Math.round(correctas / miHistorial.length * 100) + "%" : "0%";
  try {
    const anterior = JSON.parse(localStorage.getItem("historia_quiz_resumen") || "null");
    const partidasAnteriores = Number(anterior?.partidas) || 0;
    const preguntasAnteriores = Number(anterior?.preguntas) || 0;
    const correctasAnteriores = Number(anterior?.correctas) || 0;
    const preguntasActuales = miHistorial?.length || 0;
    const correctasTotales = correctasAnteriores + correctas;
    const preguntasTotales = preguntasAnteriores + preguntasActuales;
    localStorage.setItem("historia_quiz_resumen", JSON.stringify({
      puntaje: miJugador?.puntaje || 0,
      aciertos: preguntasTotales ? Math.round(correctasTotales / preguntasTotales * 100) + "%" : "0%",
      partidas: partidasAnteriores + 1,
      preguntas: preguntasTotales,
      correctas: correctasTotales,
      ranking: ranking.slice(0, 10)
    }));
  } catch (e) {}
  const cont = document.getElementById("ranking-final");
  if (cont) {
    cont.innerHTML = ranking.slice(0, 10).map((j, i) => `
      <div class="rank-item ${j.id === state.miId ? 'rank-yo' : ''}">
        <span class="rank-pos">${MEDALLAS[i] || (i + 1) + "°"}</span>
        <span class="ranking-nombre">${esc(j.nombre)}${j.id === state.miId ? " (vos)" : ""}</span>
        <span class="ranking-pts">${j.puntaje} pts</span>
      </div>`).join("");
  }
  const contGeneral = document.getElementById("ranking-general-final");
  if (contGeneral) {
    contGeneral.innerHTML = rankingGeneral.slice(0, 10).map((j, i) => `
      <div class="rank-item ${j.id === state.miId ? 'rank-yo' : ''}">
        <span class="rank-pos">${MEDALLAS[i] || (i + 1) + "°"}</span>
        <span class="ranking-nombre">${esc(j.nombre)}${j.id === state.miId ? " (vos)" : ""}</span>
        <span class="ranking-pts">${j.puntajeGeneral} pts</span>
      </div>`).join("");
  }
  // REQ-UI-11: resumen personal opcional. Servidores viejos no envían el
  // campo → sin resumen, rankings intactos. Todo lo del jugador se escapa
  // antes de entrar al DOM.
  const contMisRespuestas = document.getElementById("mi-historial");
  const listaMisRespuestas = document.getElementById("mi-historial-lista");
  if (contMisRespuestas) {
    if (miHistorial === undefined || miHistorial === null) {
      contMisRespuestas.style.display = "none";
      if (listaMisRespuestas) listaMisRespuestas.innerHTML = "";
      return;
    }
    if (listaMisRespuestas) {
      listaMisRespuestas.innerHTML = miHistorial.map((r) => {
        const resp = r.respondio
          ? `${esc(r.opcionLetra)}) ${esc(r.opcionTexto)}`
          : "Sin respuesta";
        const outcome = r.acerto
          ? "✓ Correcto"
          : r.respondio
            ? `✗ Correcta: ${esc(r.correctaLetra)}`
            : `Correcta: ${esc(r.correctaLetra)}`;
        return `<div class="mi-historial-item">
          <span class="mi-hist-pregunta">Pregunta ${esc(String(r.n))}</span>
          <span class="mi-hist-txt">${esc(r.pregunta)}</span>
          <span class="mi-hist-resp">${resp}</span>
          <span class="mi-hist-outcome ${r.acerto ? "ok" : "bad"}">${outcome}</span>
        </div>`;
      }).join("");
    }
    contMisRespuestas.style.display = "block";
  }
}

/**
 * Re-habilita las 4 opciones de respuesta y remueve la marca
 * `.seleccionada`. No toca `state.miRespuesta` — el caller decide
 * si resetearla (típicamente sólo en `opcion_invalida`).
 */
export function restaurarOpciones() {
  ["op-0", "op-1", "op-2", "op-3"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = false;
      el.classList.remove("seleccionada", "disabled");
    }
  });
}
