export const state = {
  bancosCache: [],
  bancoActualId: null,
  pregEditandoId: null,
  importMode: "csv",
  csvTexto: "",
  token: localStorage.getItem("admin_token") || ""
};

export function setToken(t) {
  state.token = t;
  localStorage.setItem("admin_token", t);
}

export function clearToken() {
  state.token = "";
  localStorage.removeItem("admin_token");
}

export function setBancoActual(id) {
  state.bancoActualId = id;
}

export function setPregEditando(id) {
  state.pregEditandoId = id;
}

export function setImportMode(mode) {
  state.importMode = mode;
}

export function setCsvTexto(text) {
  state.csvTexto = text;
}
