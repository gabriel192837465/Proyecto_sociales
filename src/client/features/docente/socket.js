<<<<<<< HEAD
import { enviar as wsEnviar } from "../../shared/socket-client.js";

export function enviar(tipo, extra = {}) {
  wsEnviar({ tipo, ...extra });
}
=======
import { enviar as wsEnviar } from "../../shared/socket-client.js";

export function enviar(tipo, extra = {}) {
  wsEnviar({ tipo, ...extra });
}
>>>>>>> origin/main
