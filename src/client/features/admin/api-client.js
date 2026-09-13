import { state } from "./state.js";

async function apiFetch(url, opts = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-Admin-Token": state.token
  };
  const r = await fetch(url, { headers, ...opts });
  if (r.status === 401 || r.status === 403) {
    throw new Error("UNAUTHORIZED");
  }
  if (!r.ok) {
    const errData = await r.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP ${r.status}`);
  }
  return r.json();
}

export async function authenticateAdmin(password) {
  const headers = { "Content-Type": "application/json", "X-Admin-Token": password };
  const r = await fetch("/api/bancos", { headers });
  if (!r.ok) {
    throw new Error("AUTH_FAILED");
  }
  return r.json();
}

export async function fetchBancos() {
  return apiFetch("/api/bancos");
}

export async function fetchBanco(id) {
  return apiFetch(`/api/bancos/${id}`);
}

export async function createBanco(data) {
  return apiFetch("/api/bancos", { method: "POST", body: JSON.stringify(data) });
}

export async function updateBanco(id, data) {
  return apiFetch(`/api/bancos/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteBanco(id) {
  return apiFetch(`/api/bancos/${id}`, { method: "DELETE" });
}

export async function createPregunta(bancoId, data) {
  return apiFetch(`/api/bancos/${bancoId}/preguntas`, { method: "POST", body: JSON.stringify(data) });
}

export async function updatePregunta(bancoId, pregId, data) {
  return apiFetch(`/api/bancos/${bancoId}/preguntas/${pregId}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deletePregunta(bancoId, pregId) {
  return apiFetch(`/api/bancos/${bancoId}/preguntas/${pregId}`, { method: "DELETE" });
}

export async function importCSV(bancoId, csv) {
  return apiFetch(`/api/bancos/${bancoId}/importar-csv`, { method: "POST", body: JSON.stringify({ csv }) });
}

export async function importJSON(bancoId, data) {
  return apiFetch(`/api/bancos/${bancoId}/importar-json`, { method: "POST", body: JSON.stringify(data) });
}

// ── Cuentas de alumno (sección 21) ──────────────────────────────────────
export async function fetchUsuarios(q) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return apiFetch(`/api/admin/usuarios${qs}`);
}

export async function setUsuarioActivo(id, activo) {
  return apiFetch(`/api/admin/usuarios/${id}/activo`, { method: "POST", body: JSON.stringify({ activo }) });
}
