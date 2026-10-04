import { db } from "./firebase-config.js";
import { ref, onValue, get } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { exigirSesion, cerrarSesion } from "./sesion.js";
import { escapeHtml, dinero, precio, parsearFecha, aISO, entradas } from "./utils.js";

const lista = document.getElementById("lista-pedidos");
const filtro = document.getElementById("filtro-fecha");
const btnLimpiar = document.getElementById("btn-limpiar");
const dialogo = document.getElementById("dialogo");

let clienta = null;
let pedidos = []; // { codigo, ...resumen }

document.getElementById("btn-salir").addEventListener("click", cerrarSesion);
document.getElementById("dialogo-cerrar").addEventListener("click", () => (dialogo.hidden = true));
dialogo.addEventListener("click", (e) => {
  if (e.target === dialogo) dialogo.hidden = true;
});

// Historial de la clienta: PEDIDOS/{tel}/mis pedidos/{codigoPedido}
exigirSesion().then((c) => {
  clienta = c;
  if (c.nombre) document.getElementById("nombre-clienta").textContent = c.nombre + " · historial de pedidos";
  onValue(
    ref(db, `PEDIDOS/${c.tel}/mis pedidos`),
    (snap) => {
      pedidos = entradas(snap.val())
        .filter(([, p]) => p && typeof p === "object")
        .map(([codigo, p]) => ({ codigo: p.codigoDePedido || codigo, ...p }));
      pedidos.sort((a, b) => clave(b) - clave(a));
      pintar();
    },
    () => (lista.innerHTML = '<div class="vacio">No se pudo cargar su historial. Intente de nuevo.</div>')
  );
});

// Más reciente primero: por fecha de entrega.
function clave(p) {
  const f = parsearFecha(p.fechaDeRecepcion);
  return f ? f.getTime() : 0;
}

filtro.addEventListener("input", () => {
  btnLimpiar.hidden = !filtro.value;
  pintar();
});
btnLimpiar.addEventListener("click", () => {
  filtro.value = "";
  btnLimpiar.hidden = true;
  pintar();
});

function coincide(p) {
  if (!filtro.value) return true;
  const entrega = parsearFecha(p.fechaDeRecepcion);
  return (entrega && aISO(entrega) === filtro.value) || p.fechaDeCreacionISO === filtro.value;
}

function etiquetaEstado(estatus) {
  if (estatus === "cerrado") return '<span class="etiqueta verde">Recibido</span>';
  if (estatus === "abierto") return '<span class="etiqueta">En captura</span>';
  return estatus ? `<span class="etiqueta">${escapeHtml(estatus)}</span>` : "";
}

function pintar() {
  const visibles = pedidos.filter(coincide);
  if (!pedidos.length) {
    lista.innerHTML = '<div class="vacio">Todavía no tiene pedidos. Toque <b>＋ Nuevo pedido</b> para hacer el primero.</div>';
    return;
  }
  if (!visibles.length) {
    lista.innerHTML = '<div class="vacio">No hay pedidos con esa fecha.</div>';
    return;
  }
  lista.innerHTML = visibles
    .map(
      (p) => `
      <div class="vidrio">
        <div class="fila">
          <div class="crece">
            <h3>Pedido ${escapeHtml(p.codigo)}</h3>
            <p>Entrega: ${escapeHtml(p.fechaDeRecepcion || "por confirmar")}</p>
            <p>Creado: ${escapeHtml(p.fechaDeCreacion || "—")}</p>
            ${etiquetaEstado(p.estatus)}
          </div>
          <div class="precio ${Number(p.monto) > 0 ? "" : "pendiente"}">${Number(p.monto) > 0 ? dinero(p.monto) : "Por confirmar"}</div>
        </div>
        <button class="btn btn-claro btn-chico" style="margin-top:10px;" data-codigo="${escapeHtml(p.codigo)}" type="button">Ver prendas</button>
      </div>`
    )
    .join("");
  lista.querySelectorAll("[data-codigo]").forEach((b) => b.addEventListener("click", () => verDetalle(b.dataset.codigo)));
}

async function verDetalle(codigo) {
  document.getElementById("dialogo-titulo").textContent = `Pedido ${codigo}`;
  const cuerpo = document.getElementById("dialogo-cuerpo");
  cuerpo.innerHTML = '<div class="vacio">Cargando…</div>';
  dialogo.hidden = false;
  try {
    const snap = await get(ref(db, `PEDIDOS/${clienta.tel}/${codigo}`));
    const piezas = entradas(snap.val()).filter(([, p]) => p && typeof p === "object");
    if (!piezas.length) {
      cuerpo.innerHTML = '<div class="vacio">Este pedido no tiene prendas registradas.</div>';
      return;
    }
    cuerpo.innerHTML = piezas
      .map(
        ([nodo, p]) => `
        <div class="fila" style="margin-bottom:12px;">
          ${p.foto ? `<img class="miniatura" src="${escapeHtml(p.foto)}" alt="" loading="lazy" />` : ""}
          <div class="crece">
            <h3>${escapeHtml(p.talla)} · ${escapeHtml(p.color)}</h3>
            <p>${escapeHtml(p.tipoDeTela)}</p>
            <p>${escapeHtml(p.especificaciones)}</p>
          </div>
          <div class="precio ${Number(p.precio) > 0 ? "" : "pendiente"}">${Number(p.precio) > 0 ? precio(p.precio) : "Por confirmar"}</div>
        </div>`
      )
      .join("");
  } catch (e) {
    cuerpo.innerHTML = '<div class="vacio">No se pudo cargar el detalle.</div>';
  }
}
