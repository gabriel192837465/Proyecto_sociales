const os = require('os');
const logger = require('./logger');

const VIRTUAL_PATTERN = /vmware|vmnet|virtualbox|vbox|hyper-v|vethernet|docker|wsl|tailscale|loopback|bluetooth|ppp|nordvpn|protonvpn|openvpn|wireguard|tun|tap/i;
const VIRTUAL_MAC = /^(08:00:27|00:0c:29|00:50:56|00:05:69|00:15:5d|52:54:00|00:1c:42)/i;

function getInterfacesCandidatas() {
  const candidatas = [];
  for (const [nombre, ifaces] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL_PATTERN.test(nombre)) continue;
    for (const iface of ifaces) {
      const esIPv4 = iface.family === "IPv4" || iface.family === 4;
      if (!esIPv4 || iface.internal) continue;
      if (VIRTUAL_MAC.test(iface.mac)) continue;
      const ip = iface.address;
      if (ip.startsWith("169.254.")) continue;
      const esPrivada =
        ip.startsWith("192.168.") ||
        ip.startsWith("10.") ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
      if (!esPrivada) continue;
      candidatas.push({ nombre, ip, mac: iface.mac });
    }
  }
  return candidatas;
}

function getLocalIP(preferida) {
  const candidatas = getInterfacesCandidatas();
  if (preferida) {
    const encontrada = candidatas.find(c => c.nombre === preferida);
    if (encontrada) return encontrada.ip;
    logger.warn(`Interfaz "${preferida}" no encontrada. Usando la primera disponible.`);
  }
  return candidatas[0]?.ip || "localhost";
}

module.exports = {
  getLocalIP,
  getInterfacesCandidatas
};
