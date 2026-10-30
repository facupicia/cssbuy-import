# Facturación mensual en Inventario

Inventario incluye un resumen de **Facturación por mes**, con selector de mes, importe total, unidades y detalle de fecha, producto, talle e importe. La comparación despliega los meses que tienen ventas registradas. El resumen es global: los filtros del listado de productos no alteran los totales.

Al usar **Registrar venta**, se guardan la fecha de venta, las unidades y el precio efectivamente cobrado por unidad en ARS. La fecha inicial es el día actual de Argentina; permite cargar fechas anteriores, hasta hoy. El importe queda separado del precio actual de la ficha: cambiar el precio del producto después no modifica los meses anteriores. El nombre y costo de la prenda también quedan guardados como referencia histórica. El resumen no representa comprobantes fiscales ni ganancia neta.

Las unidades que ya figuraban como vendidas quedan en **Unidades vendidas sin fecha**. Desde **Completar venta**, indicar la fecha real, unidades y precio efectivamente cobrado. Si hubo distintas fechas o precios, registrar cada grupo por separado. Este paso completa el historial y **no vuelve a descontar stock**. El precio sugerido es el actual de la ficha; verificarlo al completar una venta anterior. No se deducen fechas desde la creación o última edición del producto.

El historial usa ventas cargadas en este inventario. No importa automáticamente pedidos de Tiendanube, devoluciones, gastos ni atribución de Meta. Los totales acumulados anteriores permanecen identificados como estimaciones a precios y costos actuales. Si se reducen manualmente las cantidades vendidas por debajo del historial, aparece una advertencia para revisar las fichas; el historial mensual se conserva.

## Persistencia y acceso

La tabla `inventory_sales` se crea al consultar o guardar ventas. Conserva los registros aunque se elimine la ficha del inventario; no tiene borrado en cascada. El endpoint privado `GET /api/inventario/ventas?mes=AAAA-MM` devuelve el resumen global de meses, el detalle del mes solicitado y cantidades pendientes de fecha. `POST /api/inventario/ventas` registra una venta nueva o completa una anterior.

La venta nueva y la actualización de stock se guardan en una sola transacción con bloqueo del producto. Un identificador de solicitud estable hace seguros los reintentos de la misma venta. Se valida fecha, precio, cantidades enteras, stock disponible y talle en el servidor. El historial no ofrece edición, anulación ni devolución en esta primera versión; las correcciones de registros fechados requieren una ampliación específica.

## Verificación local

- `npx tsx --test tests/inventory-sales.integration.test.ts tests/inventory-list.test.ts tests/inventory-weight.test.ts`: nueve pruebas con PostgreSQL temporal para precios históricos, meses, ventas anteriores, talles, ventas concurrentes, reintentos, eliminación de productos y acceso privado.
- `npm run build`: compilación de producción.
- `node tests/inventory-sales-ui.mjs`: flujo real con autenticación, HTTP, base temporal y navegador en 1365 y 390 px; mes vacío, completar venta anterior, venta nueva, stock y precio histórico.

Las verificaciones usan datos sintéticos en una base aislada. No consultan ni modifican el inventario de producción.

## Cuando solo se conoce el mes

La opción **Solo recuerdo el mes** permite registrar `AAAA-MM` sin inventar el día. El detalle muestra el mes con la aclaración `(solo mes)`. Internamente se almacena una fecha de agrupación junto con `fecha_precision=mes`; el primer día es únicamente una referencia de agrupación, no un día de venta afirmado. Los registros diarios existentes conservan su precisión y los reintentos diferencian un mes de una fecha exacta. El pendiente de venta muestra también el SKU para distinguir prendas con el mismo nombre.

## Ganancia mensual de mercadería

Cada mes muestra facturado, costo de las prendas vendidas y ganancia de mercadería. Se suman las unidades por la diferencia entre el precio cobrado y el costo unitario que quedó guardado al registrar cada venta. La comparación de meses también muestra esa ganancia. Los cambios posteriores de precios o costos de la ficha no alteran el historial. Las pérdidas se conservan con signo negativo. Este resultado es anterior a publicidad, comisiones y otros gastos; no es utilidad neta. En ventas anteriores completadas, el costo de referencia es el que tenía la ficha al completar el historial.

El listado individual se abre desde **Detalle de ventas**, que indica la cantidad de registros. Arranca colapsado y se puede abrir o cerrar con clic o teclado. Facturado, costo y ganancia permanecen visibles; la comparación entre meses conserva su control independiente.
