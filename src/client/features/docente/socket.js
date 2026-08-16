import { enviar as wsEnviar } from "../../shared/socket-client.js";

export function enviar(tipo, extra = {}) {
  wsEnviar({ tipo, ...extra });
}
