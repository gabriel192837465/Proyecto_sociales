const {
  crearEstadoInicial,
  generarCodigoPartida,
  getRanking,
  getRankingGeneral,
  esOpcionValida
} = require('../../src/server/domain/game');


describe('Lógica del juego', () => {
  describe('crearEstadoInicial', () => {
    it('debería crear un estado inicial válido', () => {
      const estado = crearEstadoInicial();
      expect(estado.fase).toBe('lobby');
      expect(estado.preguntaIdx).toBe(-1);
      expect(estado.tiempoRestante).toBe(0);
      expect(estado.jugadores).toEqual({});
      expect(estado.pausado).toBe(false);
    });

    it('no tiene código de partida hasta que el docente crea una (compatibilidad)', () => {
      const estado = crearEstadoInicial();
      expect(estado.codigoPartida).toBeNull();
    });
  });

  describe('generarCodigoPartida', () => {
    it('genera un código de exactamente 6 dígitos', () => {
      const codigo = generarCodigoPartida();
      expect(codigo).toMatch(/^\d{6}$/);
    });

    it('nunca genera un código con todos los dígitos iguales (000000, 111111, etc.)', () => {
      for (let i = 0; i < 500; i++) {
        const codigo = generarCodigoPartida();
        expect(codigo).not.toMatch(/^(\d)\1{5}$/);
      }
    });

    it('evita colisionar con el código activo pasado como argumento', () => {
      for (let i = 0; i < 200; i++) {
        const activo = String(i).padStart(6, "0");
        const nuevo = generarCodigoPartida(activo);
        expect(nuevo).not.toBe(activo);
      }
    });
  });

  describe('getRanking', () => {
    it('debería ordenar jugadores online por puntaje descendente', () => {
      const jugadores = {
        'id1': { nombre: 'Juan', puntaje: 100, online: true },
        'id2': { nombre: 'Maria', puntaje: 200, online: true },
        'id3': { nombre: 'Pedro', puntaje: 50, online: false }
      };

      const ranking = getRanking(jugadores);

      expect(ranking).toHaveLength(2);
      expect(ranking[0].nombre).toBe('Maria');
      expect(ranking[0].puntaje).toBe(200);
      expect(ranking[1].nombre).toBe('Juan');
    });

    it('debería limitar a 20 jugadores', () => {
      const jugadores = {};
      for (let i = 0; i < 25; i++) {
        jugadores[`id${i}`] = { nombre: `Jugador${i}`, puntaje: i * 10, online: true };
      }
      
      const ranking = getRanking(jugadores);
      expect(ranking.length).toBe(20);
    });
  });

  describe('getRankingGeneral', () => {
    it('debería ordenar por puntaje general', () => {
      const jugadores = {
        'id1': { nombre: 'Juan', puntajeGeneral: 500 },
        'id2': { nombre: 'Maria', puntajeGeneral: 1000 },
        'id3': { nombre: 'Pedro', puntajeGeneral: 250 }
      };
      
      const ranking = getRankingGeneral(jugadores);
      
      expect(ranking[0].nombre).toBe('Maria');
      expect(ranking[0].puntajeGeneral).toBe(1000);
      expect(ranking[1].nombre).toBe('Juan');
    });
  });

  describe('esOpcionValida', () => {
    it('debería aceptar índices entre 0 y 3', () => {
      expect(esOpcionValida(0)).toBe(true);
      expect(esOpcionValida(1)).toBe(true);
      expect(esOpcionValida(2)).toBe(true);
      expect(esOpcionValida(3)).toBe(true);
    });

    it('debería rechazar índices fuera de rango', () => {
      expect(esOpcionValida(-1)).toBe(false);
      expect(esOpcionValida(4)).toBe(false);
      expect(esOpcionValida(5)).toBe(false);
    });

    it('debería rechazar valores no numéricos', () => {
      expect(esOpcionValida('a')).toBe(false);
      expect(esOpcionValida(null)).toBe(false);
      expect(esOpcionValida(undefined)).toBe(false);
    });
  });

  describe('registrarHistorialPregunta', () => {
    const { registrarHistorialPregunta, crearEstadoInicial } = require('../../src/server/domain/game');
    const { LETRAS } = require('../../src/server/domain/constants');

    it('debería registrar historial de cada jugador', () => {
      const estado = crearEstadoInicial();
      estado.preguntasActivas = [
        { pregunta: '¿Test?', opciones: ['A', 'B', 'C', 'D'], correcta: 0 }
      ];
      estado.jugadores = {
        j1: { nombre: 'J1', historial: [] },
        j2: { nombre: 'J2', historial: [] }
      };
      estado.respuestasActuales = { j1: 0, j2: 2 };
      estado.preguntaIdx = 0;

      registrarHistorialPregunta(estado, 0);

      expect(estado.jugadores.j1.historial).toHaveLength(1);
      expect(estado.jugadores.j1.historial[0].acerto).toBe(true);
      expect(estado.jugadores.j2.historial[0].acerto).toBe(false);
      expect(estado.jugadores.j2.historial[0].opcionLetra).toBe('C');
    });

    it('debería manejar jugador que no respondió', () => {
      const estado = crearEstadoInicial();
      estado.preguntasActivas = [
        { pregunta: '¿Test?', opciones: ['A', 'B', 'C', 'D'], correcta: 1 }
      ];
      estado.jugadores = { j1: { nombre: 'J1', historial: [] } };
      estado.respuestasActuales = {};
      estado.preguntaIdx = 0;

      registrarHistorialPregunta(estado, 0);

      expect(estado.jugadores.j1.historial[0].respondio).toBe(false);
      expect(estado.jugadores.j1.historial[0].acerto).toBe(false);
    });
  });

  describe('getInformeDocente', () => {
    const { getInformeDocente, crearEstadoInicial, registrarHistorialPregunta } = require('../../src/server/domain/game');

    it('debería generar informe detallado con historial', () => {
      const estado = crearEstadoInicial();
      estado.preguntasActivas = [
        { pregunta: '¿P1?', opciones: ['A', 'B', 'C', 'D'], correcta: 0 },
        { pregunta: '¿P2?', opciones: ['A', 'B', 'C', 'D'], correcta: 2 }
      ];
      estado.jugadores = {
        j1: { nombre: 'J1', puntaje: 100, historial: [] },
        j2: { nombre: 'J2', puntaje: 0, historial: [] }
      };
      estado.respuestasActuales = { j1: 0, j2: 3 };
      estado.preguntaIdx = 0;
      registrarHistorialPregunta(estado, 0);

      estado.respuestasActuales = { j1: 2, j2: 1 };
      estado.preguntaIdx = 1;
      registrarHistorialPregunta(estado, 1);

      const informe = getInformeDocente(estado);
      expect(informe).toHaveLength(2);
      expect(informe[0].detalle).toHaveLength(2);
      expect(informe[0].detalle[0].acerto).toBe(true);
      expect(informe[0].detalle[1].acerto).toBe(true);
      expect(informe[1].detalle[0].acerto).toBe(false);
    });

    it('debería manejar jugador sin historial', () => {
      const estado = crearEstadoInicial();
      estado.preguntasActivas = [];
      estado.jugadores = {
        j1: { nombre: 'J1', puntaje: 0 }
      };
      estado.respuestasActuales = {};
      estado.preguntaIdx = -1;

      const informe = getInformeDocente(estado);
      expect(informe[0].detalle).toEqual([]);
    });
  });
});
