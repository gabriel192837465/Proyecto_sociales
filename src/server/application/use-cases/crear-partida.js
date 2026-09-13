const { generarCodigoPartida } = require("../../domain/game");
const { sendDocente } = require("../game-session");
const { guardarEstado } = require("../app-state");
const { getCursoBancoMap } = require("../../infra/db");

/**
 * El docente crea una partida nueva: genera un código de 6 dígitos que
 * los alumnos usarán para entrar (sección 6/7 del pedido). El código
 * identifica la PARTIDA; la cuenta del alumno lo identifica a él — no se
 * mezclan ambas identidades.
 *
 * Crear una partida nueva invalida el código anterior (se sobreescribe).
 * No reinicia jugadores ya conectados: eso lo sigue haciendo `iniciar_juego`
 * al elegir el banco, igual que antes.
 *
 * Sección 13/20: si el docente manda `curso` (p. ej. "1°"), se resuelve el
 * banco correspondiente vía el mapeo curso→banco configurado en
 * administración y se guarda en el estado — así "Comenzar" (iniciar_juego)
 * ya no necesita que el docente elija el banco a mano en el flujo normal.
 * Si el curso no tiene banco mapeado, se informa el error pero la partida
 * igual se crea (el docente puede resolverlo desde administración o pasar
 * bancoId explícito al iniciar).
 */
function ejecutar(state, msg = {}) {
  const codigo = generarCodigoPartida(state.estado.codigoPartida);
  state.estado.codigoPartida = codigo;

  let bancoAutoError = null;
  const curso = msg.curso ? String(msg.curso).trim() : null;
  if (curso) {
    const mapa = getCursoBancoMap();
    const bancoId = mapa[curso];
    if (bancoId && state.db.bancos.some((b) => b.id === bancoId)) {
      state.estado.cursoSeleccionado = curso;
      state.estado.bancoIdSeleccionado = bancoId;
    } else {
      state.estado.cursoSeleccionado = curso;
      state.estado.bancoIdSeleccionado = null;
      bancoAutoError = `No hay un banco de preguntas configurado para ${curso}. Podés elegirlo manualmente en Administración.`;
    }
  }

  guardarEstado(state.estado);
  sendDocente(state, {
    tipo: "partida_creada",
    codigo,
    curso: state.estado.cursoSeleccionado || null,
    bancoIdSeleccionado: state.estado.bancoIdSeleccionado || null,
    ...(bancoAutoError ? { avisoBanco: bancoAutoError } : {})
  });
  return codigo;
}

module.exports = { ejecutar };
