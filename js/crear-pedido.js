import { db, storage } from "./firebase-config.js";
import { ref, onValue, get, update } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { ref as refAlmacen, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
import { exigirSesion } from "./sesion.js";
import { escapeHtml, dinero, precio, aviso, entradas, comprimirImagen, deInputAFechaGuardada, aISO } from "./utils.js";

// Los pedidos de las clientas de Carol´s se guardan exactamente como los de la app y el ERP:
//   PEDIDOS/{tel}/{codigoPedido}/{nodoID}        cada prenda
//   PEDIDOS/{tel}/mis pedidos/{codigoPedido}     resumen (monto, fechas, estatus)
//   VENTAS GLOBALES/Pedidos Carol´s/{codigo}     para que aparezca en Ventas del ERP
// Todo se escribe junto, en UNA sola operación, al enviar el pedido (nunca quedan pedidos a medias).
const DESTINO = "Pedidos Carol´s";
const VENDEDORA = "Carol´s";
const TALLAS_GRANDES = ["XL", "XXL"];

let clienta = null;
let metodo = "catalogo";
let catalogo = null; // { codigo, foto, precio1, precio2 }
let archivoFoto = null;
let telas = []; // nombres de TELAS
let coloresPorTela = {}; // tela -> [{color, codColor, imagen, disponible}]
let colorElegido = null;
const prendas = [];

const $ = (id) => document.getElementById(id);
const hoy = new Date();
const manana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);
$("fecha-entrega").min = aISO(manana);

exigirSesion().then((c) => {
  clienta = c;
  if (c.nombre) $("nombre-clienta").textContent = c.nombre + " · nuevo pedido";
  cargarTelas();
});

/* ---------------------------------------------------------------- telas y colores (dinámicos) */
// Las telas salen de TELAS y los colores de COLORES/{tela}: lo que administración agrega o marca "No disponible"
// en el ERP se refleja aquí solo. Los colores no disponibles NUNCA se muestran.
function cargarTelas() {
  onValue(ref(db, "TELAS"), (snap) => {
    telas = entradas(snap.val())
      .map(([, t]) => (t && t.descripcion ? String(t.descripcion).trim() : ""))
      .filter((d, i, todas) => d && todas.indexOf(d) === i);
    pintarTelas();
  });
  onValue(ref(db, "COLORES"), (snap) => {
    coloresPorTela = {};
    for (const [tela, colores] of entradas(snap.val())) {
      coloresPorTela[tela] = entradas(colores)
        .map(([codigo, c]) => ({ codColor: c.codColor || codigo, color: c.color || "", imagen: c.imagen || "", disponible: c.disponible !== false }))
        .filter((c) => c.color);
    }
    pintarTelas();
    pintarColores();
  });
}

function coloresDisponibles(tela) {
  return (coloresPorTela[tela] || []).filter((c) => c.disponible);
}

// Una tela con colores registrados pero todos agotados no se puede pedir.
function telaSinColores(tela) {
  return (coloresPorTela[tela] || []).length > 0 && coloresDisponibles(tela).length === 0;
}

function pintarTelas() {
  const select = $("tela");
  const actual = select.value;
  select.innerHTML =
    '<option value="">Seleccione…</option>' +
    telas
      .map((t) => `<option value="${escapeHtml(t)}" ${telaSinColores(t) ? "disabled" : ""}>${escapeHtml(t)}${telaSinColores(t) ? " (sin colores disponibles)" : ""}</option>`)
      .join("");
  if (telas.includes(actual) && !telaSinColores(actual)) select.value = actual;
  else if (actual) {
    select.value = "";
    colorElegido = null;
  }
  pintarColores();
}

function pintarColores() {
  const tela = $("tela").value;
  const campo = $("campo-color");
  const lista = $("lista-colores");
  campo.hidden = !tela;
  if (!tela) return;
  const disponibles = coloresDisponibles(tela);
  const hayRegistrados = (coloresPorTela[tela] || []).length > 0;
  $("sin-colores").hidden = !(hayRegistrados && disponibles.length === 0);
  // Tela sin colores en el catálogo: la clienta escribe el color. Con colores: solo los disponibles.
  $("color-texto").hidden = hayRegistrados;
  lista.hidden = !hayRegistrados;
  if (colorElegido && !disponibles.some((c) => c.codColor === colorElegido.codColor)) colorElegido = null;
  lista.innerHTML = disponibles
    .map(
      (c, i) => `
      <button type="button" class="color-opcion ${colorElegido && colorElegido.codColor === c.codColor ? "activo" : ""}" data-i="${i}">
        ${c.imagen ? `<img src="${escapeHtml(c.imagen)}" alt="" loading="lazy" />` : '<img alt="" />'}
        <span>${escapeHtml(c.color)}</span>
      </button>`
    )
    .join("");
  lista.querySelectorAll(".color-opcion").forEach((b) =>
    b.addEventListener("click", () => {
      colorElegido = disponibles[Number(b.dataset.i)];
      pintarColores();
    })
  );
}

$("tela").addEventListener("change", () => {
  colorElegido = null;
  pintarColores();
});

/* ---------------------------------------------------------------- catálogo o foto propia */
function elegirMetodo(m) {
  metodo = m;
  $("bloque-catalogo").hidden = m !== "catalogo";
  $("bloque-foto").hidden = m !== "foto";
  $("metodo-catalogo").classList.toggle("activo", m === "catalogo");
  $("metodo-foto").classList.toggle("activo", m === "foto");
  actualizarVistaPrevia();
  actualizarPrecioInfo();
}
$("metodo-catalogo").addEventListener("click", () => elegirMetodo("catalogo"));
$("metodo-foto").addEventListener("click", () => elegirMetodo("foto"));

function actualizarVistaPrevia() {
  const img = $("vista-previa");
  const url = metodo === "catalogo" ? (catalogo && catalogo.foto) : archivoFoto && URL.createObjectURL(archivoFoto);
  img.hidden = !url;
  if (url) img.src = url;
}

$("foto-propia").addEventListener("change", (e) => {
  archivoFoto = e.target.files[0] || null;
  actualizarVistaPrevia();
  actualizarPrecioInfo();
});

async function buscarCatalogo() {
  const codigo = $("codigo-catalogo").value.trim();
  const campo = $("campo-codigo");
  campo.classList.remove("con-error");
  catalogo = null;
  if (!codigo || /[.#$\[\]\/]/.test(codigo)) {
    campo.classList.add("con-error");
    actualizarVistaPrevia();
    return;
  }
  try {
    const snap = await get(ref(db, `CATALOGO/Todas las prendas/${codigo}`));
    if (!snap.exists()) {
      campo.classList.add("con-error");
    } else {
      const v = snap.val();
      catalogo = { codigo, foto: v.foto || "", precio1: String(v.precio1 ?? "0"), precio2: String(v.precio2 ?? v.precio1 ?? "0") };
      aviso("Prenda encontrada", "exito");
    }
  } catch (e) {
    aviso("No se pudo consultar el catálogo. Intente de nuevo.", "error");
  }
  actualizarVistaPrevia();
  actualizarPrecioInfo();
}
$("btn-buscar").addEventListener("click", buscarCatalogo);
$("codigo-catalogo").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    buscarCatalogo();
  }
});

// El precio depende de la talla: XL y XXL usan precio2; las demás, precio1.
function precioDe(item, talla) {
  if (!item) return null;
  return TALLAS_GRANDES.includes(talla) ? item.precio2 : item.precio1;
}

function actualizarPrecioInfo() {
  const info = $("precio-info");
  const talla = $("talla").value;
  if (metodo === "catalogo" && catalogo) {
    info.hidden = false;
    info.textContent = talla ? `Precio: ${precio(precioDe(catalogo, talla))}` : "El precio depende de la talla.";
  } else if (metodo === "foto") {
    info.hidden = false;
    info.textContent = "El precio de una prenda con su propia foto se cotiza al revisar el pedido.";
  } else {
    info.hidden = true;
  }
}
$("talla").addEventListener("change", actualizarPrecioInfo);

/* ---------------------------------------------------------------- agregar prenda */
function marcar(campoId, conError) {
  $(campoId).classList.toggle("con-error", conError);
  return !conError;
}

$("btn-agregar").addEventListener("click", () => {
  const talla = $("talla").value;
  const tela = $("tela").value;
  const especificaciones = $("especificaciones").value.trim();
  const hayColores = (coloresPorTela[tela] || []).length > 0;
  const color = hayColores ? (colorElegido ? colorElegido.color : "") : $("color-texto").value.trim();

  let ok = true;
  ok = marcar("campo-fecha", !$("fecha-entrega").value) && ok;
  ok = marcar("campo-talla", !talla) && ok;
  ok = marcar("campo-tela", !tela) && ok;
  ok = marcar("campo-color", !color) && ok;
  ok = marcar("campo-especificaciones", !especificaciones) && ok;
  if (metodo === "catalogo" && !catalogo) {
    marcar("campo-codigo", true);
    ok = false;
  }
  if (metodo === "foto" && !archivoFoto) {
    aviso("Elija la foto de la prenda.", "error");
    ok = false;
  }
  if (!ok) {
    aviso("Complete los campos marcados.", "error");
    return;
  }

  const delCatalogo = metodo === "catalogo";
  prendas.push({
    talla,
    tipoDeTela: tela,
    color,
    estampado: hayColores && colorElegido ? colorElegido.codColor : "ninguno",
    urlEstampado: hayColores && colorElegido && colorElegido.imagen ? colorElegido.imagen : "ninguno",
    especificaciones,
    foto: delCatalogo ? catalogo.foto : "",
    archivo: delCatalogo ? null : archivoFoto,
    vistaPrevia: delCatalogo ? catalogo.foto : URL.createObjectURL(archivoFoto),
    precio: delCatalogo ? precioDe(catalogo, talla) : "0",
    precio1: delCatalogo ? catalogo.precio1 : "0",
    precio2: delCatalogo ? catalogo.precio2 : "0",
  });

  // Se limpia solo lo de la prenda; la fecha y las prendas ya agregadas se conservan.
  $("talla").value = "";
  $("especificaciones").value = "";
  $("color-texto").value = "";
  $("codigo-catalogo").value = "";
  $("foto-propia").value = "";
  colorElegido = null;
  catalogo = null;
  archivoFoto = null;
  $("tela").value = "";
  pintarColores();
  actualizarVistaPrevia();
  actualizarPrecioInfo();
  pintarPrendas();
  aviso("Prenda agregada al pedido", "exito");
});

/* ---------------------------------------------------------------- lista del pedido */
function pintarPrendas() {
  const cont = $("lista-prendas");
  $("btn-enviar").disabled = prendas.length === 0;
  $("bloque-total").hidden = prendas.length === 0;
  if (!prendas.length) {
    cont.innerHTML = '<div class="vacio" style="padding:18px 0;">Aún no ha agregado prendas.</div>';
    $("nota-total").hidden = true;
    return;
  }
  cont.innerHTML = prendas
    .map(
      (p, i) => `
      <div class="fila" style="margin-bottom:12px;">
        ${p.vistaPrevia ? `<img class="miniatura" src="${escapeHtml(p.vistaPrevia)}" alt="" />` : ""}
        <div class="crece">
          <h3>${escapeHtml(p.talla)} · ${escapeHtml(p.color)}</h3>
          <p>${escapeHtml(p.tipoDeTela)}</p>
          <p>${escapeHtml(p.especificaciones)}</p>
          <button class="btn btn-peligro btn-chico" data-quitar="${i}" type="button" style="margin-top:6px;">Quitar</button>
        </div>
        <div class="precio ${Number(p.precio) > 0 ? "" : "pendiente"}">${Number(p.precio) > 0 ? precio(p.precio) : "Precio por confirmar"}</div>
      </div>`
    )
    .join("");
  cont.querySelectorAll("[data-quitar]").forEach((b) =>
    b.addEventListener("click", () => {
      prendas.splice(Number(b.dataset.quitar), 1);
      pintarPrendas();
    })
  );
  $("total").textContent = dinero(totalConocido());
  $("nota-total").hidden = !prendas.some((p) => !(Number(p.precio) > 0));
}

function totalConocido() {
  return prendas.reduce((suma, p) => suma + (Number(p.precio) || 0), 0);
}

window.addEventListener("beforeunload", (e) => {
  if (prendas.length && $("dialogo-exito").hidden) {
    e.preventDefault();
    e.returnValue = "";
  }
});

/* ---------------------------------------------------------------- enviar */
// Código de pedido de 6 dígitos (HHmmss, como en la app). Como VENTAS GLOBALES usa solo el código como llave,
// se verifica que no esté tomado por otra clienta antes de usarlo.
async function codigoLibre() {
  const p = (n) => String(n).padStart(2, "0");
  const ahora = new Date();
  const candidatos = [`${p(ahora.getHours())}${p(ahora.getMinutes())}${p(ahora.getSeconds())}`];
  for (let i = 0; i < 8; i++) candidatos.push(String(Math.floor(Math.random() * 1000000)).padStart(6, "0"));
  for (const codigo of candidatos) {
    const [global, propio] = await Promise.all([
      get(ref(db, `VENTAS GLOBALES/${DESTINO}/${codigo}`)),
      get(ref(db, `PEDIDOS/${clienta.tel}/${codigo}`)),
    ]);
    if (!global.exists() && !propio.exists()) return codigo;
  }
  throw new Error("No se pudo generar el código del pedido");
}

async function subirFoto(archivo, i) {
  const blob = await comprimirImagen(archivo);
  const destino = refAlmacen(storage, `Fotos Subidas/img_${Date.now()}_${i}.jpg`);
  await uploadBytes(destino, blob, { contentType: "image/jpeg" });
  return getDownloadURL(destino);
}

$("btn-enviar").addEventListener("click", async () => {
  if (!$("fecha-entrega").value) {
    marcar("campo-fecha", true);
    aviso("Elija la fecha en que necesita su pedido.", "error");
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (!prendas.length) return;
  if (!window.confirm(`¿Enviar el pedido con ${prendas.length} ${prendas.length === 1 ? "prenda" : "prendas"}?`)) return;

  const btn = $("btn-enviar");
  btn.disabled = true;
  btn.textContent = "Enviando…";
  try {
    // 1) Fotos propias (comprimidas) al almacenamiento.
    const urls = [];
    for (let i = 0; i < prendas.length; i++) {
      urls.push(prendas[i].archivo ? await subirFoto(prendas[i].archivo, i) : prendas[i].foto);
    }

    // 2) Todo el pedido en una sola escritura.
    const codigo = await codigoLibre();
    const ahora = new Date();
    const fechaEntrega = deInputAFechaGuardada($("fecha-entrega").value);
    const fechaDeCreacion = new Intl.DateTimeFormat("es", {
      day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
    }).format(ahora);
    const base = `PEDIDOS/${clienta.tel}`;
    const cambios = {};
    prendas.forEach((p, i) => {
      const nodo = String(i + 1);
      cambios[`${base}/${codigo}/${nodo}`] = {
        foto: urls[i],
        especificaciones: p.especificaciones,
        talla: p.talla,
        color: p.color,
        tipoDeTela: p.tipoDeTela,
        estampado: p.estampado,
        urlEstampado: p.urlEstampado,
        fechaDeRecepcion: fechaEntrega,
        codigoDeCliente: clienta.tel,
        nombreCliente: clienta.nombre,
        precio: String(p.precio),
        precio1: String(p.precio1),
        precio2: String(p.precio2),
        estatus: "cerrado",
        nodoID: nodo,
        codigoDePedido: codigo,
      };
    });
    const registro = {
      nombreCliente: clienta.nombre,
      fechaDeCreacion,
      fechaDeCreacionISO: aISO(ahora),
      fechaDeRecepcion: fechaEntrega,
      codigoDeCliente: clienta.tel,
      codigoDePedido: codigo,
      estatus: "cerrado",
      codVendedora: "",
      nombreVendedora: VENDEDORA,
      seo: `${clienta.nombre}${codigo}`,
      ultimoNodo: String(prendas.length),
      origen: "Web clientas",
    };
    cambios[`${base}/mis pedidos/${codigo}`] = { ...registro, monto: String(totalConocido()) };
    cambios[`VENTAS GLOBALES/${DESTINO}/${codigo}`] = registro;
    await update(ref(db), cambios);

    prendas.length = 0;
    $("codigo-enviado").textContent = codigo;
    $("dialogo-exito").hidden = false;
  } catch (e) {
    console.error(e);
    aviso("No se pudo enviar el pedido. Revise su conexión e intente de nuevo.", "error");
    btn.disabled = false;
    btn.textContent = "Enviar pedido";
  }
});
