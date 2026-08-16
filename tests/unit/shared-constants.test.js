const { LETRAS, COLORES_OPCIONES, MEDALLAS, EPOCA_COLORES } = require('../../src/client/shared/constants.js');

describe('shared/constants', () => {
  test('LETRAS son A, B, C, D', () => {
    expect(LETRAS).toEqual(['A', 'B', 'C', 'D']);
  });

  test('COLORES_OPCIONES tiene 4 colores', () => {
    expect(COLORES_OPCIONES).toHaveLength(4);
  });

  test('MEDALLAS son 🥇, 🥈, 🥉', () => {
    expect(MEDALLAS).toHaveLength(3);
  });

  test('EPOCA_COLORES tiene colores para cada época', () => {
    expect(EPOCA_COLORES.Independencia).toBe('#c8a84b');
    expect(EPOCA_COLORES['Siglo XX']).toBe('#4a7c6f');
    expect(EPOCA_COLORES.Democracia).toBe('#5a7daa');
  });
});
