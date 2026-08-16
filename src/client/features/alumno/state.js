export const state = {
  ws: null,
  miId: "",
  miNombre: "",
  miPuntaje: 0,
  miRespuesta: null,
  TIEMPO_MAX: 20,
  jugadoresSala: [],
  reconectarAuto: true,
  pendienteEnvio: false,
  sessionToken: ""
};

export function setWS(w) { state.ws = w; }
export function setMiId(id) { state.miId = id; }
export function setMiNombre(n) { state.miNombre = n; }
export function setMiPuntaje(p) { state.miPuntaje = p; }
export function setMiRespuesta(r) { state.miRespuesta = r; }
export function setTiempoMax(t) { state.TIEMPO_MAX = t; }
export function setJugadoresSala(lista) { state.jugadoresSala = lista; }
export function setReconectarAuto(val) { state.reconectarAuto = val; }
export function setPendienteEnvio(v) { state.pendienteEnvio = !!v; }
export function setSessionToken(t) { state.sessionToken = t; }
export function getSessionToken() { return state.sessionToken; }
