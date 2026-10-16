# Bloques de PLUG para Tiendanube

Editor `/tienda`, acceso con la sesión administrativa existente. Cinco bloques: alerta, FAQ, medios de pago informativos, videos y cuenta regresiva. No modifica precios, descuentos de checkout, stock ni condiciones de cobro. Los textos son públicos; no ingresar claves o datos internos.

## Configuración

Cada bloque tiene título, texto, activación, ubicación y alcance para todas las páginas compatibles o productos remotos seleccionados. La selección incluye artículos no vinculados al inventario. FAQ, pagos y videos admiten hasta 20 elementos reordenables. Videos: URL HTTPS directa MP4/HLS/DASH o YouTube. No hay carga de archivos de video en esta versión.

La fecha se ingresa en hora local y se guarda como instante UTC. Al vencer se oculta el bloque, sin reiniciar la promoción por visitante. No cambia la vigencia de una oferta real en Tiendanube.

`Guardar borrador` conserva la publicación anterior. `Publicar versión` pide confirmación y reemplaza la instantánea publicada completa, incluidos los bloques apagados. Se puede apagar todo publicando una versión con los cinco desactivados. Control de versión impide sobrescribir desde una pestaña antigua. El borrador se guarda en PostgreSQL, no solamente en el navegador. El cierre con cambios sin guardar muestra el aviso nativo del navegador.

## Bundle SDK

Fuente: `storefront/main.ts`. `npm run build:storefront` genera `public/plug-storefront.min.js` (ES module con export `App`). `npm run build` también lo regenera. Usa componentes oficiales: Column, Text, Accordion, Video y SideScroll. No toca DOM, cookies ni almacenamiento de la tienda y no envía información de clientes/carrito. Usa únicamente el ID de tienda para consultar la configuración pública.

El worker consulta `/api/storefront/widgets?store=ID` al cargar la página y cada 60 segundos. Endpoint público GET sin credenciales, CORS abierto, sólo instantánea publicada; jamás devuelve borrador, sesión, inventario ni tokens. Cache 30 segundos con stale de 30 adicionales; una actualización puede demorar aproximadamente dos minutos según la caché. Ante un error conserva el último contenido recibido durante la vida de la página. La cuenta regresiva se actualiza cada segundo, y los slots mantienen IDs estables.

## Activación externa pendiente

OAuth de productos por sí solo no instala contenido visual. En el Portal de Socios, app PLUG Inventario 46841:

1. Habilitar el permiso Write Scripts (el portal lo exige actualmente y deshabilita Crear script). Esto amplía permisos de la app: confirmar con el titular antes del cambio.
2. Registrar script para `store`, Uses Nube SDK, cargar el bundle de producción; revisar auto instalación y asociación a tienda 8067012. Si el cambio de permisos requiere OAuth, volver a autorizar con el flujo existente del panel.
3. Validar en una tienda de prueba con tag SDK y revisar slots. Las ubicaciones propias de producto sólo se usan en la página de producto.
4. Verificar el script en la tienda real. Si no carga, soporte de socios debe revisar activación del par app/tienda. No requiere homologación de marketplace por ser privada.

No se envió ninguna solicitud a soporte ni se amplió el permiso de la app durante la implementación. El editor muestra activación pendiente porque guardar contenido no prueba que el runtime esté activo.

Documentación oficial consultada 2026-10-15:
- https://tiendanube.dev/es-AR/apps/nube-sdk/after-migration
- https://tiendanube.dev/apps/nube-sdk/script-structure
- https://tiendanube.dev/apps/nube-sdk/slots/storefront-slots
- https://tiendanube.dev/apps/nube-sdk/components/accordion
- https://tiendanube.dev/apps/nube-sdk/components/video

## Verificación

`npx tsx --test tests/store-widgets.test.ts`: validación, alcance, vencimiento, componentes SDK, privacidad de solicitudes y protección administrativa/origen.

`node tests/store-widgets-ui.mjs`: mocks aislados, escritorio y móvil; guardado de borrador/publicación, selección remota, FAQ, conflicto y ausencia de desborde. No publica en la tienda real.
