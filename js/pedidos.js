import { db } from "./firebase-config.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { exigirSesion, cerrarSesion } from "./sesion.js";
import { escapeHtml, dinero, parsearFecha, aISO, entradas, aviso } from "./utils.js";
import { cerrarPedido, TEXTO_CIERRE } from "./pedidos-datos.js";

const lista = document.getElementById("lista-pedidos");
const filtro = document.getElementById("filtro-fecha");
const btnLimpiar = document.getElementById("btn-limpiar");

let clienta = null;
let pedidos = []; // { codigo, ...resumen }

document.getElementById("btn-salir").addEventListener("click", cerrarSesion);

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
      // Primero los abiertos (para retomarlos) y luego el más reciente por fecha de entrega.
      pedidos.sort((a, b) => (esAbierto(b) - esAbierto(a)) || (clave(b) - clave(a)));
      pintar();
    },
    () => (lista.innerHTML = '<div class="vacio">No se pudo cargar su historial. Intente de nuevo.</div>')
  );
});

const esAbierto = (p) => (p.estatus === "abierto" ? 1 : 0);

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

// Si ya tiene un pedido abierto, se le ofrece continuarlo en vez de abrir otro.
document.getElementById("btn-nuevo").addEventListener("click", (e) => {
  const abierto = pedidos.find((p) => p.estatus === "abierto");
  if (!abierto) return;
  const continuar = window.confirm(
    `Usted tiene el pedido ${abierto.codigo} abierto.\n\nAceptar: continuar con ese pedido.\nCancelar: empezar un pedido nuevo.`
  );
  if (continuar) {
    e.preventDefault();
    window.location.href = `crear-pedido.html?codigo=${encodeURIComponent(abierto.codigo)}`;
  }
});

function coincide(p) {
  if (!filtro.value) return true;
  const entrega = parsearFecha(p.fechaDeRecepcion);
  return (entrega && aISO(entrega) === filtro.value) || p.fechaDeCreacionISO === filtro.value;
}

function etiquetaEstado(estatus) {
  if (estatus === "cerrado") return '<span class="etiqueta verde">Cerrado</span>';
  if (estatus === "abierto") return '<span class="etiqueta roja">Abierto · puede seguir agregando</span>';
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
    .map((p) => {
      const cod = encodeURIComponent(p.codigo);
      const abierto = p.estatus === "abierto";
      return `
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
        <div class="acciones">
          <a class="btn btn-claro btn-chico" href="pedido-detalle.html?codigo=${cod}">Ver prendas</a>
          ${abierto ? `<a class="btn btn-claro btn-chico" href="crear-pedido.html?codigo=${cod}">Continuar</a>
          <button class="btn btn-chico" data-cerrar="${escapeHtml(p.codigo)}" type="button">Cerrar pedido</button>` : ""}
        </div>
      </div>`;
    })
    .join("");
  lista.querySelectorAll("[data-cerrar]").forEach((b) => b.addEventListener("click", () => cerrar(b)));
}

async function cerrar(boton) {
  if (!window.confirm(TEXTO_CIERRE)) return;
  boton.disabled = true;
  boton.textContent = "Cerrando…";
  try {
    await cerrarPedido(clienta, boton.dataset.cerrar);
    aviso("Pedido cerrado. ¡Gracias!", "exito");
  } catch (e) {
    console.error(e);
    aviso(e.message === "vacio" ? "Ese pedido no tiene prendas. Agregue al menos una antes de cerrarlo." : "No se pudo cerrar el pedido. Intente de nuevo.", "error");
    boton.disabled = false;
    boton.textContent = "Cerrar pedido";
  }
}
