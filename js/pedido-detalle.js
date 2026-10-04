import { db } from "./firebase-config.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { exigirSesion } from "./sesion.js";
import { escapeHtml, dinero, precio, aviso } from "./utils.js";
import { rutaPiezas, rutaResumen, piezasDe, totalDe, cerrarPedido, TEXTO_CIERRE } from "./pedidos-datos.js";

// Detalle completo de un pedido (página aparte). Si está abierto, desde aquí se puede seguir agregando prendas
// o cerrarlo; si ya está cerrado, es solo de consulta.
const codigo = new URLSearchParams(window.location.search).get("codigo");
const $ = (id) => document.getElementById(id);
let clienta = null;
let piezas = [];

if (!codigo) window.location.replace("pedidos.html");

exigirSesion().then((c) => {
  clienta = c;
  $("subtitulo").textContent = `Pedido ${codigo}`;
  onValue(ref(db, rutaResumen(c.tel, codigo)), (snap) => pintarResumen(snap.exists() ? snap.val() : null));
  onValue(ref(db, rutaPiezas(c.tel, codigo)), (snap) => {
    piezas = piezasDe(snap.val());
    pintarPrendas();
  });
});

function pintarResumen(r) {
  if (!r) {
    $("resumen").innerHTML = '<div class="vacio">No encontramos este pedido.</div>';
    $("acciones").hidden = true;
    return;
  }
  const abierto = r.estatus === "abierto";
  const total = Number(r.monto) > 0 ? dinero(r.monto) : "Por confirmar";
  $("resumen").innerHTML = `
    <div class="fila">
      <div class="crece">
        <h2>Pedido ${escapeHtml(codigo)}</h2>
        <p>Entrega: ${escapeHtml(r.fechaDeRecepcion || "por confirmar")}</p>
        <p>Creado: ${escapeHtml(r.fechaDeCreacion || "—")}</p>
        ${abierto ? '<span class="etiqueta roja">Abierto · puede seguir agregando</span>' : '<span class="etiqueta verde">Cerrado</span>'}
      </div>
      <div class="precio ${Number(r.monto) > 0 ? "" : "pendiente"}">${total}</div>
    </div>`;
  $("acciones").hidden = !abierto;
  $("nota-cerrado").hidden = abierto;
  $("btn-continuar").href = `crear-pedido.html?codigo=${encodeURIComponent(codigo)}`;
}

function pintarPrendas() {
  const cont = $("lista-prendas");
  if (!piezas.length) {
    cont.innerHTML = '<div class="vacio">Este pedido todavía no tiene prendas.</div>';
    return;
  }
  cont.innerHTML =
    piezas
      .map(
        ([nodo, p]) => `
      <div class="vidrio">
        <div class="fila">
          ${p.foto ? `<a href="${escapeHtml(p.foto)}" target="_blank" rel="noopener"><img class="miniatura" src="${escapeHtml(p.foto)}" alt="" loading="lazy" /></a>` : ""}
          <div class="crece">
            <h3>${escapeHtml(p.talla)} · ${escapeHtml(p.color)}</h3>
            <p>${escapeHtml(p.tipoDeTela)}</p>
            <p>${escapeHtml(p.especificaciones)}</p>
            <p>Prenda #${escapeHtml(nodo)}</p>
          </div>
          <div class="precio ${Number(p.precio) > 0 ? "" : "pendiente"}">${Number(p.precio) > 0 ? precio(p.precio) : "Por confirmar"}</div>
        </div>
      </div>`
      )
      .join("") +
    `<div class="total" style="padding:6px 6px 0;"><span>Total</span><span>${dinero(totalDe(piezas))}</span></div>`;
}

$("btn-cerrar").addEventListener("click", async () => {
  if (!window.confirm(TEXTO_CIERRE)) return;
  const btn = $("btn-cerrar");
  btn.disabled = true;
  btn.textContent = "Cerrando…";
  try {
    await cerrarPedido(clienta, codigo);
    aviso("Pedido cerrado. ¡Gracias!", "exito");
  } catch (e) {
    console.error(e);
    aviso(e.message === "vacio" ? "Este pedido no tiene prendas. Agregue al menos una antes de cerrarlo." : "No se pudo cerrar el pedido. Intente de nuevo.", "error");
    btn.disabled = false;
    btn.textContent = "Cerrar pedido";
  }
});
