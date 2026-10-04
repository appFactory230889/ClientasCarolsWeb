import { iniciarSesion, haySesion } from "./sesion.js";
import { limpiarTelefono } from "./utils.js";

// Si ya hay una sesión válida abierta se entra directo.
haySesion().then((hay) => {
  if (hay) window.location.replace("pedidos.html");
});

const form = document.getElementById("form-login");
const btn = document.getElementById("btn-entrar");
const mensaje = document.getElementById("mensaje");

function marcar(campoId, conError) {
  document.getElementById(campoId).classList.toggle("con-error", conError);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  mensaje.textContent = "";
  const telefono = limpiarTelefono(document.getElementById("telefono").value);
  const contrasena = document.getElementById("contrasena").value;
  marcar("campo-telefono", telefono.length < 7);
  marcar("campo-contrasena", !contrasena);
  if (telefono.length < 7 || !contrasena) return;

  btn.disabled = true;
  btn.textContent = "Entrando…";
  try {
    await iniciarSesion(telefono, contrasena);
    window.location.replace("pedidos.html");
  } catch (error) {
    // Mismo mensaje para "no existe" y "contraseña mala": no se revela qué teléfonos tienen usuario.
    if (error.code === "clienta/no-habilitada") {
      mensaje.textContent = "Su usuario aún no está habilitado. Escríbanos por WhatsApp.";
    } else if (error.code === "auth/too-many-requests") {
      mensaje.textContent = "Demasiados intentos. Espere unos minutos e intente de nuevo.";
    } else if (error.code === "auth/network-request-failed") {
      mensaje.textContent = "Sin conexión. Revise su internet e intente de nuevo.";
    } else {
      mensaje.textContent = "Teléfono o contraseña incorrectos.";
    }
    btn.disabled = false;
    btn.textContent = "Entrar";
  }
});
