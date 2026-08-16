import { state, clearToken, setToken, setBancoActual, setPregEditando, setImportMode, setCsvTexto } from "./state.js";
import { toast } from "./toast.js";
import * as api from "./api-client.js";
import { DEFAULT_NIVEL, DEFAULT_ANIO, DEFAULT_EPOCA, LETRAS_OPCIONES } from "./constants.js";
import * as ui from "./ui.js";
import { esc as escapeHTML } from "../../shared/dom.js";
export { escapeHTML };
const { bancosCache } = state;

function handleUnauthorized() {
  clearToken();
  ui.showModal("modal-auth");
  ui.setElementDisplay("modal-auth", "flex");
}

export async function autenticarAdmin() {
  const pw = document.getElementById("auth-password").value.trim();
  if (!pw) {
    mostrarAuthError("La contraseña no puede estar vacía.");
    return;
  }
  try {
    await api.authenticateAdmin(pw);
    setToken(pw);
    ui.hideModal("modal-auth");
    ui.setElementDisplay("modal-auth", "none");
    ui.setElementDisplay("auth-error-box", "none");
    await cargarSidebar();
  } catch (err) {
    if (err.message === "AUTH_FAILED") {
      mostrarAuthError("Clave incorrecta.");
    } else {
      mostrarAuthError("Error de conexión al servidor.");
    }
  }
}

function mostrarAuthError(msg) {
  ui.setModalContent("auth-error-box", "⚠️ " + msg);
  ui.setElementDisplay("auth-error-box", "block");
}

export async function cargarSidebar() {
  try {
    bancosCache.length = 0;
    const data = await api.fetchBancos();
    bancosCache.push(...data);
  } catch (err) {
    if (err.message === "UNAUTHORIZED") {
      handleUnauthorized();
      return;
    }
    throw err;
  }
  const mobSelect = document.getElementById("mobile-banco-select");
  if (mobSelect) {
    mobSelect.innerHTML = '<option value="">– Seleccionar banco –</option>' +
      bancosCache.map(b => `<option value="${b.id}" ${b.id === state.bancoActualId ? 'selected' : ''}>${escapeHTML(b.nombre)} (${b.cantidad})</option>`).join("");
  }
  const lista = document.getElementById("banco-lista");
  if (!bancosCache.length) {
    ui.setElementHTML("banco-lista", `<div class="empty-state" style="padding:24px 16px;font-size:13px">No hay bancos. Creá el primero 👇</div>`);
    return;
  }
  ui.setElementHTML("banco-lista", bancosCache.map(b => `
    <div class="banco-item ${b.id === state.bancoActualId ? 'activo' : ''}" data-banco-id="${escapeHTML(b.id)}">
      <div class="banco-info">
        <div class="banco-nombre">${escapeHTML(b.nombre)}</div>
        <div class="banco-tags">${escapeHTML(b.nivel)} · ${escapeHTML(b.anio)} · ${escapeHTML(b.tema)}</div>
      </div>
      <span class="banco-count">${b.cantidad}</span>
    </div>`).join(""));
}

export async function seleccionarBanco(id) {
  if (!id) return;
  setBancoActual(id);
  const mobSelect = document.getElementById("mobile-banco-select");
  if (mobSelect) mobSelect.value = id;
  document.querySelectorAll(".banco-item").forEach(el => {
    const isActive = el.dataset.bancoId === id;
    el.classList.toggle("activo", isActive);
  });
  try {
    const banco = await api.fetchBanco(id);
    renderMain(banco);
  } catch (err) {
    if (err.message === "UNAUTHORIZED") {
      handleUnauthorized();
      return;
    }
    toast("Error al cargar el banco", "err");
  }
}

function renderMainHeader(banco) {
  return `
    <div class="main-header">
      <div>
        <h2>${escapeHTML(banco.nombre)}</h2>
        <div class="subtags">
          <span class="tag tag-nivel">📚 ${escapeHTML(banco.nivel)}</span>
          <span class="tag tag-anio">🎓 ${escapeHTML(banco.anio)}</span>
          <span class="tag tag-tema">📌 ${escapeHTML(banco.tema)}</span>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" data-action="edit-banco" data-banco-id="${escapeHTML(banco.id)}">✏️ Editar banco</button>
        <button class="btn btn-blue btn-sm" data-action="import">⬆️ Importar</button>
        <button class="btn btn-green btn-sm" data-action="new-pregunta" data-banco-id="${escapeHTML(banco.id)}">➕ Nueva pregunta</button>
      </div>
    </div>
  `;
}

function renderEmptyState(banco) {
  return `
    <div class="empty-state">
      <div class="icon">❓</div>
      <p style="color:var(--text);font-weight:600">Sin preguntas todavía</p>
      <p style="margin-top:6px">Agregá preguntas manualmente o importá un CSV.</p>
      <div class="btn-row" style="justify-content:center;margin-top:16px">
        <button class="btn btn-gold" data-action="new-pregunta" data-banco-id="${escapeHTML(banco.id)}">➕ Agregar pregunta</button>
        <button class="btn btn-blue" data-action="import">⬆️ Importar CSV</button>
      </div>
    </div>
  `;
}

function renderPreguntaRow(p, i, banco, letras) {
  return `
    <tr>
      <td style="color:var(--muted)">${i+1}</td>
      <td style="max-width:260px">${escapeHTML(p.pregunta)}</td>
      <td style="font-size:12px;color:var(--muted)">${p.opciones.map((o,j) => `<strong>${letras[j]}</strong> ${escapeHTML(o)}`).join('<br>')}</td>
      <td><span class="correcta-badge">${letras[p.correcta]}</span></td>
      <td><span class="epoca-badge">${escapeHTML(p.epoca||'–')}</span></td>
      <td class="acciones-td">
        <button class="btn btn-ghost btn-sm" data-action="edit-pregunta" data-banco-id="${escapeHTML(banco.id)}" data-preg-id="${escapeHTML(p.id)}">✏️</button>
        <button class="btn btn-red btn-sm" data-action="delete-pregunta" data-banco-id="${escapeHTML(banco.id)}" data-preg-id="${escapeHTML(p.id)}">🗑</button>
      </td>
    </tr>
  `;
}

function renderPreguntasTable(banco) {
  const letras = LETRAS_OPCIONES;
  return `
    <div class="card" style="padding:0;overflow:hidden">
      <table class="tabla-preguntas">
        <thead><tr>
          <th style="width:40px">#</th>
          <th>Pregunta</th>
          <th>Opciones</th>
          <th>Correcta</th>
          <th>Época</th>
          <th>Acciones</th>
        </tr></thead>
        <tbody>
          ${banco.preguntas.map((p, i) => renderPreguntaRow(p, i, banco, letras)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderFooter(banco) {
  return `
    <div class="card" style="margin-top:12px">
      <div style="font-size:13px;color:var(--muted)">
        💡 <strong style="color:var(--text)">${banco.preguntas.length} preguntas</strong> en este banco.
        Podés ir al <a href="docente.html" style="color:var(--gold)">panel del docente</a> para seleccionarlo e iniciar el juego.
      </div>
    </div>
  `;
}

function renderMain(banco) {
  const content = banco.preguntas.length === 0 
    ? renderEmptyState(banco) 
    : renderPreguntasTable(banco);
  
  ui.setElementHTML("main-content", 
    renderMainHeader(banco) + content + renderFooter(banco));
}

export function abrirModalBanco(id = null) {
  const banco = id ? state.bancosCache.find(b => b.id === id) : null;
  ui.setModalContent("modal-banco-titulo", banco ? "Editar banco" : "Nuevo banco de preguntas");
  ui.setModalValue("b-nombre", banco?.nombre || "");
  ui.setModalValue("b-nivel", banco?.nivel || DEFAULT_NIVEL);
  ui.setModalValue("b-anio", banco?.anio || DEFAULT_ANIO);
  ui.setModalValue("b-tema", banco?.tema || "");
  ui.setElementDisplay("btn-borrar-banco", banco ? "inline-flex" : "none");
  const btnBorrar = document.getElementById("btn-borrar-banco");
  if (btnBorrar) btnBorrar.dataset.id = id || "";
  const modal = document.getElementById("modal-banco");
  if (modal) modal.dataset.editId = id || "";
  ui.showModal("modal-banco");
}

export async function guardarBanco() {
  const nombre = document.getElementById("b-nombre").value.trim();
  if (!nombre) { toast("El nombre es obligatorio", "err"); return; }
  if (nombre.length < 3) { toast("El nombre debe tener al menos 3 caracteres", "err"); return; }
  const data = { 
    nombre, 
    nivel: document.getElementById("b-nivel").value, 
    anio: document.getElementById("b-anio").value, 
    tema: document.getElementById("b-tema").value.trim() 
  };
  const editId = document.getElementById("modal-banco").dataset.editId;
  try {
    if (editId) {
      await api.updateBanco(editId, data);
      toast("Banco actualizado ✓");
    } else {
      const nuevo = await api.createBanco(data);
      setBancoActual(nuevo.id);
      toast("Banco creado ✓");
    }
  } catch (err) {
    if (err.message === "UNAUTHORIZED") {
      handleUnauthorized();
      return;
    }
    toast(err.message || "Error al guardar el banco", "err");
    return;
  }
  ui.hideModal("modal-banco");
  await cargarSidebar();
  if (state.bancoActualId) seleccionarBanco(state.bancoActualId);
}

export async function borrarBanco() {
  const id = document.getElementById("btn-borrar-banco").dataset.id;
  if (!confirm("¿Eliminar este banco y todas sus preguntas?")) return;
  try {
    await api.deleteBanco(id);
    setBancoActual(null);
    ui.hideModal("modal-banco");
    ui.setElementHTML("main-content", `<div class="empty-state"><div class="icon">📖</div><p style="font-size:16px;font-weight:600;color:var(--text)">Banco eliminado</p><p style="margin-top:6px">Seleccioná otro banco o creá uno nuevo.</p></div>`);
    toast("Banco eliminado", "err");
    await cargarSidebar();
  } catch (err) {
    if (err.message === "UNAUTHORIZED") {
      handleUnauthorized();
      return;
    }
    toast("Error al eliminar el banco", "err");
  }
}

export async function abrirModalPregunta(bancoId = null, pregId = null) {
  setPregEditando(pregId);
  if (bancoId) setBancoActual(bancoId);
  ui.setModalContent("modal-preg-titulo", pregId ? "Editar pregunta" : "Nueva pregunta");
  ui.setElementDisplay("btn-borrar-preg", pregId ? "inline-flex" : "none");
  if (pregId) {
    const banco = await api.fetchBanco(state.bancoActualId);
    const p = banco.preguntas.find(q => q.id === pregId);
    if (p) {
      ui.setModalValue("p-pregunta", p.pregunta);
      ui.setModalValue("p-opA", p.opciones[0] || "");
      ui.setModalValue("p-opB", p.opciones[1] || "");
      ui.setModalValue("p-opC", p.opciones[2] || "");
      ui.setModalValue("p-opD", p.opciones[3] || "");
      ui.setModalValue("p-epoca", p.epoca || "");
      document.querySelectorAll("input[name='correcta']").forEach(r => r.checked = parseInt(r.value) === p.correcta);
    }
  } else {
    ui.setModalValue("p-pregunta", "");
    ["p-opA", "p-opB", "p-opC", "p-opD", "p-epoca"].forEach(id => ui.setModalValue(id, ""));
    document.querySelectorAll("input[name='correcta']")[0].checked = true;
  }
  ui.showModal("modal-pregunta");
}

export async function guardarPregunta() {
  const pregunta = document.getElementById("p-pregunta").value.trim();
  const opciones = [
    document.getElementById("p-opA").value.trim(),
    document.getElementById("p-opB").value.trim(),
    document.getElementById("p-opC").value.trim(),
    document.getElementById("p-opD").value.trim(),
  ];
  if (!pregunta) { toast("La pregunta es obligatoria", "err"); return; }
  if (pregunta.length < 5) { toast("La pregunta debe tener al menos 5 caracteres", "err"); return; }
  if (opciones.some(o => !o)) { toast("Completá todas las opciones", "err"); return; }
  if (opciones.some(o => o.length < 1)) { toast("Cada opción debe tener al menos 1 carácter", "err"); return; }
  const correcta = parseInt(document.querySelector("input[name='correcta']:checked")?.value ?? 0);
  if (correcta < 0 || correcta > 3) { toast("Seleccioná una respuesta correcta válida", "err"); return; }
  const epoca = document.getElementById("p-epoca").value.trim() || DEFAULT_EPOCA;
  const data = { pregunta, opciones, correcta, epoca };
  try {
    if (state.pregEditandoId) {
      await api.updatePregunta(state.bancoActualId, state.pregEditandoId, data);
      toast("Pregunta actualizada ✓");
    } else {
      await api.createPregunta(state.bancoActualId, data);
      toast("Pregunta agregada ✓");
    }
  } catch (err) {
    if (err.message === "UNAUTHORIZED") {
      handleUnauthorized();
      return;
    }
    toast(err.message || "Error al guardar la pregunta", "err");
    return;
  }
  ui.hideModal("modal-pregunta");
  await cargarSidebar();
  await seleccionarBanco(state.bancoActualId);
}

export async function confirmarBorrarPregunta(bancoId, pregId) {
  if (!confirm("¿Eliminar esta pregunta?")) return;
  try {
    await api.deletePregunta(bancoId, pregId);
    toast("Pregunta eliminada", "err");
    await cargarSidebar();
    await seleccionarBanco(bancoId);
  } catch (err) {
    if (err.message === "UNAUTHORIZED") {
      handleUnauthorized();
      return;
    }
    toast("Error al eliminar la pregunta", "err");
  }
}

export async function borrarPregunta() {
  await confirmarBorrarPregunta(state.bancoActualId, state.pregEditandoId);
  ui.hideModal("modal-pregunta");
}

export function abrirModalImport() {
  setCsvTexto("");
  ui.setElementDisplay("csv-preview", "none");
  ui.setElementDisplay("csv-info", "none");
  ui.setModalValue("json-input", "");
  ui.showModal("modal-import");
}

export function switchImport(mode) {
  setImportMode(mode);
  document.querySelectorAll(".import-tab").forEach((t, i) => ui.toggleClass(t, "activo", (i === 0 && mode === "csv") || (i === 1 && mode === "json")));
  ui.setElementDisplay("import-csv", mode === "csv" ? "block" : "none");
  ui.setElementDisplay("import-json", mode === "json" ? "block" : "none");
}

export function leerCSV(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const txt = e.target.result;
    setCsvTexto(txt);
    const lineas = txt.split("\n").filter(l => l.trim());
    ui.setElementDisplay("csv-preview", "block");
    ui.setModalContent("csv-preview", lineas.slice(0, 5).join("\n") + (lineas.length > 5 ? `\n... (${lineas.length - 1} filas)` : ``));
    ui.setElementDisplay("csv-info", "block");
    ui.setModalContent("csv-info", `✓ ${lineas.length - 1} preguntas detectadas`);
  };
  reader.readAsText(file);
}

export async function importar() {
  if (!state.bancoActualId) { toast("Seleccioná un banco primero", "err"); return; }
  let result;
  try {
    if (state.importMode === "csv") {
      if (!state.csvTexto) { toast("Seleccioná un archivo CSV", "err"); return; }
      result = await api.importCSV(state.bancoActualId, state.csvTexto);
    } else {
      const raw = document.getElementById("json-input").value.trim();
      if (!raw) { toast("El JSON está vacío", "err"); return; }
      let parsed;
      try { parsed = JSON.parse(raw); } catch { toast("JSON inválido", "err"); return; }
      if (!Array.isArray(parsed) && !parsed.preguntas) { toast("El JSON debe ser un array o tener propiedad 'preguntas'", "err"); return; }
      result = await api.importJSON(state.bancoActualId, parsed);
    }
    if (result.importadas !== undefined) {
      toast(`✓ ${result.importadas} preguntas importadas`);
      ui.hideModal("modal-import");
      await cargarSidebar();
      await seleccionarBanco(state.bancoActualId);
    } else {
      toast(result.error || "Error al importar", "err");
      console.error("Import error:", result);
    }
  } catch (err) {
    console.error("Import exception:", err);
    if (err.message === "UNAUTHORIZED") {
      handleUnauthorized();
      return;
    }
    toast(err.message || "Error al importar", "err");
  }
}

export function cerrarModal(id) {
  ui.hideModal(id);
}
