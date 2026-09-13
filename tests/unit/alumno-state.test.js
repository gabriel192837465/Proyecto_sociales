/**
 * @jest-environment jsdom
 */
const { state, setWS, setMiId, setMiNombre, setMiPuntaje, setMiRespuesta, setTiempoMax, setJugadoresSala, setReconectarAuto, setPendienteEnvio, setSessionToken, getSessionToken } = require('../../src/client/features/alumno/state.js');

describe('alumno/state', () => {
  beforeEach(() => {
    setMiId('');
    setMiNombre('');
    setMiPuntaje(0);
    setMiRespuesta(null);
    setReconectarAuto(true);
    setTiempoMax(20);
    setJugadoresSala([]);
    setPendienteEnvio(false);
  });

  test('miId CRUD', () => {
    setMiId('uuid-1');
    expect(state.miId).toBe('uuid-1');
  });

  test('miNombre CRUD', () => {
    setMiNombre('Ana');
    expect(state.miNombre).toBe('Ana');
  });

  test('miPuntaje CRUD', () => {
    setMiPuntaje(100);
    expect(state.miPuntaje).toBe(100);
  });

  test('miRespuesta CRUD', () => {
    expect(state.miRespuesta).toBeNull();
    setMiRespuesta(2);
    expect(state.miRespuesta).toBe(2);
  });

  test('TIEMPO_MAX CRUD', () => {
    setTiempoMax(30);
    expect(state.TIEMPO_MAX).toBe(30);
  });

  test('jugadoresSala CRUD', () => {
    setJugadoresSala(['Ana', 'Bob']);
    expect(state.jugadoresSala).toEqual(['Ana', 'Bob']);
  });

  test('reconectarAuto CRUD', () => {
    setReconectarAuto(false);
    expect(state.reconectarAuto).toBe(false);
  });

  test('setWS almacena WebSocket', () => {
    const mock = { send: jest.fn() };
    setWS(mock);
    expect(state.ws).toBe(mock);
  });

  test('pendienteEnvio CRUD', () => {
    expect(state.pendienteEnvio).toBe(false);
    setPendienteEnvio(true);
    expect(state.pendienteEnvio).toBe(true);
    setPendienteEnvio(false);
    expect(state.pendienteEnvio).toBe(false);
  });

  test('setPendienteEnvio coerce a boolean', () => {
    setPendienteEnvio(1);
    expect(state.pendienteEnvio).toBe(true);
    setPendienteEnvio(0);
    expect(state.pendienteEnvio).toBe(false);
  });

  test('sessionToken CRUD and getSessionToken', () => {
    setSessionToken('my-token-123');
    expect(state.sessionToken).toBe('my-token-123');
    expect(getSessionToken()).toBe('my-token-123');
  });
});
