# Bloques de PLUG para Tiendanube

Editor `/tienda`, acceso con la sesión administrativa existente. Cinco bloques: alerta, FAQ, medios de pago informativos, videos y cuenta regresiva. No modifica precios, descuentos de checkout, stock ni condiciones de cobro. Los textos son públicos; no ingresar claves o datos internos.

## Configuración

Cada bloque tiene título, texto, activación, ubicación y alcance para todas las páginas compatibles o productos remotos seleccionados. La selección incluye artículos no vinculados al inventario. FAQ, pagos y videos admiten hasta 20 elementos reordenables. Videos: URL HTTPS directa MP4/HLS/DASH o YouTube. No hay carga de archivos de video en esta versión.

La fecha se ingresa en hora local y se guarda como instante UTC. Al vencer se oculta el bloque, sin reiniciar la promoción por visitante. No cambia la vigencia de una oferta real en Tiendanube.

`Guardar borrador` conserva la publicación anterior. `Publicar versión` pide confirmación y reemplaza la instantánea publicada completa, incluidos los bloques apagados. Se puede apagar todo publicando una versión con los cinco desactivados. Control de versión impide sobrescribir desde una pestaña antigua. El borrador se guarda en PostgreSQL, no solamente en el navegador. El cierre con cambios sin guardar muestra el aviso nativo del navegador.

## Bundle SDK

Fuente: `storefront/main.ts`. `npm run build:storefront` genera `public/plug-storefront.min.js` (ES module con export `App`). `npm run build` también lo regenera. Usa componentes oficiales: Column, Text, Accordion, Video y SideScroll. No toca DOM, cookies ni almacenamiento de la tienda y no envía información de clientes/carrito. Usa únicamente el ID de tienda para consultar la configuración pública.

El worker consulta `/api/storefront/widgets?store=ID` al cargar la página y cada 60 segundos. Endpoint público GET sin credenciales, CORS abierto, sólo instantánea publicada; jamás devuelve borrador, sesión, inventario ni tokens. Cache 30 segundos con stale de 30 adicionales; una actualización puede demorar aproximadamente dos minutos según la caché. Ante un error conserva el último contenido recibido durante la vida de la página. La cuenta regresiva se actualiza cada segundo, y los slots mantienen IDs estables.

## Activación externa

OAuth de productos por sí solo no instala contenido visual. En el Portal de Socios, app PLUG Inventario 46841:

1. Habilitar el permiso Write Scripts (el portal lo exige actualmente y deshabilita Crear script). Esto amplía permisos de la app: confirmar con el titular antes del cambio.
2. Registrar script para `store`, Uses Nube SDK, cargar el bundle de producción; revisar auto instalación y asociación a tienda 8067012. Si el cambio de permisos requiere OAuth, volver a autorizar con el flujo existente del panel.
3. Validar en una tienda de prueba con tag SDK y revisar slots. Las ubicaciones propias de producto sólo se usan en la página de producto.
4. Verificar el script en la tienda real. Si no carga, soporte de socios debe revisar activación del par app/tienda. No requiere homologación de marketplace por ser privada.

Estado verificado el 16/10/2026: permiso de scripts habilitado, script 11413 versión 2 activo, auto instalado, NubeSDK, evento onfirstinteraction. Tiendanube confirmó por soporte la habilitación del SDK para app 46841 y tienda 8067012. Se comprobó en producción la FAQ, incluida la apertura y lectura de su respuesta. El evento onload requiere aprobación previa específica; usar onfirstinteraction. El panel consulta GET /scripts para mostrar instalación confirmada; ese estado por sí solo no reemplaza la prueba visual.

Documentación oficial consultada 2026-10-15:
- https://tiendanube.dev/es-AR/apps/nube-sdk/after-migration
- https://tiendanube.dev/apps/nube-sdk/script-structure
- https://tiendanube.dev/apps/nube-sdk/slots/storefront-slots
- https://tiendanube.dev/apps/nube-sdk/components/accordion
- https://tiendanube.dev/apps/nube-sdk/components/video

## Verificación

`npx tsx --test tests/store-widgets.test.ts`: validación, alcance, vencimiento, componentes SDK, privacidad de solicitudes y protección administrativa/origen.

`node tests/store-widgets-ui.mjs`: mocks aislados, escritorio y móvil; guardado de borrador/publicación, selección remota, FAQ, conflicto y ausencia de desborde. No publica en la tienda real.


## Diseño de referencia (16/10/2026)

Se inspeccionaron las demos públicas de Wigy en Chrome, tras la primera interacción.
Las ubicaciones son las observadas en el DOM de las demos, no una afirmación de resultados de conversión.

| Bloque | Ubicación de la ficha | Apariencia observada |
| --- | --- | --- |
| Alerta | before_product_detail_name | Píldora #ef4444, texto blanco de 14px, punto #f87171, radio 25px, padding 10px 20px |
| FAQ | after_product_detail_shipping_options | Filas #f7f7f7, texto #333333 de 14px/600, radio 5px, padding 18px, separación 10px |
| Pagos | after_product_detail_shipping_options | Fondo #fafafa, tarjetas blancas con logos, radio 8px, padding 23px, detalle verde |
| Videos | after_product_detail_shipping_options | Centro vertical con laterales visibles, radio 20px, separación 12px, flechas circulares y puntos |
| Contador | after_product_detail_price | Fondo #1e1e1e, casilleros #ef4444, texto blanco, detalle #fdc624, radio 5px |

Referencias: https://wigy.mitiendanube.com/productos/mensaje-de-alerta/, /preguntas-frecuentes/, /metodos-de-pago-1pvcw/, /slider-de-videos/ y /cuenta-regresiva/.
Implementación propia con NubeSDK. No se reutilizan scripts, videos ni imágenes de Wigy.
Los logos reconocidos provienen del CDN de Tiendanube que ya utiliza PLUG.
El verde informativo usa #15803d para conservar contraste a 13px.
No se copian condiciones de cuotas, porcentajes ni mensajes de escasez de las demos.

Cada bloque permite editar fondo/texto/detalle y restaurar ubicación y colores de referencia.
El título de administración solo se muestra como título público en el contador, igual que en la referencia.
La configuración antigua sin colores se adapta al cargar el editor y al ejecutar el nuevo script;
se conservan activación, contenido, productos y fechas. Los diseños con colores explícitos conservan su posición.
El contador utiliza horas totales (no pierde días), una fecha real y desaparece al vencer.

### Entrega de esta actualización

El panel y el archivo público se despliegan desde el repositorio. El CDN de Partners requiere subir
`public/plug-storefront.min.js` como nueva versión del script 11413 y activarla en las tiendas.
La versión 2 instalada no recibe cambios del archivo alojado en el panel.
La subida automatizada quedó bloqueada por el permiso de URLs de archivo de la extensión de Chrome.
No se modificó la configuración publicada mientras el CDN continúa usando la versión 2.
