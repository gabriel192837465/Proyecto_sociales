<<<<<<< HEAD
import { EPOCA_COLORES } from "../../shared/constants.js";

export const S = {
  ws: null,
  TIEMPO_MAX: 20,
  epocaColores: { ...EPOCA_COLORES },
  bancosCache: [],
  totalJugadores: 0,
  jugadoresMap: {},
  jugadoresOnline: {},
  idsRespondieronActual: [],
  fase: "",
  pantallaActual: "lobby",
  token: localStorage.getItem("admin_token") || "",
  // sección 6/12: código de partida + datos de red para regenerar el QR
  // cuando llega `partida_creada` (con el código embebido en la URL).
  serverIP: null,
  serverPort: null,
  codigoPartida: null
};

export function syncJugadoresMap(lista) {
  S.jugadoresMap = {};
  S.jugadoresOnline = {};
  (lista || []).forEach(j => {
    S.jugadoresMap[j.id] = j.nombre;
    S.jugadoresOnline[j.id] = j.online !== false;
  });
}

export function setToken(t) {
  S.token = t;
  localStorage.setItem("admin_token", t);
}

export function clearToken() {
  S.token = "";
  localStorage.removeItem("admin_token");
}

export function setPantalla(p) {
  S.pantallaActual = p;
  ["lobby", "pregunta", "resultado", "fin"].forEach(id => {
    const el = document.getElementById("pantalla-" + id);
    if (el) el.style.display = id === p ? "block" : "none";
  });
  const iniciar = document.getElementById("btn-iniciar");
  const terminar = document.getElementById("btn-terminar-reiniciar");
  const partidaActiva = p === "pregunta" || p === "resultado";
  if (iniciar) iniciar.style.display = partidaActiva ? "none" : "inline-flex";
  if (terminar) terminar.style.display = partidaActiva ? "inline-flex" : "none";
}
=======
import { EPOCA_COLORES } from "../../shared/constants.js";

export const S = {
  ws: null,
  TIEMPO_MAX: 20,
  epocaColores: { ...EPOCA_COLORES },
  bancosCache: [],
  totalJugadores: 0,
  jugadoresMap: {},
  jugadoresOnline: {},
  idsRespondieronActual: [],
  fase: "",
  pantallaActual: "lobby",
  token: localStorage.getItem("admin_token") || ""
};

export function syncJugadoresMap(lista) {
  S.jugadoresMap = {};
  S.jugadoresOnline = {};
  (lista || []).forEach(j => {
    S.jugadoresMap[j.id] = j.nombre;
    S.jugadoresOnline[j.id] = j.online !== false;
  });
}

export function setToken(t) {
  S.token = t;
  localStorage.setItem("admin_token", t);
}

export function clearToken() {
  S.token = "";
  localStorage.removeItem("admin_token");
}

export function setPantalla(p) {
  S.pantallaActual = p;
  ["lobby", "pregunta", "resultado", "fin"].forEach(id => {
    const el = document.getElementById("pantalla-" + id);
    if (el) el.style.display = id === p ? "block" : "none";
  });
}
>>>>>>> origin/main
