# CSSBuy → PLUG

El botón **Herramientas → Sincronizar órdenes** abre la conexión con Chrome.
El servidor recibe HTTP 403 al consultar CSSBuy directamente; el conector usa
la sesión que el propietario ya abrió en su navegador. No resuelve captchas
ni copia cookies, contraseñas o tokens de CSSBuy al servidor de PLUG.

## Instalación y uso

1. Abrir el diálogo e ingresar la contraseña de administración de PLUG.
2. Descargar y extraer `/plug-cssbuy-connector.zip` (también están los fuentes
   en `extensions/cssbuy-connector`).
3. En `chrome://extensions`, activar Modo de desarrollador, Cargar descomprimida
   y seleccionar la carpeta que contiene `manifest.json`.
4. Recargar PLUG y mantener una pestaña `https://www.cssbuy.com` con sesión iniciada.
5. Pulsar **Sincronizar pedidos y movimientos**.

La extensión solo tiene acceso a CSSBuy y un puente de contenido en el dominio
de este panel. No se ejecuta en segundo plano periódicamente. Si CSSBuy requiere
login o verificación, el propietario los completa en la pestaña de CSSBuy.

## Datos y límites

- Lectura paginada de pedidos: GET `/api/v3/user/order`.
- Lectura de movimientos: POST `/api/v2/user/record` (consulta, no pago).
- Ambos endpoints y sus parámetros se verificaron en los recursos públicos del
  sitio de CSSBuy el 15/10/2026. No constituyen una API pública estable.
- Pedidos inválidos, cancelados o reembolsados se excluyen siguiendo el filtro
  existente de PLUG. Se conservan pedidos enviados, en depósito y en proceso.
- Los datos se guardan en PostgreSQL; pedidos por ID y movimientos por ID o
  huella estable. Repetir la sincronización actualiza sin duplicar ni eliminar
  el historial ausente. Las importaciones se guardan en una transacción.
- Se registran la fecha de sincronización real y cualquier fallo parcial. Si
  fallan los movimientos, se importan los pedidos y se conserva el historial
  anterior. Una paginación incompleta de pedidos no se importa.
- La calculadora carga los pedidos guardados y, con sesión administrativa,
  también los movimientos. No reemplaza productos de cotizaciones en edición.
- No realiza compras, pagos, envíos, cambios de stock ni publicaciones.
- El ingreso exige cookie administrativa, mismo origen, cuerpo limitado y
  validación. El conector no recibe la contraseña de administración.
- Para actualizar el ZIP tras editar la extensión:
  `python scripts/package-cssbuy-connector.py` y **Recargar** en Chrome.

La conexión real requiere instalar el conector y completar una sincronización
con la cuenta de CSSBuy; que las pruebas locales pasen no confirma esa conexión.
