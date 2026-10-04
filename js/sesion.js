// Sesión de la clienta. Los usuarios los crea SOLO la administradora (nunca hay registro en esta web):
//  - desde el ERP, al agregar la clienta con su correo (contraseña = su teléfono). El ERP deja el enlace
//    CLIENTAS_WEB/{uid} = teléfono, que es como esta web sabe quién es.
//  - o a mano en Firebase Console con el correo interno TELEFONO@clientas.carols.app (se entra solo con el teléfono).
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { limpiarTelefono } from "./utils.js";

export const DOMINIO = "@clientas.carols.app";

export function emailDe(telefono) {
  return telefono + DOMINIO;
}

// Lo que la clienta escribe en el login: un correo, o su teléfono.
function correoDe(identificador) {
  const texto = String(identificador || "").trim();
  return texto.includes("@") ? texto.toLowerCase() : emailDe(limpiarTelefono(texto));
}

async function telefonoDe(usuario) {
  if (!usuario) return null;
  const correo = usuario.email || "";
  if (correo.endsWith(DOMINIO)) return correo.slice(0, -DOMINIO.length);
  const snap = await get(ref(db, `CLIENTAS_WEB/${usuario.uid}`));
  return snap.exists() ? String(snap.val()) : null;
}

// Además de tener usuario en Firebase, debe ser cliente de Carol´s (no de una vendedora).
async function clientaDe(usuario) {
  const telefono = await telefonoDe(usuario);
  if (!telefono) return null;
  const snap = await get(ref(db, `TODOS LOS CLIENTES/CAROLS/${telefono}`));
  if (!snap.exists()) return null;
  const c = snap.val() || {};
  return { tel: telefono, nombre: c.nombre || "", direccion: c.direccionCompleta || c.direccion || "" };
}

export async function iniciarSesion(identificador, contrasena) {
  const credencial = await signInWithEmailAndPassword(auth, correoDe(identificador), contrasena);
  const clienta = await clientaDe(credencial.user);
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
      const clienta = usuario ? await clientaDe(usuario).catch(() => null) : null;
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

// En el login: si ya hay una sesión de clienta válida se entra directo.
export function haySesion() {
  return new Promise((resolver) => {
    const detener = onAuthStateChanged(auth, async (usuario) => {
      detener();
      resolver(usuario ? Boolean(await clientaDe(usuario).catch(() => null)) : false);
    });
  });
}
