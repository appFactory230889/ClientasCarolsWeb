import { db, storage } from "./firebase-config.js";
import { ref, onValue, get } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { ref as refAlmacen, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
import { exigirSesion } from "./sesion.js";
import { escapeHtml, dinero, precio, aviso, entradas, comprimirImagen, deInputAFechaGuardada, parsearFecha, aISO } from "./utils.js";
import {
  rutaPiezas, rutaResumen, piezasDe, totalDe, crearPedido, agregarPrenda, quitarPrenda, cerrarPedido, TEXTO_CIERRE,
} from "./pedidos-datos.js";

// Pantalla de un pedido ABIERTO: dos pestañas, "Agregar prenda" y "Detalle del pedido". El pedido se crea al
// guardar la primera prenda y cada prenda se guarda al instante; con ?codigo=… se retoma un pedido abierto.
const TALLAS_GRANDES = ["XL", "XXL"];

let clienta = null;
let codigo = new URLSearchParams(window.location.search).get("codigo") || null;
let fechaEntrega = null; // "d/M/yyyy" del pedido (se fija al crearlo)
let metodo = "catalogo";
let catalogo = null; // { codigo, foto, precio1, precio2 }
let archivoFoto = null;
let telas = [];
let coloresPorTela = {};
let colorElegido = null;
let vigilando = false;
let cerrando = false; // evita que el aviso de "pedido cerrado" redirija antes de mostrar el mensaje de éxito

const $ = (id) => document.getElementById(id);
const hoy = new Date();
$("fecha-entrega").min = aISO(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1));

/* ---------------------------------------------------------------- pestañas */
document.querySelectorAll(".pestanas button").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll(".pestanas button").forEach((x) => x.classList.toggle("activo", x === b));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("activo", p.id === "panel-" + b.dataset.panel));
  })
);
function irAPestana(nombre) {
  document.querySelector(`.pestanas button[data-panel="${nombre}"]`).click();
}

/* ---------------------------------------------------------------- inicio */
exigirSesion().then(async (c) => {
  clienta = c;
  cargarTelas();
  if (!codigo) return;
  const resumen = (await get(ref(db, rutaResumen(c.tel, codigo)))).val();
  if (!resumen || resumen.estatus === "cerrado") {
    // No existe o ya está cerrado: solo se puede consultar.
    window.location.replace(resumen ? `pedido-detalle.html?codigo=${encodeURIComponent(codigo)}` : "pedidos.html");
    return;
  }
  fijarPedido(resumen.fechaDeRecepcion);
  vigilarPedido();
});

// Con el pedido ya creado, la fecha de entrega queda fija.
function fijarPedido(fecha) {
  fechaEntrega = fecha;
  const f = parsearFecha(fecha);
  if (f) $("fecha-entrega").value = aISO(f);
  $("fecha-entrega").disabled = true;
  $("ayuda-fecha").textContent = "La fecha de este pedido ya quedó registrada.";
  $("subtitulo").textContent = `Pedido ${codigo}`;
  $("titulo-pedido").textContent = `Pedido ${codigo}`;
}

function vigilarPedido() {
  if (vigilando) return;
  vigilando = true;
  onValue(ref(db, rutaPiezas(clienta.tel, codigo)), (snap) => pintarPrendas(piezasDe(snap.val())));
  onValue(ref(db, `${rutaResumen(clienta.tel, codigo)}/estatus`), (snap) => {
    if (snap.val() === "cerrado" && !cerrando) {
      window.location.replace(`pedido-detalle.html?codigo=${encodeURIComponent(codigo)}`);
    }
  });
}

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
        .map(([cod, c]) => ({ codColor: c.codColor || cod, color: c.color || "", imagen: c.imagen || "", disponible: c.disponible !== false }))
        .filter((c) => c.color);
    }
    pintarTelas();
    pintarColores();
  });
}

const coloresDisponibles = (tela) => (coloresPorTela[tela] || []).filter((c) => c.disponible);
// Una tela con colores registrados pero todos agotados no se puede pedir.
const telaSinColores = (tela) => (coloresPorTela[tela] || []).length > 0 && coloresDisponibles(tela).length === 0;

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

let urlVistaPrevia = null;
function actualizarVistaPrevia() {
  const img = $("vista-previa");
  if (urlVistaPrevia) URL.revokeObjectURL(urlVistaPrevia);
  urlVistaPrevia = null;
  let url = null;
  if (metodo === "catalogo") url = catalogo && catalogo.foto;
  else if (archivoFoto) url = urlVistaPrevia = URL.createObjectURL(archivoFoto);
  img.hidden = !url;
  if (url) img.src = url;
}

$("foto-propia").addEventListener("change", (e) => {
  archivoFoto = e.target.files[0] || null;
  actualizarVistaPrevia();
  actualizarPrecioInfo();
});

async function buscarCatalogo() {
  const cod = $("codigo-catalogo").value.trim();
  const campo = $("campo-codigo");
  campo.classList.remove("con-error");
  catalogo = null;
  if (!cod || /[.#$\[\]\/]/.test(cod)) {
    campo.classList.add("con-error");
    actualizarVistaPrevia();
    return;
  }
  try {
    const snap = await get(ref(db, `CATALOGO/Todas las prendas/${cod}`));
    if (!snap.exists()) {
      campo.classList.add("con-error");
    } else {
      const v = snap.val();
      catalogo = { codigo: cod, foto: v.foto || "", precio1: String(v.precio1 ?? "0"), precio2: String(v.precio2 ?? v.precio1 ?? "0") };
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
const precioDe = (item, talla) => (item ? (TALLAS_GRANDES.includes(talla) ? item.precio2 : item.precio1) : null);

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

/* ---------------------------------------------------------------- guardar prenda (al instante) */
function marcar(campoId, conError) {
  $(campoId).classList.toggle("con-error", conError);
  return !conError;
}

async function subirFoto(archivo) {
  const blob = await comprimirImagen(archivo);
  const destino = refAlmacen(storage, `Fotos Subidas/img_${Date.now()}.jpg`);
  await uploadBytes(destino, blob, { contentType: "image/jpeg" });
  return getDownloadURL(destino);
}

$("btn-agregar").addEventListener("click", async () => {
  const talla = $("talla").value;
  const tela = $("tela").value;
  const especificaciones = $("especificaciones").value.trim();
  const hayColores = (coloresPorTela[tela] || []).length > 0;
  const color = hayColores ? (colorElegido ? colorElegido.color : "") : $("color-texto").value.trim();

  let ok = true;
  if (!codigo) ok = marcar("campo-fecha", !$("fecha-entrega").value) && ok;
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
  const prenda = {
    talla,
    tipoDeTela: tela,
    color,
    estampado: hayColores && colorElegido ? colorElegido.codColor : "ninguno",
    urlEstampado: hayColores && colorElegido && colorElegido.imagen ? colorElegido.imagen : "ninguno",
    especificaciones,
    precio: delCatalogo ? precioDe(catalogo, talla) : "0",
    precio1: delCatalogo ? catalogo.precio1 : "0",
    precio2: delCatalogo ? catalogo.precio2 : "0",
  };

  const btn = $("btn-agregar");
  btn.disabled = true;
  btn.textContent = "Guardando…";
  try {
    const urlFoto = delCatalogo ? catalogo.foto : await subirFoto(archivoFoto);
    if (!codigo) {
      const fecha = deInputAFechaGuardada($("fecha-entrega").value);
      codigo = await crearPedido(clienta, fecha, prenda, urlFoto);
      fijarPedido(fecha);
      // Si recarga la página, vuelve a este mismo pedido.
      window.history.replaceState(null, "", `crear-pedido.html?codigo=${encodeURIComponent(codigo)}`);
      vigilarPedido();
    } else {
      await agregarPrenda(clienta, codigo, fechaEntrega, prenda, urlFoto);
    }
    aviso("Prenda guardada en su pedido", "exito");
    limpiarFormulario();
  } catch (e) {
    console.error(e);
    aviso("No se pudo guardar la prenda. Revise su conexión e intente de nuevo.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Guardar prenda y continuar";
  }
});

function limpiarFormulario() {
  $("talla").value = "";
  $("especificaciones").value = "";
  $("color-texto").value = "";
  $("codigo-catalogo").value = "";
  $("foto-propia").value = "";
  $("tela").value = "";
  colorElegido = null;
  catalogo = null;
  archivoFoto = null;
  pintarColores();
  actualizarVistaPrevia();
  actualizarPrecioInfo();
}

/* ---------------------------------------------------------------- detalle del pedido */
function pintarPrendas(piezas) {
  const cont = $("lista-prendas");
  $("pestana-detalle").textContent = piezas.length ? `Detalle del pedido (${piezas.length})` : "Detalle del pedido";
  $("btn-cerrar").hidden = !piezas.length;
  $("ayuda-cerrar").hidden = !piezas.length;
  $("bloque-total").hidden = !piezas.length;
  if (!piezas.length) {
    cont.innerHTML = '<div class="vacio" style="padding:18px 0;">Aún no ha guardado prendas.</div>';
    $("nota-total").hidden = true;
    return;
  }
  cont.innerHTML = piezas
    .map(
      ([nodo, p]) => `
      <div class="fila" style="margin-bottom:14px;">
        ${p.foto ? `<img class="miniatura" src="${escapeHtml(p.foto)}" alt="" loading="lazy" />` : ""}
        <div class="crece">
          <h3>${escapeHtml(p.talla)} · ${escapeHtml(p.color)}</h3>
          <p>${escapeHtml(p.tipoDeTela)}</p>
          <p>${escapeHtml(p.especificaciones)}</p>
          <button class="btn btn-peligro btn-chico" data-quitar="${escapeHtml(nodo)}" type="button" style="margin-top:6px;">Quitar</button>
        </div>
        <div class="precio ${Number(p.precio) > 0 ? "" : "pendiente"}">${Number(p.precio) > 0 ? precio(p.precio) : "Precio por confirmar"}</div>
      </div>`
    )
    .join("");
  cont.querySelectorAll("[data-quitar]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!window.confirm("¿Quitar esta prenda del pedido?")) return;
      try {
        await quitarPrenda(clienta, codigo, b.dataset.quitar);
        aviso("Prenda quitada", "exito");
      } catch (e) {
        aviso("No se pudo quitar la prenda.", "error");
      }
    })
  );
  $("total").textContent = dinero(totalDe(piezas));
  $("nota-total").hidden = !piezas.some(([, p]) => !(Number(p.precio) > 0));
}

$("btn-cerrar").addEventListener("click", async () => {
  if (!window.confirm(TEXTO_CIERRE)) return;
  const btn = $("btn-cerrar");
  btn.disabled = true;
  btn.textContent = "Cerrando…";
  cerrando = true;
  try {
    await cerrarPedido(clienta, codigo);
    $("codigo-enviado").textContent = codigo;
    $("dialogo-exito").hidden = false;
  } catch (e) {
    console.error(e);
    aviso(e.message === "vacio" ? "Agregue al menos una prenda antes de cerrar el pedido." : "No se pudo cerrar el pedido. Intente de nuevo.", "error");
    cerrando = false;
    btn.disabled = false;
    btn.textContent = "Cerrar pedido";
  }
});
