/**
 * @jest-environment jsdom
 */
const { S, syncJugadoresMap } = require('../../src/client/features/docente/state.js');
const { actualizarRanking, actualizarRankingGeneral } = require('../../src/client/features/docente/views/ranking-lista.js');
const { actualizarRespuestasEnPregunta } = require('../../src/client/features/docente/views/jugadores-chips.js');
const { mostrarResultado } = require('../../src/client/features/docente/views/pantalla-resultado.js');
const { mostrarFin, buildInformeCSV, exportarInformeCSV, imprimirInforme } = require('../../src/client/features/docente/views/pantalla-fin.js');

const CSV_HEADER = 'id,nombre,puntaje,n,pregunta,correctaLetra,opcionLetra,opcionTexto,respondio,acerto';

describe('docente/views', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="ranking-lista"></div>
      <div id="ranking-general-lista"></div>
      <div id="resp-estado-alumnos"></div>
      <div id="pantalla-lobby"><p></p></div>
      <div id="pantalla-pregunta"></div>
      <div id="pantalla-resultado"></div>
      <div id="pantalla-fin"></div>
      <div id="count-jugadores"></div>
      <div id="lista-jugadores"></div>
      <div id="btn-siguiente"></div>
      <div id="btn-forzar"></div>
      <div id="btn-pausa"></div>
      <div id="error-box" style="display:none"></div>
      <div id="resultado-contenido"></div>
      <div id="podio-fin"></div>
    `;
    S.jugadoresMap = {};
    S.jugadoresOnline = {};
    S.idsRespondieronActual = [];
  });

  describe('ranking-lista', () => {
    test('actualizarRanking con jugadores', () => {
      syncJugadoresMap([{ id: '1', nombre: 'Ana', online: true }]);
      actualizarRanking([{ id: '1', nombre: 'Ana', puntaje: 100 }]);
      expect(document.getElementById('ranking-lista').innerHTML).toContain('Ana');
      expect(document.getElementById('ranking-lista').innerHTML).toContain('100');
    });

    test('actualizarRanking vacío muestra placeholder', () => {
      actualizarRanking([]);
      expect(document.getElementById('ranking-lista').innerHTML).toContain('Sin jugadores');
    });

    test('actualizarRankingGeneral con jugadores', () => {
      syncJugadoresMap([{ id: '1', nombre: 'Ana', online: true }]);
      actualizarRankingGeneral([{ id: '1', nombre: 'Ana', puntajeGeneral: 200 }]);
      expect(document.getElementById('ranking-general-lista').innerHTML).toContain('200');
    });

    test('actualizarRankingGeneral vacío muestra placeholder', () => {
      actualizarRankingGeneral([]);
      expect(document.getElementById('ranking-general-lista').innerHTML).toContain('Sin jugadores');
    });

    test('actualizarRankingGeneral muestra offline tag', () => {
      syncJugadoresMap([{ id: '1', nombre: 'Bob', online: false }]);
      actualizarRankingGeneral([{ id: '1', nombre: 'Bob', puntajeGeneral: 50 }]);
      expect(document.getElementById('ranking-general-lista').innerHTML).toContain('offline');
    });
  });

  describe('jugadores-chips', () => {
    test('actualizarRespuestasEnPregunta sin alumnos', () => {
      actualizarRespuestasEnPregunta([]);
      expect(document.getElementById('resp-estado-alumnos').innerHTML).toContain('Sin alumnos');
    });

    test('actualizarRespuestasEnPregunta muestra respondieron y pendientes', () => {
      syncJugadoresMap([
        { id: '1', nombre: 'Ana', online: true },
        { id: '2', nombre: 'Bob', online: true }
      ]);
      actualizarRespuestasEnPregunta(['1']);
      const html = document.getElementById('resp-estado-alumnos').innerHTML;
      expect(html).toContain('Ana');
      expect(html).toContain('Bob');
      expect(html).toContain('Ya respondieron');
      expect(html).toContain('Esperando respuesta');
    });

    test('actualizarRespuestasEnPregunta sin elemento no falla', () => {
      document.getElementById('resp-estado-alumnos').remove();
      expect(() => actualizarRespuestasEnPregunta([])).not.toThrow();
    });
  });

  describe('pantalla-resultado', () => {
    test('mostrarResultado renderiza barras', () => {
      syncJugadoresMap([{ id: '1', nombre: 'Ana', online: true }]);
      mostrarResultado({ correcta: 0, respuestas: { '1': 0 }, ranking: [{ id: '1', nombre: 'Ana', puntaje: 100 }], rankingGeneral: [] });
      const html = document.getElementById('resultado-contenido').innerHTML;
      expect(html).toContain('Respondieron');
      expect(html).toContain('Correcta');
    });
  });

  describe('pantalla-fin', () => {
    test('mostrarFin renderiza informe', () => {
      syncJugadoresMap([{ id: '1', nombre: 'Ana', online: true }]);
      mostrarFin(
        [{ id: '1', nombre: 'Ana', puntaje: 300, detalle: [{ n: 1, pregunta: '¿?', respondio: true, acerto: true }] }],
        [{ id: '1', nombre: 'Ana', puntajeGeneral: 500 }]
      );
      expect(document.getElementById('podio-fin').innerHTML).toContain('Ana');
      expect(document.getElementById('ranking-general-lista').innerHTML).toContain('500');
    });

    test('buildInformeCSV: todas las filas, acentos, delimitadores, CRLF y BOM', () => {
      const informe = [
        {
          id: '1',
          nombre: 'Ana',
          puntaje: 300,
          detalle: [
            { n: 1, pregunta: '¿Qué dijo "San Martín"?', correctaLetra: 'A', opcionLetra: 'A', opcionTexto: 'Cruzar, los Andes', respondio: true, acerto: true },
            { n: 2, pregunta: '¿En qué año?', correctaLetra: 'B', opcionLetra: null, opcionTexto: null, respondio: false, acerto: false }
          ]
        },
        {
          id: '2',
          nombre: 'José',
          puntaje: 200,
          detalle: [
            { n: 1, pregunta: 'Línea\npartida', correctaLetra: 'A', opcionLetra: 'B', opcionTexto: 'Otra', respondio: true, acerto: false }
          ]
        }
      ];
      const csv = buildInformeCSV(informe);
      expect(csv.startsWith('\uFEFF')).toBe(true);
      expect(csv.endsWith('\r\n')).toBe(true);
      expect(csv).toBe(
        '\uFEFF' + [
          CSV_HEADER,
          '1,Ana,300,1,"¿Qué dijo ""San Martín""?",A,A,"Cruzar, los Andes",true,true',
          '1,Ana,300,2,¿En qué año?,B,,,false,false',
          '2,José,200,1,"Línea\npartida",A,B,Otra,true,false'
        ].join('\r\n') + '\r\n'
      );
    });

    test('buildInformeCSV: neutraliza celdas que empiezan con = + - @', () => {
      const informe = [{
        id: '1',
        nombre: 'Ana',
        puntaje: 100,
        detalle: [
          { n: 1, pregunta: '=SUM(A1:A2)', correctaLetra: 'A', opcionLetra: '@x', opcionTexto: '+texto', respondio: true, acerto: true },
          { n: 2, pregunta: '-hidden', correctaLetra: 'B', opcionLetra: 'B', opcionTexto: '-a,b', respondio: true, acerto: false }
        ]
      }];
      expect(buildInformeCSV(informe)).toBe(
        '\uFEFF' + [
          CSV_HEADER,
          "1,Ana,100,1,'=SUM(A1:A2),A,'@x,'+texto,true,true",
          "1,Ana,100,2,'-hidden,B,B,\"'-a,b\",true,false"
        ].join('\r\n') + '\r\n'
      );
    });

    test('buildInformeCSV: informe vacío devuelve solo el encabezado', () => {
      expect(buildInformeCSV([])).toBe('\uFEFF' + CSV_HEADER + '\r\n');
    });

    test('buildInformeCSV: alumno sin detalle no genera filas', () => {
      const csv = buildInformeCSV([{ id: '1', nombre: 'Ana', puntaje: 0, detalle: undefined }]);
      expect(csv).toBe('\uFEFF' + CSV_HEADER + '\r\n');
    });

    test('exportarInformeCSV descarga el informe retenido por mostrarFin', async () => {
      URL.createObjectURL = jest.fn(() => 'blob:mock');
      URL.revokeObjectURL = jest.fn();
      const clickSpy = jest.fn();
      HTMLAnchorElement.prototype.click = clickSpy;
      mostrarFin(
        [{ id: '1', nombre: 'Ana', puntaje: 300, detalle: [{ n: 1, pregunta: '¿?', correctaLetra: 'A', opcionLetra: 'A', opcionTexto: 'Sí', respondio: true, acerto: true }] }],
        []
      );
      exportarInformeCSV();
      expect(clickSpy).toHaveBeenCalledTimes(1);
      const blob = URL.createObjectURL.mock.calls[0][0];
      expect(blob).toBeInstanceOf(Blob);
      const csv = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(blob);
      });
      // jsdom's FileReader strips the leading BOM on decode; the BOM itself is
      // asserted in the buildInformeCSV pure-function tests above.
      expect(csv).toContain('Ana');
      expect(csv).toContain('Sí');
    });

    test('imprimirInforme llama a window.print', () => {
      const printSpy = jest.fn();
      window.print = printSpy;
      imprimirInforme();
      expect(printSpy).toHaveBeenCalledTimes(1);
    });
  });
});
