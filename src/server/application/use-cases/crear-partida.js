const { generarCodigoPartida } = require("../../domain/game");
const { sendDocente } = require("../game-session");
const { guardarEstado } = require("../app-state");

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
 * Si el cliente manda curso y banco, se valida que el banco esté disponible
 * para ese año antes de crear la partida. El flujo antiguo sin ambos campos
 * sigue permitido para clientes que sólo necesitan generar un código.
 */
function ejecutar(state, msg = {}) {
  const curso = msg.curso ? String(msg.curso).trim() : null;
  const bancoId = msg.bancoId ? String(msg.bancoId).trim() : null;
  if (curso || bancoId) {
    if (!curso || !bancoId || !["1°", "2°", "3°"].includes(curso)) {
      sendDocente(state, { tipo: "error", msg: "Seleccioná un año y un banco disponible." });
      return null;
    }
    const banco = state.db.bancos.find((item) => item.id === bancoId);
    if (!banco || String(banco.anio || "").trim() !== curso || !banco.preguntas.length) {
      sendDocente(state, { tipo: "error", msg: "El banco seleccionado no está disponible para ese año." });
      return null;
    }
    state.estado.cursoSeleccionado = curso;
    state.estado.bancoIdSeleccionado = bancoId;
  } else {
    state.estado.cursoSeleccionado = null;
    state.estado.bancoIdSeleccionado = null;
  }

  const codigosActivos = new Set(state.codigosPartidaEnUso || []);
  if (state.estado.codigoPartida) codigosActivos.add(state.estado.codigoPartida);
  const codigo = generarCodigoPartida(codigosActivos);
  state.estado.codigoPartida = codigo;

  guardarEstado(state.estado);
  sendDocente(state, {
    tipo: "partida_creada",
    codigo,
    curso: state.estado.cursoSeleccionado || null,
    bancoIdSeleccionado: state.estado.bancoIdSeleccionado || null
  });
  return codigo;
}

module.exports = { ejecutar };
