# Carol´s · Web para clientas

Sitio estático (HTML + CSS + JS, sin build) para que las **clientas de Carol´s** vean el historial de sus pedidos y
creen pedidos nuevos. No es para las clientas de las vendedoras: solo entra quien exista en
`TODOS LOS CLIENTES/CAROLS/{teléfono}`.

## Páginas
| Archivo | Qué hace |
|---|---|
| `index.html` + `js/login.js` | Login con **correo (o teléfono) y contraseña**. No hay registro. |
| `pedidos.html` + `js/pedidos.js` | Historial de sus pedidos (`PEDIDOS/{tel}/mis pedidos`), buscador por fecha de entrega o de creación y detalle de prendas. |
| `crear-pedido.html` + `js/crear-pedido.js` | Nuevo pedido: prendas del catálogo (código) o con su propia foto; las telas salen de `TELAS` y **solo se ofrecen colores disponibles** (`COLORES/{tela}`, los marcados "No disponible" en el ERP no aparecen). |
| `js/sesion.js` | Sesión; encuentra a la clienta por `CLIENTAS_WEB/{uid}` y verifica que sea de Carol´s. |

## Cómo se da acceso a una clienta (tú, como administradora)

**A) Clienta nueva, desde Carol's ERP (lo normal).** En el ERP: Clientes → Agregar cliente de Carol´s → llena sus datos
y el campo **Correo**. Al guardar, el ERP crea su usuario de Firebase (correo + **contraseña = su teléfono**, solo
dígitos) y deja el enlace `CLIENTAS_WEB/{uid} = teléfono` que usa esta web. Te muestra el correo y la contraseña para
que se los compartas por WhatsApp. Ella entra con su **correo** (o su teléfono, según cómo la creaste) y esa contraseña.

**B) Clientas que ya estaban registradas (a mano).** En Firebase Console → Authentication → Users → Add user, con su
correo y la contraseña que quieras. Después copia el **User UID** de ese usuario y en Realtime Database crea
`CLIENTAS_WEB/{ese uid}` con el valor = el teléfono de la clienta (texto, solo dígitos, igual que la llave de
`TODOS LOS CLIENTES/CAROLS/{teléfono}`). Sin ese enlace, la web responde "Su usuario aún no está habilitado".
(Alternativa sin enlace: crearla con el correo `TELEFONO@clientas.carols.app`; la web la reconoce, pero las reglas de
seguridad de abajo NO la dejarían pasar.)

Para quitarle el acceso: bórrala en Authentication → Users, o borra su `CLIENTAS_WEB/{uid}`.

## ⚠️ Antes de anunciar la web: cerrar las reglas

Hoy las reglas de Realtime Database y Storage están abiertas: cualquiera con la URL de la base puede leer y escribir
todo, tenga o no sesión. Como el ERP necesita crear usuarios, **el registro de usuarios de Firebase tiene que
quedar activado** (Authentication → Settings → User actions → "Enable create"). Eso significa que cualquiera podría
crearse una cuenta propia con la clave pública de la web; por eso la seguridad NO puede depender de "tener sesión", sino
de las reglas:

- `reglas-firebase-propuesta.json` (Realtime Database → Rules). Solo el personal (`STAFF/{uid} = true`) lee y escribe
  todo; cada clienta enlazada en `CLIENTAS_WEB` lee únicamente su historial y su ficha, y **crea** pedidos nuevos a su
  nombre (no puede modificar ni borrar los existentes ni ver los de otras).
- `storage-propuesta.rules` (Storage → Rules). Las clientas solo suben imágenes de hasta 5 MB; lo demás es del personal
  (por correo: escribe el tuyo en el archivo).

**Antes de publicarlas hay que crear `STAFF`**: en Realtime Database agrega `STAFF/{uid} = true` para cada persona
del personal que entra a Carol's ERP, Carol's 5.0 o la app de vendedoras (el uid se ve en Authentication → Users). Si
publicas las reglas sin eso, esas apps quedan sin acceso. Prueba todo en el *Rules Playground* y revisa las apps y
webs que hoy leen sin sesión (catálogo de distribuidores, web antigua del ERP): dejarían de funcionar.

Límite honesto: una clienta con conocimientos técnicos podría escribir precios distintos en **sus propios** pedidos
nuevos (las reglas no pueden recalcular precios del catálogo). Por eso los pedidos llegan al ERP como "cerrado" para que
administración los revise; los precios de fotos propias llegan en $0 ("por confirmar").

## Publicarla (GitHub Pages)
Sube todo el contenido de esta carpeta al repositorio (la raíz debe tener `index.html`) y activa
Settings → Pages. Luego, en Firebase Console → Authentication → Settings → **Authorized domains**, agrega el dominio
`tuusuario.github.io`; sin eso el login no funciona.

## Datos que escribe un pedido (igual que la app y el ERP)
Una sola operación atómica al enviar:
- `PEDIDOS/{tel}/{codigo}/{nodoID}` cada prenda · `PEDIDOS/{tel}/mis pedidos/{codigo}` resumen (monto, fechas, estatus,
  `origen: "Web clientas"`) · `VENTAS GLOBALES/Pedidos Carol´s/{codigo}` para que aparezca en Ventas del ERP.
- Código de pedido de 6 dígitos (HHmmss); se verifica que no esté tomado antes de usarlo.
- Las fotos propias se reducen a 1280 px antes de subirlas a `Fotos Subidas/`.
