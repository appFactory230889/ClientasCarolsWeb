# Carol´s · Web para clientas

Sitio estático (HTML + CSS + JS, sin build) para que las **clientas de Carol´s** vean el historial de sus pedidos y
creen pedidos nuevos. No es para las clientas de las vendedoras: solo entra quien exista en
`TODOS LOS CLIENTES/CAROLS/{teléfono}`.

## Páginas
| Archivo | Qué hace |
|---|---|
| `index.html` + `js/login.js` | Login con **teléfono y contraseña**. No hay registro. |
| `pedidos.html` + `js/pedidos.js` | Historial de sus pedidos (`PEDIDOS/{tel}/mis pedidos`), buscador por fecha de entrega o de creación y detalle de prendas. |
| `crear-pedido.html` + `js/crear-pedido.js` | Nuevo pedido: prendas del catálogo (código) o con su propia foto; las telas salen de `TELAS` y **solo se ofrecen colores disponibles** (`COLORES/{tela}`, los marcados "No disponible" en el ERP no aparecen). |
| `js/sesion.js` | Sesión y verificación de que la clienta sea de Carol´s. |

## Cómo crear una clienta (tú, como administradora)
1. La clienta debe existir en el ERP como cliente de **Carol´s** (su teléfono es la llave: solo dígitos, sin +503).
2. Firebase Console → **Authentication → Users → Add user**:
   - Correo: `TELEFONO@clientas.carols.app` (ej. `77001122@clientas.carols.app`)
   - Contraseña: la que quieras compartirle.
3. Le compartes por WhatsApp: el enlace de la web, su **teléfono** y su **contraseña**. Ella solo escribe teléfono y contraseña; el correo es interno.
4. Para quitarle el acceso: bórrala en Authentication → Users (o bórrala del ERP: sin registro de cliente tampoco entra).

## ⚠️ Antes de publicar: dos cosas obligatorias en Firebase

**1. Apagar el registro de usuarios.** Firebase Console → Authentication → **Settings → User actions → desmarcar
"Enable create (sign-up)"**. Mientras esté activado, cualquiera que conozca la clave pública de la web puede crear
`77001122@clientas.carols.app` por su cuenta (la clave está en el código de cualquier página web) y entraría como si
fuera esa clienta. Con el registro apagado, solo existen los usuarios que tú creas en la consola.

> Consecuencia: la app **Taller Carol´s** hoy crea cuentas de operarias desde la propia app ("Activar mi cuenta"). Con el
> registro apagado hay que crear también a las operarias desde la consola (`TELEFONO@taller.carols.app`) y quitar esa
> pantalla. Es lo más seguro y es el mismo procedimiento que las clientas.

**2. Cerrar las reglas de la base de datos y de Storage.** Hoy están abiertas: cualquiera con la URL de la base puede
leer y escribir todo. Archivos de esta carpeta (propuesta, **no desplegada**):
- `reglas-firebase-propuesta.json` → Realtime Database → Rules.
- `storage-propuesta.rules` → Storage → Rules.

Qué logran: el personal (cualquier usuario que no sea `@clientas…` ni `@taller…`) sigue como hoy; cada clienta solo
**lee** su propio historial y **crea** pedidos nuevos a su nombre (no puede modificar ni borrar los existentes ni ver los de
otras); cada operaria solo escribe su propia asistencia. Pruébalas en el *Rules Playground* antes de publicar y revisa
que ninguna otra app o web que use el proyecto (catálogo de distribuidores, web antigua del ERP sin login) dependa del
acceso sin sesión: dejaría de funcionar.

Límite honesto: una clienta con conocimientos técnicos podría escribir precios distintos en **sus propios** pedidos nuevos
(las reglas no pueden recalcular precios del catálogo). Por eso los pedidos llegan al ERP como "cerrado" para que
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
