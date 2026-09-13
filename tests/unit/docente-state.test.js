/**
 * @jest-environment jsdom
 */
const { S, syncJugadoresMap, setPantalla } = require('../../src/client/features/docente/state.js');

describe('docente/state', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="pantalla-lobby" style="display:none"></div>
      <div id="pantalla-pregunta" style="display:none"></div>
      <div id="pantalla-resultado" style="display:none"></div>
      <div id="pantalla-fin" style="display:none"></div>
    `;
  });

  test('syncJugadoresMap mapea ids a nombres', () => {
    syncJugadoresMap([
      { id: '1', nombre: 'Ana', online: true },
      { id: '2', nombre: 'Bob', online: false }
    ]);
    expect(S.jugadoresMap['1']).toBe('Ana');
    expect(S.jugadoresMap['2']).toBe('Bob');
    expect(S.jugadoresOnline['1']).toBe(true);
    expect(S.jugadoresOnline['2']).toBe(false);
  });

  test('syncJugadoresMap con lista vacía', () => {
    syncJugadoresMap([]);
    expect(Object.keys(S.jugadoresMap)).toHaveLength(0);
  });

  test('syncJugadoresMap con null', () => {
    syncJugadoresMap(null);
    expect(Object.keys(S.jugadoresMap)).toHaveLength(0);
  });

  test('setPantalla muestra la pantalla indicada', () => {
    setPantalla('lobby');
    expect(document.getElementById('pantalla-lobby').style.display).toBe('block');
    expect(document.getElementById('pantalla-pregunta').style.display).toBe('none');
    setPantalla('pregunta');
    expect(document.getElementById('pantalla-lobby').style.display).toBe('none');
    expect(document.getElementById('pantalla-pregunta').style.display).toBe('block');
  });
});
