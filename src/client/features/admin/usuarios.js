import { fetchUsuarios, setUsuarioActivo } from "./api-client.js";
import { esc } from "../../shared/dom.js";
import { toast } from "./toast.js";

function renderFilaUsuario(u) {
  const estadoTxt = u.activo ? "Activa" : "Desactivada";
  const estadoClase = u.activo ? "usuario-activo" : "usuario-inactivo";
  const btnTxt = u.activo ? "Desactivar" : "Activar";
  return `
    <tr class="usuario-fila ${estadoClase}">
      <td>${esc(u.nombreUsuario)}</td>
      <td>${esc(u.email)}</td>
      <td>${esc(estadoTxt)}</td>
      <td>
        <button class="btn btn-ghost btn-sm" data-action="toggle-usuario-activo"
                data-usuario-id="${esc(u.id)}" data-usuario-activo="${u.activo ? "1" : "0"}">
          ${esc(btnTxt)}
        </button>
      </td>
    </tr>`;
}

function renderTabla(usuarios) {
  if (!usuarios.length) {
    return `<div class="empty-state"><p>No hay cuentas de alumno registradas todavía.</p></div>`;
  }
  return `
    <table class="tabla-usuarios">
      <thead>
        <tr><th>Nombre de usuario</th><th>Correo institucional</th><th>Estado</th><th></th></tr>
      </thead>
      <tbody id="usuarios-tbody">
        ${usuarios.map(renderFilaUsuario).join("")}
      </tbody>
    </table>`;
}

// Sección 21: vista de administración de cuentas de alumno (listar, buscar,
// activar/desactivar). Reemplaza #main-content igual que las otras vistas
// del panel (bancos/preguntas), manteniendo el mismo patrón de la app.
export async function mostrarUsuarios() {
  const main = document.getElementById("main-content");
  if (!main) return;
  main.innerHTML = `
    <div class="usuarios-panel">
      <div class="usuarios-header">
        <h2>👤 Cuentas de alumno</h2>
        <input type="text" id="usuarios-buscar" placeholder="Buscar por nombre o correo..." class="input-buscar-usuarios">
      </div>
      <div id="usuarios-tabla-wrap">Cargando...</div>
    </div>`;

  async function recargar(q) {
    const wrap = document.getElementById("usuarios-tabla-wrap");
    if (!wrap) return;
    try {
      const { usuarios } = await fetchUsuarios(q);
      wrap.innerHTML = renderTabla(usuarios);
    } catch (err) {
      wrap.innerHTML = `<div class="error-box" style="display:block">Error al cargar las cuentas: ${esc(err.message)}</div>`;
    }
  }

  const buscarInput = document.getElementById("usuarios-buscar");
  if (buscarInput) {
    let debounce;
    buscarInput.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => recargar(buscarInput.value.trim()), 250);
    });
  }

  await recargar();
}

export async function toggleUsuarioActivo(id, activoActual) {
  try {
    await setUsuarioActivo(id, !activoActual);
    toast(!activoActual ? "Cuenta activada." : "Cuenta desactivada.", "ok");
    const buscarInput = document.getElementById("usuarios-buscar");
    await mostrarUsuariosRecargando(buscarInput ? buscarInput.value.trim() : undefined);
  } catch (err) {
    toast(`Error: ${err.message}`, "err");
  }
}

// Recarga sólo la tabla (sin reconstruir el header/input) para no perder el
// foco del buscador tras activar/desactivar una cuenta.
async function mostrarUsuariosRecargando(q) {
  const wrap = document.getElementById("usuarios-tabla-wrap");
  if (!wrap) return mostrarUsuarios();
  try {
    const { usuarios } = await fetchUsuarios(q);
    wrap.innerHTML = renderTabla(usuarios);
  } catch (err) {
    wrap.innerHTML = `<div class="error-box" style="display:block">Error al cargar las cuentas: ${esc(err.message)}</div>`;
  }
}
