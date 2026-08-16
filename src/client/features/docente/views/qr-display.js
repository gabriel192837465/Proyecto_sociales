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
