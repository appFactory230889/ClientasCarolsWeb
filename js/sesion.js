// Sesión de la clienta. Firebase Auth pide un correo: el teléfono se convierte en un correo interno
// (77001122@clientas.carols.app) que la clienta nunca ve. Los usuarios los crea SOLO la administradora en la
// consola de Firebase (Authentication > Users); esta web no tiene ninguna pantalla ni llamada de registro.
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";

export const DOMINIO = "@clientas.carols.app";

export function emailDe(telefono) {
  return telefono + DOMINIO;
}

function telefonoDe(usuario) {
  const correo = usuario && usuario.email ? usuario.email : "";
  return correo.endsWith(DOMINIO) ? correo.slice(0, -DOMINIO.length) : null;
}

// Además de tener usuario en Firebase, la clienta debe existir como cliente de Carol´s (no de una vendedora).
async function leerClienta(telefono) {
  const snap = await get(ref(db, `TODOS LOS CLIENTES/CAROLS/${telefono}`));
  if (!snap.exists()) return null;
  const c = snap.val() || {};
  return { tel: telefono, nombre: c.nombre || "", direccion: c.direccionCompleta || c.direccion || "" };
}

export async function iniciarSesion(telefono, contrasena) {
  const credencial = await signInWithEmailAndPassword(auth, emailDe(telefono), contrasena);
  const clienta = await leerClienta(telefonoDe(credencial.user));
  if (!clienta) {
    await signOut(auth);
    const error = new Error("no-habilitada");
    error.code = "clienta/no-habilitada";
    throw error;
  }
  return clienta;
}

// Para las páginas internas: devuelve la clienta con sesión o manda al inicio.
export function exigirSesion() {
  return new Promise((resolver) => {
    const detener = onAuthStateChanged(auth, async (usuario) => {
      detener();
      const telefono = telefonoDe(usuario);
      const clienta = telefono ? await leerClienta(telefono).catch(() => null) : null;
      if (!clienta) {
        if (usuario) await signOut(auth);
        window.location.replace("index.html");
        return;
      }
      resolver(clienta);
    });
  });
}

export async function cerrarSesion() {
  await signOut(auth);
  window.location.replace("index.html");
}

export function haySesion() {
  return new Promise((resolver) => {
    const detener = onAuthStateChanged(auth, (usuario) => {
      detener();
      resolver(Boolean(telefonoDe(usuario)));
    });
  });
}
