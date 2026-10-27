# Marketplace

El apartado `/marketplace` prepara una publicación por producto del inventario propio. No consulta Tiendanube. Genera un título con nombre, marca, color y talles disponibles, y una descripción breve editable. Usa `precioVentaARS`; cualquier precio particular del aviso se guarda en su borrador y no cambia el inventario.

## Usarlo

1. Entrar con una cuenta administradora y abrir **Marketplace**.
2. Elegir una prenda disponible. Revisar título, descripción, precio, estado real, categoría y localidad. Guardar el borrador. También se pueden seleccionar varias prendas para preparar una cola; los borradores existentes se conservan.
3. Abrir **Conectar Chrome**, descargar el ZIP y extraerlo. En `chrome://extensions`, activar Modo de desarrollador, pulsar **Cargar descomprimida** y seleccionar la carpeta que contiene `manifest.json`. Recargar el panel y detectar la extensión.
4. Pulsar **Cargar en Facebook**. En el formulario abierto, invocar **PLUG · Marketplace** desde el rompecabezas de Chrome y pulsar **Cargar publicación**. Las fotos externas pueden requerir permiso para su origen concreto. Se puede desactivar la carga de fotos y agregarlas manualmente.
5. Revisar fotos, texto, estado, categoría y ubicación en Facebook; completar sus pasos y publicar allí. El conector nunca pulsa Siguiente ni Publicar, ni cambia preferencias de privacidad o promoción.
6. Copiar el enlace del aviso y registrarlo en PLUG con **Confirmar que ya publiqué**. Es una declaración del usuario, no una verificación automática de Facebook.

**Vendido** y **Retirado** actualizan el seguimiento interno. La venta se registra en el inventario por su flujo habitual, y el aviso se actualiza o retira desde Facebook. Los cambios de disponibilidad o de la ficha generan una advertencia al actualizar la lista; no hay vigilancia remota ni modificación automática de avisos.

Si una carga falla, revisar el formulario antes de reintentar. El conector protege texto existente salvo reemplazo explícito y conserva fotos ya adjuntas. El envío pendiente vence a los diez minutos; descartarlo solo borra la preparación de la extensión. **Copiar texto** y los enlaces de las fotos permiten continuar manualmente.

## Datos y permisos

- Los borradores se guardan en PostgreSQL por cuenta administradora, con revisión para detectar guardados simultáneos. Solo puede registrarse un aviso por producto y un mismo enlace no puede asociarse a dos productos de esa cuenta.
- El servidor exige sesión administradora y origen exacto en escrituras. La proyección pública excluye costos, proveedores, notas y ubicación privada. El estado de la prenda debe elegirse; no se deduce autenticidad, material o condición de las imágenes.
- Chrome conserva únicamente un envío pendiente en `storage.session`. No obtiene cookies, claves ni mensajes de Facebook. La página de PLUG se comprueba de nuevo antes de llenar el formulario; si cambian stock, versión o contenido, hay que revisar y reenviar.
- El script y los permisos de host se limitan al panel de PLUG y sus dos direcciones locales de desarrollo. Admiten navegación interna y comprobar la URL de la pestaña fuente, pero el puente atiende pedidos solo en `/marketplace`. Facebook recibe acceso temporal al invocar la extensión mediante `activeTab`. Los permisos opcionales de imágenes se solicitan solo para los orígenes concretos de las fotos elegidas. Fundamento: [permisos de pestañas de Chrome](https://developer.chrome.com/docs/extensions/reference/api/tabs#permissions).
- Galería: hasta nueve fotos; 3 MB por descarga y 12 MB total, con límite adicional para la transferencia inicial. JPEG, PNG y WebP. Las imágenes demasiado grandes o no compatibles se cargan manualmente.
- El adaptador reconoce el formulario de escritorio en español observado el 27/10/2026. Si Facebook cambia etiquetas o estructura, muestra una indicación para completar manualmente. Es una herramienta propia de carga asistida, sin integración oficial de publicación ni garantía de alcance.

## Desarrollo y validación

No se agregan servicios pagos ni claves externas. La conexión PostgreSQL y la autenticación existentes son suficientes. Las tablas aditivas `plug_marketplace_drafts` y `plug_marketplace_limits` se crean en el primer acceso con los permisos habituales de la aplicación.

```powershell
npm run build:marketplace
npx tsx --test tests/marketplace.test.ts tests/marketplace.integration.test.ts
node --test tests/marketplace-connector.test.mjs
npm run build
```

`npm run build` incluye el paquete de la extensión. Fuente: `extensions/marketplace-connector/`. Descarga servida sin sesión: `/plug-marketplace-connector.zip`; el paquete contiene solo los siete archivos de la extensión, sin credenciales ni datos de productos. Si cambia el dominio del panel, actualizar la lista explícita de orígenes en el manifiesto, puente y worker y volver a cargar la extensión.

Validación del 27/10/2026: trece pruebas aprobadas, incluyendo API con PostgreSQL aislado, acceso, conflictos, duplicados, stock, transferencia de imagen y navegación interna del puente. Compilación de producción aprobada. Pantalla revisada en escritorio y móvil con productos ficticios; etiquetas y categoría contrastadas con el formulario real sin publicar. La instalación en Chrome, el envío completo de un producto real y el despliegue de este módulo todavía no se verificaron. El comando de lint del repositorio carece de `eslint.config.*`; no se modificó su configuración global.
