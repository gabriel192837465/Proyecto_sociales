import { S, syncJugadoresMap, setPantalla } from "../state.js";
import { actualizarRanking, actualizarRankingGeneral } from "./ranking-lista.js";
import { esc } from "../../../shared/dom.js";
import { MEDALLAS } from "../../../shared/constants.js";
import { ocultarError } from "../api.js";

// Informe retenido en estado de módulo: llega por `fin_juego.ranking` o por
// `estado_inicial.informe` tras reconectar el docente. Export/print lo usan
// sin re-leer el DOM ni pedir nada al servidor.
let informeActual = [];

const CSV_HEADER = ["id", "nombre", "puntaje", "n", "pregunta", "correctaLetra", "opcionLetra", "opcionTexto", "respondio", "acerto"];
const CSV_SEPARADOR = "\r\n";
// Guardia anti-inyección de fórmulas: `=`, `+`, `-`, `@` al inicio de una celda.
const RE_COMIENZO_FORMULA = /^[=+\-@]/;
// RFC 4180: una celda se entrecomilla si contiene coma, comilla o salto de línea.
const RE_NECESITA_COMILLAS = /[",\r\n]/;

function escaparCeldaCSV(valor) {
  if (valor === null || valor === undefined) return "";
  let s = String(valor);
  if (RE_COMIENZO_FORMULA.test(s)) s = "'" + s;
  if (RE_NECESITA_COMILLAS.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function buildInformeCSV(informe) {
  const filas = [CSV_HEADER.join(",")];
  (informe || []).forEach(j => {
    const detalle = j.detalle || [];
    detalle.forEach(r => {
      filas.push([
        j.id, j.nombre, j.puntaje, r.n, r.pregunta, r.correctaLetra,
        r.opcionLetra, r.opcionTexto, r.respondio, r.acerto
      ].map(escaparCeldaCSV).join(","));
    });
  });
  // BOM UTF-8: Excel abre el CSV con acentos correctamente.
  return "\uFEFF" + filas.join(CSV_SEPARADOR) + CSV_SEPARADOR;
}

export function exportarInformeCSV() {
  const csv = buildInformeCSV(informeActual);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "informe.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function imprimirInforme() {
  window.print();
}

export function mostrarFin(ranking, rankingGeneral) {
  informeActual = ranking || [];
  setPantalla("fin");
  document.getElementById("btn-siguiente").disabled = true;
  actualizarRankingGeneral(rankingGeneral);
  document.getElementById("podio-fin").innerHTML = (ranking || []).map((j, i) => {
    const detalle = (j.detalle || []).map(r => {
      if (!r.respondio) {
        return `<div class="informe-pregunta">
          <div class="preg-num">Pregunta ${r.n}</div>
          <div class="preg-txt">${esc(r.pregunta)}</div>
          <div class="sin-resp">Sin respuesta</div>
        </div>`;
      }
      const cls = r.acerto ? "ok" : "bad";
      const extra = r.acerto
        ? `<span class="resultado-acerto"> ✓ Correcto</span>`
        : `<span class="resultado-error"> · Correcta: ${esc(r.correctaLetra)}</span>`;
      return `<div class="informe-pregunta">
        <div class="preg-num">Pregunta ${r.n}</div>
        <div class="preg-txt">${esc(r.pregunta)}</div>
        <div class="resp-alumno ${cls}">Respondió: <strong>${esc(r.opcionLetra)}) ${esc(r.opcionTexto)}</strong>${extra}</div>
      </div>`;
    }).join("");
    return `<details class="informe-alumno">
      <summary>
        <span>${MEDALLAS[i] || (i + 1) + "°"}</span>
        <span class="nombre">${esc(j.nombre)}</span>
        <span class="pts">${j.puntaje} pts</span>
        <span class="chevron">▼</span>
      </summary>
      <div class="informe-alumno-body">
        ${detalle || '<p class="sin-resp">Sin respuestas registradas</p>'}
      </div>
    </details>`;
  }).join("");
}

export function reiniciarUI(total, nombre, jugadores, rankingGeneral) {
  const lista = jugadores || [];
  syncJugadoresMap(lista);
  S.totalJugadores = lista.length;
  S.idsRespondieronActual = [];
  setPantalla("lobby");
  document.getElementById("count-jugadores").textContent = S.totalJugadores;
  document.getElementById("lista-jugadores").innerHTML = lista.map(j =>
    `<div class="jugador-chip" id="chip-${j.id}">${esc(j.nombre)}</div>`
  ).join("");
  actualizarRanking(lista);
  actualizarRankingGeneral(rankingGeneral || []);
  document.getElementById("btn-siguiente").disabled = false;
  document.getElementById("btn-forzar").disabled = true;
  const btnPausa = document.getElementById("btn-pausa");
  btnPausa.disabled = true;
  btnPausa.textContent = "⏸ Pausar tiempo";
  if (nombre) document.querySelector("#pantalla-lobby p").textContent =
    `Banco: ${esc(nombre)} · ${total} preguntas · Tocá «Siguiente pregunta» para empezar`;
  ocultarError();
}
