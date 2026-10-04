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

// Al copiar y pegar desde WhatsApp suelen colarse espacios, saltos de línea, espacios "duros" y caracteres invisibles
// al principio o al final. Se quitan antes de usar el dato.
const INVISIBLES = new RegExp("[\u200B-\u200D\u2060\uFEFF\u00A0]", "g");
export function limpiarTexto(valor) {
  return String(valor || "").replace(INVISIBLES, " ").trim();
}

// Lo que la clienta escribe en el login: un correo, o su teléfono.
function correoDe(identificador) {
  const texto = limpiarTexto(identificador);
  return texto.includes("@") ? texto.replace(/\s+/g, "").toLowerCase() : emailDe(limpiarTelefono(texto));
}

async function telefonoDe(usuario) {
  if (!usuario) return null;
  const correo = usuario.email || "";
  if (correo.endsWith(DOMINIO)) return correo.slice(0, -DOMINIO.length);
  const snap = await get(ref(db, `CLIENTAS_WEB/${usuario.uid}`));
  return snap.exists() ? String(snap.val()) : null;
}

// Además de tener usuario en Firebase, debe ser cliente de Carol´s (no de una vendedora).
// Devuelve { clienta, motivo }: motivo = "sin-enlace" (no existe CLIENTAS_WEB/{uid}) o "sin-ficha" (el teléfono enlazado no
// es cliente de Carol´s en TODOS LOS CLIENTES/CAROLS).
async function detalleDeClienta(usuario) {
  const telefono = await telefonoDe(usuario);
  if (!telefono) return { clienta: null, motivo: "sin-enlace" };
  const snap = await get(ref(db, `TODOS LOS CLIENTES/CAROLS/${telefono}`));
  if (!snap.exists()) return { clienta: null, motivo: "sin-ficha", telefono };
  const c = snap.val() || {};
  return { clienta: { tel: telefono, nombre: c.nombre || "", direccion: c.direccionCompleta || c.direccion || "" } };
}

async function clientaDe(usuario) {
  return (await detalleDeClienta(usuario)).clienta;
}

async function entrar(correo, contrasena) {
  try {
    return await signInWithEmailAndPassword(auth, correo, contrasena);
  } catch (error) {
    const limpia = limpiarTexto(contrasena);
    const rechazada = error.code === "auth/invalid-credential" || error.code === "auth/wrong-password";
    if (rechazada && limpia && limpia !== contrasena) return signInWithEmailAndPassword(auth, correo, limpia);
    throw error;
  }
}

export async function iniciarSesion(identificador, contrasena) {
  const credencial = await entrar(correoDe(identificador), contrasena);
  const resultado = await detalleDeClienta(credencial.user);
  if (!resultado.clienta) {
    // La contraseña era correcta pero falta algo del lado de administración; el motivo se muestra para poder arreglarlo.
    await signOut(auth);
    const error = new Error("no-habilitada");
    error.code = "clienta/no-habilitada";
    error.motivo = resultado.motivo;
    throw error;
  }
  return resultado.clienta;
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
