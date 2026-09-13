const { getLocalIP, getInterfacesCandidatas } = require('../../src/server/infra/utils');

describe('getLocalIP', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('debería retornar una IP válida o localhost', () => {
    const ip = getLocalIP();
    expect(ip).toMatch(/^(\d{1,3}\.){3}\d{1,3}$|^localhost$/);
  });

  it('debería retornar localhost si no hay interfaces de red', () => {
    const os = require('os');
    const original = os.networkInterfaces;
    os.networkInterfaces = () => ({});

    jest.resetModules();
    const { getLocalIP: gip } = require('../../src/server/infra/utils');
    expect(gip()).toBe('localhost');

    os.networkInterfaces = original;
  });

  it('debería preferir interfaz por nombre si se pasa preferida', () => {
    const os = require('os');
    const original = os.networkInterfaces;
    os.networkInterfaces = () => ({
      eth0: [{ family: 'IPv4', address: '192.168.1.10', internal: false, mac: 'aa:bb:cc:dd:ee:ff' }],
      wlan0: [{ family: 'IPv4', address: '192.168.1.20', internal: false, mac: '11:22:33:44:55:66' }]
    });

    jest.resetModules();
    const { getLocalIP: gip } = require('../../src/server/infra/utils');
    expect(gip('wlan0')).toBe('192.168.1.20');

    os.networkInterfaces = original;
  });

  it('debería ignorar interfaces virtuales por nombre', () => {
    const os = require('os');
    const original = os.networkInterfaces;
    os.networkInterfaces = () => ({
      vboxnet0: [{ family: 'IPv4', address: '192.168.56.1', internal: false, mac: '08:00:27:aa:bb:cc' }],
      eth0: [{ family: 'IPv4', address: '192.168.1.10', internal: false, mac: 'aa:bb:cc:dd:ee:ff' }]
    });

    jest.resetModules();
    const { getLocalIP: gip } = require('../../src/server/infra/utils');
    expect(gip()).toBe('192.168.1.10');

    os.networkInterfaces = original;
  });

  it('debería ignorar interfaces virtuales por MAC', () => {
    const os = require('os');
    const original = os.networkInterfaces;
    os.networkInterfaces = () => ({
      'Ethernet 2': [{ family: 'IPv4', address: '192.168.56.1', internal: false, mac: '08:00:27:aa:bb:cc' }],
      eth0: [{ family: 'IPv4', address: '192.168.1.10', internal: false, mac: 'aa:bb:cc:dd:ee:ff' }]
    });

    jest.resetModules();
    const { getLocalIP: gip } = require('../../src/server/infra/utils');
    expect(gip()).toBe('192.168.1.10');

    os.networkInterfaces = original;
  });
});

describe('getInterfacesCandidatas', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('debería retornar un arreglo', () => {
    const result = getInterfacesCandidatas();
    expect(Array.isArray(result)).toBe(true);
  });

  it('debería retornar objetos con nombre, ip, mac', () => {
    const os = require('os');
    const original = os.networkInterfaces;
    os.networkInterfaces = () => ({
      eth0: [{ family: 'IPv4', address: '192.168.1.10', internal: false, mac: 'aa:bb:cc:dd:ee:ff' }]
    });

    jest.resetModules();
    const { getInterfacesCandidatas: gic } = require('../../src/server/infra/utils');
    const result = gic();
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ nombre: 'eth0', ip: '192.168.1.10', mac: 'aa:bb:cc:dd:ee:ff' });

    os.networkInterfaces = original;
  });
});
