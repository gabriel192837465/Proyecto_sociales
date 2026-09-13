const { mezclarPreguntas } = require('../../src/server/application/use-cases/iniciar-juego');

describe('iniciar-juego: selección de preguntas', () => {
  test('mezcla sin mutar la colección original', () => {
    const preguntas = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}` }));
    const resultado = mezclarPreguntas(preguntas);

    expect(resultado).toHaveLength(12);
    expect(resultado).not.toBe(preguntas);
    expect(resultado.map(p => p.id).sort()).toEqual(preguntas.map(p => p.id).sort());
  });

  test('una partida puede tomar como máximo 10 preguntas', () => {
    const preguntas = Array.from({ length: 15 }, (_, i) => ({ id: `p${i}` }));
    expect(mezclarPreguntas(preguntas).slice(0, 10)).toHaveLength(10);
  });
});