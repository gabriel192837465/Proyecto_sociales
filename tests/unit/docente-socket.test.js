/**
 * @jest-environment jsdom
 */
jest.mock('../../src/client/shared/socket-client.js', () => ({
  enviar: jest.fn(),
  conectar: jest.fn(),
  onMensaje: jest.fn(),
  getWS: jest.fn(),
}));

const { enviar } = require('../../src/client/features/docente/socket.js');
const wsShared = require('../../src/client/shared/socket-client.js');

describe('docente/socket', () => {
  beforeEach(() => {
    wsShared.enviar.mockClear();
  });

  test('enviar manda JSON serializado por el WS', () => {
    enviar('iniciar_juego', { bancoId: 'b1' });
    expect(wsShared.enviar).toHaveBeenCalledWith({ tipo: 'iniciar_juego', bancoId: 'b1' });
  });

  test('enviar sin extra solo manda tipo', () => {
    enviar('ping');
    expect(wsShared.enviar).toHaveBeenCalledWith({ tipo: 'ping' });
  });
});
