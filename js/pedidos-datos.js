// Lectura y escritura de pedidos de una clienta de Carol´s. Mismo modelo de datos que la app y el ERP:
//   PEDIDOS/{tel}/{codigoPedido}/{nodoID}      cada prenda
//   PEDIDOS/{tel}/mis pedidos/{codigoPedido}   resumen (monto, fechas, estatus "abierto" | "cerrado")
//   VENTAS GLOBALES/Pedidos Carol´s/{codigo}   se crea al CERRAR el pedido (así aparece en Ventas del ERP)
//
// Un pedido nace "abierto" con su primera prenda y se va guardando prenda por prenda: si la clienta cierra la
// ventana, lo retoma después desde su historial. Al cerrarlo ya no puede agregar ni quitar prendas; la
// administración sí puede (desde el ERP).
import { db } from "./firebase-config.js";
import { ref, get, update } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { entradas, aISO } from "./utils.js";

export const DESTINO = "Pedidos Carol´s";
export const VENDEDORA = "Carol´s";

export const rutaPiezas = (tel, codigo) => `PEDIDOS/${tel}/${codigo}`;
export const rutaResumen = (tel, codigo) => `PEDIDOS/${tel}/mis pedidos/${codigo}`;

export async function leerResumen(tel, codigo) {
  const snap = await get(ref(db, rutaResumen(tel, codigo)));
  return snap.exists() ? snap.val() : null;
}

export async function leerPiezas(tel, codigo) {
  const snap = await get(ref(db, rutaPiezas(tel, codigo)));
  return piezasDe(snap.val());
}

// Las llaves 1, 2, 3… hacen que Firebase devuelva un arreglo con huecos: se normaliza a [nodoID, pieza].
export function piezasDe(valor) {
  return entradas(valor).filter(([, p]) => p && typeof p === "object");
}

export function totalDe(piezas) {
  return piezas.reduce((suma, [, p]) => suma + (Number(p.precio) || 0), 0);
}

function siguienteNodo(piezas) {
  return String(piezas.reduce((max, [nodo]) => Math.max(max, Number(nodo) || 0), 0) + 1);
}

function ultimoNodo(piezas) {
  return String(piezas.reduce((max, [nodo]) => Math.max(max, Number(nodo) || 0), 0));
}

function piezaDe(prenda, urlFoto, nodo, codigo, clienta, fechaEntrega) {
  return {
    foto: urlFoto,
    especificaciones: prenda.especificaciones,
    talla: prenda.talla,
    color: prenda.color,
    tipoDeTela: prenda.tipoDeTela,
    estampado: prenda.estampado,
    urlEstampado: prenda.urlEstampado,
    fechaDeRecepcion: fechaEntrega,
    codigoDeCliente: clienta.tel,
    nombreCliente: clienta.nombre,
    precio: String(prenda.precio),
    precio1: String(prenda.precio1),
    precio2: String(prenda.precio2),
    estatus: "cerrado",
    nodoID: nodo,
    codigoDePedido: codigo,
  };
}

// Código de 6 dígitos. Los pedidos abiertos todavía no están en VENTAS GLOBALES, así que se usa un número al azar
// (1 en un millón de chocar) y se verifica que no exista ni en el historial de la clienta ni en VENTAS GLOBALES.
async function codigoLibre(tel) {
  for (let intento = 0; intento < 10; intento++) {
    const codigo = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
    const [global, propio] = await Promise.all([
      get(ref(db, `VENTAS GLOBALES/${DESTINO}/${codigo}`)),
      get(ref(db, rutaPiezas(tel, codigo))),
    ]);
    if (!global.exists() && !propio.exists()) return codigo;
  }
  throw new Error("No se pudo generar el código del pedido");
}

// Crea el pedido (abierto) junto con su primera prenda, en una sola escritura. Devuelve el código.
export async function crearPedido(clienta, fechaEntrega, prenda, urlFoto) {
  const codigo = await codigoLibre(clienta.tel);
  const ahora = new Date();
  const fechaDeCreacion = new Intl.DateTimeFormat("es", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  }).format(ahora);
  await update(ref(db), {
    [`${rutaPiezas(clienta.tel, codigo)}/1`]: piezaDe(prenda, urlFoto, "1", codigo, clienta, fechaEntrega),
    [rutaResumen(clienta.tel, codigo)]: {
      nombreCliente: clienta.nombre,
      fechaDeCreacion,
      fechaDeCreacionISO: aISO(ahora),
      fechaDeRecepcion: fechaEntrega,
      codigoDeCliente: clienta.tel,
      codigoDePedido: codigo,
      estatus: "abierto",
      codVendedora: "",
      nombreVendedora: VENDEDORA,
      seo: `${clienta.nombre}${codigo}`,
      ultimoNodo: "1",
      monto: String(Number(prenda.precio) || 0),
      origen: "Web clientas",
    },
  });
  return codigo;
}

// Agrega una prenda a un pedido abierto (nodoID = el siguiente libre) y deja el monto al día.
export async function agregarPrenda(clienta, codigo, fechaEntrega, prenda, urlFoto) {
  const piezas = await leerPiezas(clienta.tel, codigo);
  const nodo = siguienteNodo(piezas);
  await update(ref(db), {
    [`${rutaPiezas(clienta.tel, codigo)}/${nodo}`]: piezaDe(prenda, urlFoto, nodo, codigo, clienta, fechaEntrega),
    [`${rutaResumen(clienta.tel, codigo)}/monto`]: String(totalDe(piezas) + (Number(prenda.precio) || 0)),
    [`${rutaResumen(clienta.tel, codigo)}/ultimoNodo`]: nodo,
  });
  return nodo;
}

export async function quitarPrenda(clienta, codigo, nodo) {
  const restantes = (await leerPiezas(clienta.tel, codigo)).filter(([k]) => k !== String(nodo));
  await update(ref(db), {
    [`${rutaPiezas(clienta.tel, codigo)}/${nodo}`]: null,
    [`${rutaResumen(clienta.tel, codigo)}/monto`]: String(totalDe(restantes)),
    [`${rutaResumen(clienta.tel, codigo)}/ultimoNodo`]: ultimoNodo(restantes),
  });
}

// Cierra el pedido: queda "cerrado" y se registra en VENTAS GLOBALES para que lo vea el equipo en el ERP.
export async function cerrarPedido(clienta, codigo) {
  const [resumen, piezas, global] = await Promise.all([
    leerResumen(clienta.tel, codigo),
    leerPiezas(clienta.tel, codigo),
    get(ref(db, `VENTAS GLOBALES/${DESTINO}/${codigo}`)),
  ]);
  if (!resumen) throw new Error("El pedido no existe");
  if (resumen.estatus === "cerrado") return;
  if (!piezas.length) throw new Error("vacio");
  if (global.exists()) throw new Error("codigo-duplicado");
  await update(ref(db), {
    [`${rutaResumen(clienta.tel, codigo)}/estatus`]: "cerrado",
    [`${rutaResumen(clienta.tel, codigo)}/ultimoNodo`]: ultimoNodo(piezas),
    [`VENTAS GLOBALES/${DESTINO}/${codigo}`]: {
      nombreCliente: resumen.nombreCliente,
      fechaDeCreacion: resumen.fechaDeCreacion,
      fechaDeRecepcion: resumen.fechaDeRecepcion,
      codigoDeCliente: clienta.tel,
      codigoDePedido: codigo,
      estatus: "cerrado",
      codVendedora: "",
      nombreVendedora: VENDEDORA,
      seo: resumen.seo || `${resumen.nombreCliente}${codigo}`,
      ultimoNodo: ultimoNodo(piezas),
      origen: "Web clientas",
    },
  });
}

export const TEXTO_CIERRE =
  "¿Cerrar este pedido?\n\nDespués de cerrarlo usted ya no podrá agregar ni quitar prendas. " +
  "Si necesita un cambio, el equipo de Carol´s sí podrá modificarlo.";
