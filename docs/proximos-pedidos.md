# Próximos pedidos

En **Calculadora → Próximos pedidos** (`/calculadora/pedidos`) se preparan compras futuras de CSSBuy. Los borradores se guardan en PostgreSQL, separados de pedidos comprados, inventario y cotizaciones. Requieren la cuenta administrativa del panel.

## Uso

1. Crear un pedido y asignarle un nombre.
2. Pegar el enlace de un producto o pulsar **Elegir de mis enlaces guardados**. En CSSBuy se conserva la identidad del producto y se descartan rastreadores; también se admiten referencias HTTP/HTTPS de origen, cuya carga de costos es manual.
3. Completar nombre, talle/color, cantidad, precio unitario en CNY y peso estimado por unidad en gramos. **Otra variante** copia la ficha y permite armar otra combinación; el envío China se reinicia para revisarlo.
4. Cargar el **envío China total de cada fila**, el flete internacional total en USD, comisión estimada, impuestos previstos en USD y otros gastos. Flete e impuestos vacíos son pendientes; cero es una elección explícita.
5. Revisar las cotizaciones. Los valores iniciales vienen de la configuración guardada de la calculadora y no se presentan como cotizaciones actuales. **Consultar cotizaciones** intenta actualizar dólar blue y CNY/USD e informa si fue parcial. El usuario puede ingresar el cambio que realmente pagará.
6. Opcionalmente cargar presupuesto máximo y precio de venta previsto por unidad. Se muestra exceso de presupuesto y margen de mercadería si todas las ventas y costos están completos. No representa ganancia neta ni resultados realizados.
7. Guardar como borrador, listo para revisar o archivado. Listo requiere nombres, precios, pesos, flete e impuestos completos. Archivar conserva los datos y se revierte cambiando el estado.
8. Un pedido completo y guardado se puede **Abrir en calculadora**. El traspaso usa el mecanismo existente de carga de nueva cotización; no guarda una cotización ni compra o agrega stock automáticamente. Revisar cualquier cálculo abierto antes del traspaso.

## Lectura de enlaces

### Usar enlaces guardados

El selector reúne **Proveedores**, **Inventario**, **Pedidos CSSBuy**, **Cotizaciones** y **Pedidos guardados**. Permite buscar por nombre, variante, proveedor o enlace, marcar productos en distintas fuentes y agregarlos juntos. Las selecciones se conservan al buscar o cambiar de fuente. Actualizar enlaces vuelve a consultar la base y limpia la selección anterior.

De proveedores se muestra el producto de referencia para agregar y el catálogo para abrir en otra pestaña. Un catálogo no se agrega como si fuera un producto. La referencia de un proveedor no tiene nombre de modelo guardado: ese nombre se completa en la nueva fila. De inventario se conservan nombre y variante/talle; también se pueden elegir productos agotados para planificar reposición, sin afirmar disponibilidad del proveedor.

Se copian **enlace, nombre y variante**, con una unidad editable. Precio, peso y envío quedan pendientes para revisarlos en la nueva compra; no se copian importes ni cantidades de una compra anterior como si fueran actuales. Se omiten duplicados por enlace y variante y se mantiene el límite de 100 filas. El pedido en edición y los planes archivados se excluyen de la fuente Pedidos guardados. Elegir enlaces no modifica inventario, proveedores, cotizaciones o pedidos anteriores.

La consulta privada `/api/compras/guardados` usa solo datos ya guardados; no consulta tiendas, CSSBuy ni Tiendanube en vivo. Solo devuelve campos para identificar enlaces, sin contactos, notas privadas ni fotos. Si una fuente falla, conserva las demás y muestra el aviso correspondiente. Una fuente sin enlaces necesita completar la referencia en la ficha original. Las cotizaciones que solo existan en el almacenamiento local de otro navegador no aparecen en este selector del servidor.

### Lectura opcional desde Chrome

El conector CSSBuy 1.1.0 conserva los permisos existentes. **Leer enlace en Chrome** verifica la sesión PLUG y busca la pestaña del producto exacto; si falta, la abre y pide reintentar cuando termine de cargar. No pulsa comprar, selecciona variantes ni modifica CSSBuy.

Esta primera lectura admite metadatos JSON-LD inequívocos de un único producto. Lee el nombre y solo toma precio unitario cuando todas las ofertas exponen un mismo precio explícito en CNY. No convierte precios mostrados en USD, no trata rangos como precios unitarios y no interpreta importes ajenos como precios. Si CSSBuy no expone esos metadatos, solicita completar los campos a mano. No se promete extracción general de una aplicación dinámica sin una ficha real verificada.

El cliente vuelve a validar la URL recibida y los límites de los campos. La lectura no copia cookies, tokens ni contraseñas de CSSBuy. Peso, disponibilidad, variantes y precio por volumen se revisan a mano. Los precios leídos conservan fecha y pueden quedar desactualizados. La URL de ejemplo del propietario no pudo verificarse con el acceso directo disponible el 10/11/2026; las pruebas de la extensión usan una ficha simulada, no confirman el catálogo real.

## Cálculo y persistencia

Se reutiliza `calcularTodo` para mantener el prorrateo por peso y el traspaso a la calculadora. El envío China total por fila se divide por su cantidad al convertir al formato unitario existente. Otros gastos se suman al flete antes de aplicar comisión; está indicado junto al campo. Los impuestos siempre son el importe explícito ingresado, sin aplicar reglas aduaneras inferidas. Si falta algún dato, el resumen muestra un subtotal parcial; no muestra costo final por unidad ni margen de venta hasta completar los supuestos.

`/api/compras` admite GET/POST/PATCH, verifica sesión, mismo origen para cambios y tamaño de cuerpo. `purchase_plans` se crea en el primer acceso. Actualizaciones usan ID y versión para rechazar cambios concurrentes con HTTP 409. Un error de guardado conserva el formulario y la navegación advierte sobre cambios pendientes. El servicio usa la misma base y alcance administrativo del resto del panel.

## Validación

- `npx tsx --test tests/purchase-plans.test.ts tests/cssbuy-bridge.test.ts tests/suppliers.test.ts`
- `node tests/cssbuy-extension.mjs`: extensión real con páginas y respuestas simuladas, sin cuenta CSSBuy real.
- `node tests/purchase-plans-ui.mjs`: cuenta y PostgreSQL temporales; crear, guardar, recargar, variantes, cantidades, presupuesto y traspaso, en escritorio y móvil.
- `npm run build`

El ZIP se actualiza con `python scripts/package-cssbuy-connector.py`. La publicación del panel y la actualización de la extensión instalada son pasos independientes de la validación local.
