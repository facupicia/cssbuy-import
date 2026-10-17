# Agenda de vendedores y fábricas

En **Calculadora → Mis proveedores** (`/calculadora/proveedores`) se guardan los proveedores elegidos por el propietario. No se agregan automáticamente al sincronizar CSSBuy.

Cada ficha admite nombre (obligatorio), tipo vendedor o fábrica, categoría de productos, contacto, enlace de tienda o catálogo, producto de referencia, notas privadas y favorito. La tienda y el producto de referencia son enlaces independientes; los pedidos de CSSBuy solo aportan el segundo. Las notas conservan saltos de línea y admiten hasta 4000 caracteres.

**Guardar vendedor** en un pedido de CSSBuy abre el formulario con el nombre del vendedor y el enlace del producto. El usuario revisa y guarda. Si ya hay una ficha con el mismo nombre, sin distinguir mayúsculas, o la misma referencia normalizada, se abre la ficha existente para evitar repetirla.

La búsqueda incluye nombre, categoría, contacto, notas y enlaces, sin distinguir acentos o mayúsculas. Se combina con tipo, categoría y favoritos. Los favoritos se ordenan primero y el resto por nombre. El listado muestra 12 fichas por página. Las notas se ven completas, sin acordeón.

Crear o editar usa un formulario separado del listado. Cancelar y cambiar de sección por un enlace pide descartar cambios si corresponde; cerrar o recargar la pestaña activa el aviso del navegador. Los errores de guardado conservan el formulario. Si vence el acceso durante la edición se puede renovarlo en otra pestaña y volver a guardar.

## Persistencia y acceso

`/api/proveedores` requiere la sesión de administración común para lectura y escritura. Las mutaciones exigen también el origen del panel. El ingreso se gestiona desde Configuración y vuelve a esta agenda conservando los datos de referencia de CSSBuy.

Los datos se guardan en PostgreSQL, en la tabla `suppliers`, creada al primer acceso autenticado. No dependen de localStorage ni del dispositivo. El esquema incluye versión por ficha: modificar o eliminar exige la versión leída; si otra pantalla la cambió, devuelve 409 y conserva las notas que se estaban editando. La URL de tienda normalizada no puede repetirse. Los enlaces admiten exclusivamente HTTP/HTTPS sin credenciales; no se descargan en el servidor.

## Verificación

`npx tsx --test tests/suppliers.test.ts tests/admin-session.test.ts` cubre validación, búsquedas y filtros combinados, acceso privado, origen, persistencia de notas, duplicados y versiones concurrentes con base simulada. `TEST_BASE_URL=http://localhost:3002 node tests/suppliers-ui.mjs` cubre escritorio y móvil: ingreso con regreso, filtros, páginas, guardado con fallo y reintento, recarga, descarte, eliminación y selección manual desde CSSBuy. Las pruebas no escriben en los datos reales.
