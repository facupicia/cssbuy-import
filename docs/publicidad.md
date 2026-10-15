# Publicidad y consulta de costos

Esta versión agrega `/publicidad`, un panel privado con dos fuentes separadas:

- Meta Marketing API: gasto y conversiones web por campaña en el intervalo elegido.
- PostgreSQL de la app: costo landed, precio y stock actuales, con límites de adquisición por producto.

No modifica anuncios, presupuestos, productos ni ventas. No atribuye las ventas acumuladas del inventario a campañas. No calcula ganancia neta por campaña: para eso falta registrar pedidos cobrados con fecha, ítems, descuentos, comisiones, envío, devoluciones y origen, conservando una copia del costo al vender.

## Configuración en el servidor

1. Conservar las variables `PG*` que ya usa Inventario.
2. Definir `ADMIN_PASSWORD` con al menos 12 caracteres.
3. Generar una clave aleatoria diferente de al menos 32 caracteres para `BUSINESS_READ_API_KEY`, por ejemplo con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` en una terminal privada.
4. Configurar `META_ACCESS_TOKEN` con permiso `ads_read` y acceso a la cuenta publicitaria, `META_AD_ACCOUNT_ID` y `META_GRAPH_API_VERSION` con la versión vigente habilitada en la app de Meta. El token del conector de este chat no se transfiere automáticamente al sitio.
5. Configurar `BUSINESS_APP_ORIGIN=https://db.vidaeventofiesta.site` (o el origen público usado). Reiniciar el servicio con su `.env.local` actualizado. Docker Compose ya carga ese archivo; no se necesitan credenciales durante el build.
6. Abrir `/publicidad` e ingresar la contraseña de administración. La sesión dura ocho horas, en cookie HttpOnly, SameSite Strict y Secure en producción. No se guarda la contraseña en el navegador.

No guardar secretos en Git, variables `NEXT_PUBLIC_*`, URLs o mensajes del chat. Un token vencido debe renovarse en el servidor.

La cuenta PLUG identificada durante el análisis es `981944784938102`, en ARS. Configurar explícitamente la cuenta deseada; no está fijada en el código. El reporte respeta la moneda de Meta y no convierte monedas.

## API para un conector del chat

Ambas rutas aceptan `Authorization: Bearer <BUSINESS_READ_API_KEY>` y devuelven `Cache-Control: private, no-store`.

`GET /api/integraciones/costos`

Parámetros opcionales: `feePercent` (0 a 100), `shippingARS`, `packagingARS`, `targetProfitARS` (no negativos). Devuelve únicamente identificación del producto, SKU, stock, precio, costo y métricas de contribución; no devuelve clientes, credenciales ni notas internas.

`GET /api/integraciones/meta?since=2026-10-10&until=2026-10-14`

Fechas obligatorias en formato ISO, intervalo máximo de 90 días de diferencia. Incluye campañas con actividad en esas fechas, sin limitarse a las actualmente activas. La paginación tiene un máximo de 20 páginas de 100 filas; si se excede, se rechaza el reporte en vez de mostrar un total incompleto.

El esquema [business-read.openapi.json](business-read.openapi.json) puede utilizarse para construir un conector privado. Preparar estas rutas no registra herramientas automáticamente en Codex/ChatGPT: después de desplegar hay que conectar la URL HTTPS y guardar la clave en la configuración privada del conector. No pegar la clave en el chat.

## Interpretación

- Una unidad por pedido. Para carritos con varias prendas se debe calcular la contribución del pedido completo.
- Contribución = precio − costo landed − comisiones porcentuales − envío a cargo del negocio − packaging.
- CPA de equilibrio = contribución positiva. CPA objetivo = máximo de cero y contribución menos la ganancia deseada.
- ROAS de equilibrio = precio / contribución positiva. Si faltan precio o costo, los límites son nulos. Un costo cero se trata como incompleto.
- Si los gastos adicionales se dejan en cero, no se descuentan. Son supuestos explícitos, no gastos medidos.
- Compras, valor, CPA y ROAS del reporte usan exclusivamente `offsite_conversion.fb_pixel_purchase`. No se suman acciones omni y pixel que pueden representar el mismo evento.
- Un evento ausente se devuelve como `null`, no como una venta cero confirmada. Las cifras de Meta son atribuidas y pueden actualizarse con demora.
- El inventario es una foto de costos y precios actuales. Los límites estimados no cambian con el filtro de fechas de Meta.

## Seguridad y operación

Las rutas nuevas requieren sesión o clave de lectura; no cambian la protección de las rutas existentes. El panel solo consulta datos. El token de Meta permanece en el servidor y nunca se devuelve. La conexión HTTP de Meta tiene un timeout de 15 segundos por página; sus errores internos no se devuelven ni se registran con credenciales.

Límites por proceso: 60 consultas autenticadas por minuto y 10 intentos de ingreso por minuto. Antes de desplegar varias réplicas usar un limitador compartido en el proxy. Usar HTTPS en producción y preservar el origen público en el reverse proxy para las solicitudes de ingreso/cierre de sesión.

## Validación local

`npx tsx --test tests/publicidad.test.ts`

`npx tsc --noEmit`

`npm run build`

Las pruebas no consultan Meta ni la base de producción. Para validar la conexión real se necesitan las variables privadas de despliegue; comprobar fechas, moneda, gasto y compras contra Ads Manager con el mismo intervalo y atribución.

Referencias oficiales: [Meta Marketing API](https://www.postman.com/meta/facebook-marketing-api/collection/0zr4mes/facebook-marketing-api-mapi) y [Ads Insights](https://developers.facebook.com/docs/marketing-api/insights/).
