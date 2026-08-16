function requireDocenteWs(ws, state) {
  if (!(ws && state.docente && ws === state.docente && ws.esDocenteAutenticado)) {
    ws.send(JSON.stringify({ tipo: "error", msg: "No autorizado." }));
    return false;
  }
  return true;
}

module.exports = { requireDocenteWs };
