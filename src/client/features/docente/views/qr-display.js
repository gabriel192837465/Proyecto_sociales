<<<<<<< HEAD
export function generarQR(ip, port, codigo) {
  const protocol = location.protocol === "https:" ? "https:" : "http:";
  const host = ip || location.hostname;
  const resolvedPort = port || location.port;
  const portSuffix = resolvedPort && !((protocol === "http:" && String(resolvedPort) === "80") || (protocol === "https:" && String(resolvedPort) === "443"))
    ? `:${resolvedPort}`
    : "";
  const url = `${protocol}//${host}${portSuffix}/alumno.html${codigo ? `?codigo=${encodeURIComponent(codigo)}` : ""}`;
  const urlEl = document.getElementById("qr-url-txt");
  const qrEl = document.getElementById("qrcode");
  if (!urlEl || !qrEl || typeof QRCode !== "function") return;
  urlEl.textContent = url;
  qrEl.innerHTML = "";
  new QRCode(qrEl, {
    text: url,
    width: 170,
    height: 170,
    colorDark: "#15549b",
    colorLight: "#ffffff"
  });
}
=======
export function generarQR(ip, port) {
  const protocol = location.protocol === "https:" ? "https:" : "http:";
  const url = `${protocol}//${ip}:${port}/alumno.html`;
  document.getElementById("qr-url-txt").textContent = url;
  document.getElementById("qrcode").innerHTML = "";
  new QRCode(document.getElementById("qrcode"), {
    text: url,
    width: 170,
    height: 170,
    colorDark: "#e0daf0",
    colorLight: "#14142a"
  });
}
>>>>>>> origin/main
