export function escapeHtml(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function dinero(n) {
  const v = Number(n);
  return Number.isNaN(v) ? "$0.00" : "$" + v.toFixed(2);
}

// Precio en la lista: sin ".00" cuando es entero ("$5"), como en la app.
export function precio(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return escapeHtml(n);
  return Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`;
}

// Las fechas de los pedidos se guardan como "d/M/yyyy" sin ceros ("2/10/2026").
export function parsearFecha(texto) {
  if (!texto) return null;
  const partes = String(texto).trim().split("/");
  if (partes.length !== 3) return null;
  const [d, m, a] = partes.map(Number);
  if (!d || !m || !a) return null;
  const fecha = new Date(a, m - 1, d);
  fecha.setHours(0, 0, 0, 0);
  return fecha;
}

export function fechaGuardada(fecha) {
  return `${fecha.getDate()}/${fecha.getMonth() + 1}/${fecha.getFullYear()}`;
}

// "2026-10-04" (valor de <input type="date">) -> "4/10/2026"
export function deInputAFechaGuardada(valor) {
  const [a, m, d] = String(valor).split("-").map(Number);
  return a && m && d ? `${d}/${m}/${a}` : "";
}

export function aISO(fecha) {
  const p = (n) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`;
}

export function limpiarTelefono(texto) {
  return String(texto || "").replace(/\D/g, "").replace(/^503(?=\d{8}$)/, "");
}

// Firebase guarda como arreglo (con huecos null) los nodos cuyas llaves son enteros pequeños y
// consecutivos (nodoID "1", "2"...). Se normaliza a pares [llave, valor].
export function entradas(valor) {
  if (valor === null || valor === undefined) return [];
  if (Array.isArray(valor)) {
    return valor.map((v, i) => [String(i), v]).filter(([, v]) => v !== null && v !== undefined);
  }
  return Object.entries(valor);
}

export function aviso(mensaje, tipo = "info") {
  let cont = document.getElementById("avisos");
  if (!cont) {
    cont = document.createElement("div");
    cont.id = "avisos";
    document.body.appendChild(cont);
  }
  const el = document.createElement("div");
  el.className = "aviso " + tipo;
  el.textContent = mensaje;
  cont.appendChild(el);
  requestAnimationFrame(() => el.classList.add("visible"));
  setTimeout(() => {
    el.classList.remove("visible");
    setTimeout(() => el.remove(), 300);
  }, 3600);
}

// Reduce una foto del celular antes de subirla (las cámaras actuales dan 5-10 MB): máx. 1280 px, JPEG.
export function comprimirImagen(archivo, maximo = 1280, calidad = 0.8) {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    const url = URL.createObjectURL(archivo);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(1, maximo / Math.max(img.width, img.height));
      const lienzo = document.createElement("canvas");
      lienzo.width = Math.round(img.width * escala);
      lienzo.height = Math.round(img.height * escala);
      lienzo.getContext("2d").drawImage(img, 0, 0, lienzo.width, lienzo.height);
      lienzo.toBlob((blob) => (blob ? resolver(blob) : rechazar(new Error("No se pudo procesar la foto"))), "image/jpeg", calidad);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rechazar(new Error("No se pudo leer la foto"));
    };
    img.src = url;
  });
}
