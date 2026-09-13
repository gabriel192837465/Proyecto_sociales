<<<<<<< HEAD
import { S } from "../state.js";
import { esc } from "../../../shared/dom.js";
import { MEDALLAS } from "../../../shared/constants.js";

export function actualizarRanking(lista) {
  const el = document.getElementById("ranking-lista");
  const online = (lista || []).filter(j => S.jugadoresOnline[j.id] !== false);
  if (!online.length) {
    el.innerHTML = '<p class="vacio-ranking-txt">Sin jugadores aún</p>';
    return;
  }
  el.innerHTML = online.map((j, i) =>
    `<div class="ranking-item"><span class="ranking-pos">${MEDALLAS[i] || i + 1}</span><span class="ranking-nombre">${esc(j.nombre)}</span><span class="ranking-pts">${j.puntaje}</span></div>`
  ).join("");
}

export function actualizarRankingGeneral(lista) {
  const el = document.getElementById("ranking-general-lista");
  const visibles = (lista || []).filter(j => S.jugadoresOnline[j.id] !== false || j.puntajeGeneral > 0);
  if (!visibles.length) {
    el.innerHTML = '<p class="vacio-ranking-txt">Sin jugadores aún</p>';
    return;
  }
  el.innerHTML = visibles.map((j, i) =>
    `<div class="ranking-item"><span class="ranking-pos">${MEDALLAS[i] || i + 1}</span><span class="ranking-nombre">${esc(j.nombre)}${S.jugadoresOnline[j.id] === false ? ' <span class="estado-conexion">(offline)</span>' : ''}</span><span class="ranking-pts">${j.puntajeGeneral}</span></div>`
  ).join("");
}
=======
import { S } from "../state.js";
import { esc } from "../../../shared/dom.js";
import { MEDALLAS } from "../../../shared/constants.js";

export function actualizarRanking(lista) {
  const el = document.getElementById("ranking-lista");
  const online = (lista || []).filter(j => S.jugadoresOnline[j.id] !== false);
  if (!online.length) {
    el.innerHTML = '<p class="vacio-ranking-txt">Sin jugadores aún</p>';
    return;
  }
  el.innerHTML = online.map((j, i) =>
    `<div class="ranking-item"><span class="ranking-pos">${MEDALLAS[i] || i + 1}</span><span class="ranking-nombre">${esc(j.nombre)}</span><span class="ranking-pts">${j.puntaje}</span></div>`
  ).join("");
}

export function actualizarRankingGeneral(lista) {
  const el = document.getElementById("ranking-general-lista");
  const visibles = (lista || []).filter(j => S.jugadoresOnline[j.id] !== false || j.puntajeGeneral > 0);
  if (!visibles.length) {
    el.innerHTML = '<p class="vacio-ranking-txt">Sin jugadores aún</p>';
    return;
  }
  el.innerHTML = visibles.map((j, i) =>
    `<div class="ranking-item"><span class="ranking-pos">${MEDALLAS[i] || i + 1}</span><span class="ranking-nombre">${esc(j.nombre)}${S.jugadoresOnline[j.id] === false ? ' <span class="estado-conexion">(offline)</span>' : ''}</span><span class="ranking-pts">${j.puntajeGeneral}</span></div>`
  ).join("");
}
>>>>>>> origin/main
