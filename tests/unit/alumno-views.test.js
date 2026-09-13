<<<<<<< HEAD
/**
 * @jest-environment jsdom
 */
const { setPantalla, mostrarPregunta, mostrarResultado, mostrarFin } = require('../../src/client/features/alumno/views.js');
const { setMiId, setMiRespuesta, setMiPuntaje } = require('../../src/client/features/alumno/state.js');

describe('alumno/views', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="screen" id="s-unirse"></div>
      <div class="screen activa" id="s-espera"></div>
      <div class="screen" id="s-pregunta"></div>
      <div class="screen" id="s-respondio"></div>
      <div class="screen" id="s-resultado"></div>
      <div class="screen" id="s-fin"></div>
      <div id="pausa-alerta"></div>
      <div id="pregunta-txt"></div>
      <div id="opciones-container"></div>
      <div id="timer-bar"></div>
      <div id="timer-num"></div>
      <div id="res-icono"></div>
      <div id="res-titulo"></div>
      <div id="res-pts"></div>
      <div id="res-desc"></div>
      <div id="ranking-final"></div>
      <div id="ranking-general-final"></div>
      <div id="mi-historial" style="display:none"></div>
      <div id="mi-historial-lista"></div>
    `;
    setMiId('alumno_1');
    setMiRespuesta(null);
  });

  test('setPantalla cambia pantalla activa', () => {
    setPantalla('s-pregunta');
    expect(document.getElementById('s-pregunta').classList.contains('activa')).toBe(true);
    expect(document.getElementById('s-espera').classList.contains('activa')).toBe(false);
  });

  test('mostrarPregunta renderiza opciones', () => {
    setPantalla('s-espera');
    mostrarPregunta({ pregunta: '¿Test?', opciones: ['A', 'B', 'C', 'D'], tiempo: 20 });
    expect(document.getElementById('pregunta-txt').textContent).toBe('¿Test?');
    const btns = document.querySelectorAll('.opcion-btn');
    expect(btns.length).toBe(4);
    expect(btns[0].textContent).toContain('A');
  });

  test('mostrarResultado correcto', () => {
    setMiRespuesta(0);
    mostrarResultado({ correcta: 0, ranking: [{ id: 'alumno_1', puntaje: 100 }] });
    expect(document.getElementById('res-icono').textContent).toBe('✅');
    expect(document.getElementById('res-titulo').textContent).toBe('¡Correcto!');
  });

  test('mostrarResultado incorrecto', () => {
    setMiRespuesta(1);
    mostrarResultado({ correcta: 0, ranking: [] });
    expect(document.getElementById('res-icono').textContent).toBe('❌');
    expect(document.getElementById('res-titulo').textContent).toBe('Incorrecto');
  });

  test('mostrarResultado sin respuesta', () => {
    setMiRespuesta(null);
    mostrarResultado({ correcta: 0, ranking: [] });
    expect(document.getElementById('res-icono').textContent).toBe('⏰');
    expect(document.getElementById('res-titulo').textContent).toBe('¡Se acabó el tiempo!');
  });

  test('mostrarFin renderiza ranking', () => {
    mostrarFin(
      [{ id: 'alumno_1', nombre: 'Ana', puntaje: 200 }],
      [{ id: 'alumno_1', nombre: 'Ana', puntajeGeneral: 500 }]
    );
    expect(document.getElementById('ranking-final').innerHTML).toContain('Ana');
    expect(document.getElementById('ranking-general-final').innerHTML).toContain('500');
  });

  describe('REQ-UI-11: Mis respuestas (miHistorial)', () => {
    const MI_HISTORIAL = [
      { n: 1, pregunta: '¿Pregunta 1?', correctaLetra: 'A', opcionLetra: 'B', opcionTexto: 'Otra <x>', respondio: true, acerto: false },
      { n: 2, pregunta: '¿Pregunta 2?', correctaLetra: 'C', opcionLetra: 'C', opcionTexto: 'C', respondio: true, acerto: true },
      { n: 3, pregunta: '¿Pregunta 3?', correctaLetra: 'D', opcionLetra: null, opcionTexto: null, respondio: false, acerto: false }
    ];

    test('con miHistorial: muestra el resumen con número, letras y resultado por item', () => {
      mostrarFin(
        [{ id: 'alumno_1', nombre: 'Ana', puntaje: 200 }],
        [],
        MI_HISTORIAL
      );

      const cont = document.getElementById('mi-historial');
      const lista = document.getElementById('mi-historial-lista');
      expect(cont.style.display).toBe('block');
      expect(lista.children.length).toBe(3);
      const html = lista.innerHTML;
      // Número de pregunta en cada item
      expect(html).toContain('Pregunta 1');
      expect(html).toContain('Pregunta 2');
      expect(html).toContain('Pregunta 3');
      // Letras propias y texto respondido (escapado: <x> no debe quedar crudo)
      expect(html).toContain('B)');
      expect(html).toContain('Otra &lt;x&gt;');
      expect(html).not.toContain('Otra <x>');
      // Resultado: incorrecta → corrige con la letra correcta
      expect(html).toContain('✗ Correcta: A');
      // Resultado: correcta
      expect(html).toContain('✓ Correcto');
      // Sin responder → sin letra propia y muestra la correcta
      expect(html).toContain('Sin respuesta');
      expect(html).toContain('Correcta: D');
    });

    test('sin miHistorial: oculta el resumen y los rankings siguen renderizando', () => {
      // Resumen visible de una pantalla anterior: debe quedar oculto al renderizar.
      document.getElementById('mi-historial').style.display = 'block';
      document.getElementById('mi-historial-lista').innerHTML = '<div>viejo</div>';

      mostrarFin(
        [{ id: 'alumno_1', nombre: 'Ana', puntaje: 200 }],
        [{ id: 'alumno_1', nombre: 'Ana', puntajeGeneral: 500 }]
      );

      expect(document.getElementById('mi-historial').style.display).toBe('none');
      expect(document.getElementById('mi-historial-lista').innerHTML).toBe('');
      expect(document.getElementById('ranking-final').innerHTML).toContain('Ana');
      expect(document.getElementById('ranking-general-final').innerHTML).toContain('500');
    });
  });
});
=======
/**
 * @jest-environment jsdom
 */
const { setPantalla, mostrarPregunta, mostrarResultado, mostrarFin } = require('../../src/client/features/alumno/views.js');
const { setMiId, setMiRespuesta, setMiPuntaje } = require('../../src/client/features/alumno/state.js');

describe('alumno/views', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="screen" id="s-unirse"></div>
      <div class="screen activa" id="s-espera"></div>
      <div class="screen" id="s-pregunta"></div>
      <div class="screen" id="s-respondio"></div>
      <div class="screen" id="s-resultado"></div>
      <div class="screen" id="s-fin"></div>
      <div id="pausa-alerta"></div>
      <div id="pregunta-txt"></div>
      <div id="opciones-container"></div>
      <div id="timer-bar"></div>
      <div id="timer-num"></div>
      <div id="res-icono"></div>
      <div id="res-titulo"></div>
      <div id="res-pts"></div>
      <div id="res-desc"></div>
      <div id="ranking-final"></div>
      <div id="ranking-general-final"></div>
      <div id="mi-historial" style="display:none"></div>
      <div id="mi-historial-lista"></div>
    `;
    setMiId('alumno_1');
    setMiRespuesta(null);
  });

  test('setPantalla cambia pantalla activa', () => {
    setPantalla('s-pregunta');
    expect(document.getElementById('s-pregunta').classList.contains('activa')).toBe(true);
    expect(document.getElementById('s-espera').classList.contains('activa')).toBe(false);
  });

  test('mostrarPregunta renderiza opciones', () => {
    setPantalla('s-espera');
    mostrarPregunta({ pregunta: '¿Test?', opciones: ['A', 'B', 'C', 'D'], tiempo: 20 });
    expect(document.getElementById('pregunta-txt').textContent).toBe('¿Test?');
    const btns = document.querySelectorAll('.opcion-btn');
    expect(btns.length).toBe(4);
    expect(btns[0].textContent).toContain('A');
  });

  test('mostrarResultado correcto', () => {
    setMiRespuesta(0);
    mostrarResultado({ correcta: 0, ranking: [{ id: 'alumno_1', puntaje: 100 }] });
    expect(document.getElementById('res-icono').textContent).toBe('✅');
    expect(document.getElementById('res-titulo').textContent).toBe('¡Correcto!');
  });

  test('mostrarResultado incorrecto', () => {
    setMiRespuesta(1);
    mostrarResultado({ correcta: 0, ranking: [] });
    expect(document.getElementById('res-icono').textContent).toBe('❌');
    expect(document.getElementById('res-titulo').textContent).toBe('Incorrecto');
  });

  test('mostrarResultado sin respuesta', () => {
    setMiRespuesta(null);
    mostrarResultado({ correcta: 0, ranking: [] });
    expect(document.getElementById('res-icono').textContent).toBe('⏰');
    expect(document.getElementById('res-titulo').textContent).toBe('¡Se acabó el tiempo!');
  });

  test('mostrarFin renderiza ranking', () => {
    mostrarFin(
      [{ id: 'alumno_1', nombre: 'Ana', puntaje: 200 }],
      [{ id: 'alumno_1', nombre: 'Ana', puntajeGeneral: 500 }]
    );
    expect(document.getElementById('ranking-final').innerHTML).toContain('Ana');
    expect(document.getElementById('ranking-general-final').innerHTML).toContain('500');
  });

  describe('REQ-UI-11: Mis respuestas (miHistorial)', () => {
    const MI_HISTORIAL = [
      { n: 1, pregunta: '¿Pregunta 1?', correctaLetra: 'A', opcionLetra: 'B', opcionTexto: 'Otra <x>', respondio: true, acerto: false },
      { n: 2, pregunta: '¿Pregunta 2?', correctaLetra: 'C', opcionLetra: 'C', opcionTexto: 'C', respondio: true, acerto: true },
      { n: 3, pregunta: '¿Pregunta 3?', correctaLetra: 'D', opcionLetra: null, opcionTexto: null, respondio: false, acerto: false }
    ];

    test('con miHistorial: muestra el resumen con número, letras y resultado por item', () => {
      mostrarFin(
        [{ id: 'alumno_1', nombre: 'Ana', puntaje: 200 }],
        [],
        MI_HISTORIAL
      );

      const cont = document.getElementById('mi-historial');
      const lista = document.getElementById('mi-historial-lista');
      expect(cont.style.display).toBe('block');
      expect(lista.children.length).toBe(3);
      const html = lista.innerHTML;
      // Número de pregunta en cada item
      expect(html).toContain('Pregunta 1');
      expect(html).toContain('Pregunta 2');
      expect(html).toContain('Pregunta 3');
      // Letras propias y texto respondido (escapado: <x> no debe quedar crudo)
      expect(html).toContain('B)');
      expect(html).toContain('Otra &lt;x&gt;');
      expect(html).not.toContain('Otra <x>');
      // Resultado: incorrecta → corrige con la letra correcta
      expect(html).toContain('✗ Correcta: A');
      // Resultado: correcta
      expect(html).toContain('✓ Correcto');
      // Sin responder → sin letra propia y muestra la correcta
      expect(html).toContain('Sin respuesta');
      expect(html).toContain('Correcta: D');
    });

    test('sin miHistorial: oculta el resumen y los rankings siguen renderizando', () => {
      // Resumen visible de una pantalla anterior: debe quedar oculto al renderizar.
      document.getElementById('mi-historial').style.display = 'block';
      document.getElementById('mi-historial-lista').innerHTML = '<div>viejo</div>';

      mostrarFin(
        [{ id: 'alumno_1', nombre: 'Ana', puntaje: 200 }],
        [{ id: 'alumno_1', nombre: 'Ana', puntajeGeneral: 500 }]
      );

      expect(document.getElementById('mi-historial').style.display).toBe('none');
      expect(document.getElementById('mi-historial-lista').innerHTML).toBe('');
      expect(document.getElementById('ranking-final').innerHTML).toContain('Ana');
      expect(document.getElementById('ranking-general-final').innerHTML).toContain('500');
    });
  });
});
>>>>>>> origin/main
