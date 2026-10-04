import { iniciarSesion, haySesion } from "./sesion.js";

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
  const identificador = document.getElementById("telefono").value.trim();
  const contrasena = document.getElementById("contrasena").value;
  marcar("campo-telefono", identificador.length < 7);
  marcar("campo-contrasena", !contrasena);
  if (identificador.length < 7 || !contrasena) return;

  btn.disabled = true;
  btn.textContent = "Entrando…";
  try {
    await iniciarSesion(identificador, contrasena);
    window.location.replace("pedidos.html");
  } catch (error) {
    // Mismo mensaje para "no existe" y "contraseña mala": no se revela qué teléfonos tienen usuario.
    if (error.code === "clienta/no-habilitada") {
      // La contraseña era correcta; falta algo de nuestro lado. El código ayuda a administración a ubicar qué.
      mensaje.textContent = error.motivo === "sin-ficha"
        ? "Su acceso es correcto, pero su teléfono no aparece como clienta de Carol´s. Escríbanos por WhatsApp. (código 2)"
        : "Su acceso es correcto, pero su usuario aún no está habilitado. Escríbanos por WhatsApp. (código 1)";
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

// Ojito: muestra u oculta la contraseña.
const campoContrasena = document.getElementById("contrasena");
const btnOjo = document.getElementById("btn-ojo");
btnOjo.addEventListener("click", () => {
  const visible = campoContrasena.type === "password";
  campoContrasena.type = visible ? "text" : "password";
  btnOjo.setAttribute("aria-pressed", String(visible));
  btnOjo.setAttribute("aria-label", visible ? "Ocultar contraseña" : "Mostrar contraseña");
  btnOjo.querySelector(".ojo-abierto").toggleAttribute("hidden", visible);
  btnOjo.querySelector(".ojo-tachado").toggleAttribute("hidden", !visible);
  campoContrasena.focus();
});
