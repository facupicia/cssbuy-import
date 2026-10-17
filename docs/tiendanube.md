# Productos y Tiendanube

En `/inventario`, crear un producto o abrir su nombre o la acción **Editar** muestra un editor de página completa con las secciones **Producto**, **Talles y stock**, **Costos y precio** y **Fotos y tienda**. En **Fotos y tienda** se administran hasta nueve fotos en un único lugar, antes de la descripción pública, la categoría y el peso de envío; la descripción es independiente de las notas internas. El descuento por transferencia y el redondeo del precio de lista se ajustan en **Costos y precio**. La barra inferior conserva las acciones **Crear producto / Guardar cambios**: guardan la ficha en el inventario, sin enviarla ni publicarla en Tiendanube. La primera foto es la portada; **Antes** cambia el orden. Las fotos se guardan como JPEG en PostgreSQL junto con la ficha. No dependen del disco efímero de Docker. Para catálogos grandes conviene migrarlas a almacenamiento de objetos, porque hoy se leen con el inventario.

## Fotos uniformes antes de importar

El formato del catálogo es **1280 × 1280 px**. Las fotos se centran manteniendo sus proporciones; los espacios restantes quedan blancos. No se recorta el producto, no se estira y no se elimina el fondo original. Las transparencias se convierten a blanco y se corrige la orientación de las fotos al decodificarlas. Es la recomendación para imágenes cuadradas de [Tiendanube Argentina](https://ayuda.tiendanube.com/es_AR/fotos-del-producto/como-adaptar-el-tamano-de-las-imagenes-de-mis-productos).

Se pueden seleccionar varias fotos JPG, PNG o WebP juntas desde el equipo y seguir agregando fotos en otra tanda, hasta nueve por producto. Cada archivo admite hasta 12 MB y 40 megapíxeles; se comprime ajustando la calidad JPEG para que su representación guardada no supere 700.000 caracteres. Las imágenes pequeñas se amplían al tamaño uniforme con un aviso de nitidez: no se inventa detalle adicional.

Las fotos nuevas, incluidas las agregadas por enlace HTTPS, se normalizan automáticamente. **Normalizar todas** adapta también las fotos existentes, como la imagen de un producto importado de CSSBuy. Las dimensiones de cada miniatura indican si ya tiene el tamaño uniforme. Si falla una foto durante la normalización del lote, la galería anterior queda intacta. **Guardar cambios** conserva la galería preparada; esta operación no envía ni publica productos en Tiendanube. Revisar las fotos antes del envío manual.

Los archivos del equipo se procesan en el navegador. Para enlaces, `/api/inventario/fotos/normalizar` descarga exclusivamente imágenes de sitios HTTPS públicos: valida DNS y cada redirección, fija la IP de la conexión, bloquea redes internas y limita tamaño, duración, cantidad de solicitudes y operaciones simultáneas. No requiere las credenciales de Tiendanube. Algunos sitios restringen descargas externas; en ese caso se puede subir el archivo desde el equipo.

Desde la acción directa **Tiendanube** o **Herramientas → Preparar y publicar productos** se revisan los productos seleccionados, o los filtrados si no hay selección. Se muestran precio publicado, SKU, stock por talle, validaciones y advertencias. Al editar una ficha desde esta revisión se abre el mismo editor; después de guardar o salir se vuelve a la revisión para decidir el envío. Salir con cambios sin guardar pide confirmar que se descarten. Guardar la ficha no inicia la publicación. La ficha se puede preparar sin credenciales de Tiendanube.

## Configuración privada

### App privada para el plan Esencial

PLUG usa el plan Esencial y el dominio `https://plugrosario.xyz`. Ese plan puede instalar una app privada mediante OAuth; no necesita “Aplicaciones a medida”, que está reservado a Escala y Evolución. La conexión del conector de este chat es independiente de la autorización de la web.

Crear una app externa en el [Portal de Socios](https://partners.tiendanube.com), con distribución **Para tus clientes**. Nombre sugerido: **PLUG Inventario**. La app privada no requiere publicarse en la Tienda de Aplicaciones ni pasar por homologación. Puede seguir apareciendo En desarrollo.

| Campo | Valor |
| --- | --- |
| URL de la app / panel | `https://db.vidaeventofiesta.site/inventario` |
| URL de redirección | `https://db.vidaeventofiesta.site/api/tiendanube/oauth/callback` |
| Permisos | Lectura y escritura de productos (`write_products`, que incluye lectura, variantes, imágenes y categorías) |

En **Inventario → Herramientas → Preparar y publicar productos**, ingresar con la contraseña de administración. La sección **Conexión con Tiendanube** permite cargar el ID de la app, la clave secreta, el correo de contacto y el dominio de la tienda. **Guardar app** conserva la configuración cifrada; no solicita autorización ni publica productos. **Autorizar conexión en Tiendanube** abre el administrador de la tienda para que el propietario acepte sus permisos y vuelva automáticamente al inventario.

El callback intercambia el código en el servidor, verifica `write_products`, el ID, el dominio y que la moneda sea ARS, y comprueba lectura de productos. Si se autoriza otra tienda, no se reemplaza la conexión anterior. La primera prueba de escritura se realiza luego desde la vista previa de un producto usando **Guardar oculto**. No se realizan altas ni publicaciones automáticas al conectar.

La clave de la app y el token se guardan cifrados mediante AES de 256 bits en modo GCM, con clave derivada de `ADMIN_PASSWORD` mediante scrypt y sal aleatoria. La base solo contiene el cifrado; las respuestas nunca devuelven los secretos. La sesión de administración es independiente del OAuth. El estado de autorización dura diez minutos, se vincula al navegador con una cookie HttpOnly SameSite=Lax y se consume una sola vez en PostgreSQL. Las demás sesiones continúan con SameSite=Strict. Los envíos usan una conexión fija durante cada operación y comprueban que la tienda coincida con la vista previa.

Conservar una copia segura de las credenciales de la app. Cambiar `ADMIN_PASSWORD` requiere volver a configurar la app y autorizar la tienda, porque la conexión anterior no puede descifrarse con otra contraseña. **Desconectar del panel** quita el token local y las autorizaciones pendientes, conserva los vínculos y no elimina productos remotos. Para revocar también el acceso en Tiendanube, desinstalar la app desde su administrador. **Verificar acceso** consulta la tienda sin modificar productos.

Referencias: [instalar apps privadas](https://tiendanube.dev/es-AR/apps/admin/overview), [OAuth](https://tiendanube.github.io/api-documentation/authentication) y [planes de Aplicaciones a medida](https://ayuda.tiendanube.com/es_AR/aplicaciones-a-medida/como-gestionar-las-aplicaciones-a-medida-en-tiendanube).

### Alternativa administrada desde el servidor

Si ya existe una aplicación autorizada y se prefiere administrar su token mediante variables de entorno, se conserva este modo con prioridad sobre la configuración del panel. Configurar en `.env.local` o en el servidor:

```env
TIENDANUBE_STORE_ID=
TIENDANUBE_ACCESS_TOKEN=
TIENDANUBE_USER_AGENT=PLUG (contacto@tudominio.com)
TIENDANUBE_LOCATION_ID=
ADMIN_PASSWORD=
BUSINESS_APP_ORIGIN=https://tu-panel.example
```

La contraseña debe tener al menos 12 caracteres. La sesión de publicación dura una hora, usa una cookie HttpOnly y no comparte la clave de lectura del panel de publicidad. Los tokens nunca se envían al navegador. Reiniciar el servidor al cambiar variables. La interfaz permite comprobar la conexión, ingresar y elegir una categoría existente. No se crean categorías automáticamente. En tiendas con varios depósitos, `TIENDANUBE_LOCATION_ID` debe identificar el depósito representado por este inventario.

## Envío y reintentos

### Descripciones y medidas

La vista previa de la descripción queda siempre visible. Las tablas automáticas incluyen Bape, Supreme, Valley Dreams, Miexed Emotions, Amiri y Sp5der. Amiri usa las medidas de Supreme por indicación del dueño; Sp5der usa la tabla del proveedor para buzos, con el contorno de pecho y el ancho del ruedo diferenciados. Cuando falta una tabla, la revisión avisa y la descripción pide consultar medidas sin mostrar una tabla vacía ni indicar una conversión de pecho sin referencia.

Las preguntas frecuentes se presentan con sus respuestas visibles en el panel y en el nuevo archivo del script de tienda. Para cambiar un script ya instalado en Tiendanube se debe publicar una nueva versión de ese archivo desde el Portal de Socios; desplegar el panel no reemplaza por sí solo una versión instalada.

### Publicación masiva y edición del catálogo

El diálogo tiene dos modos:

- **Publicar inventario**: respeta la selección de la pantalla de inventario
  (o su filtro si no hay selección). **Publicación masiva** permite marcar
  fichas listas y crear o actualizar esos productos, publicados u ocultos.
  La vista previa muestra la acción, el precio y los datos pendientes. Los
  envíos son secuenciales, informan cada resultado y permiten detenerse
  después del producto actual. Los éxitos salen de la selección pendiente.
  Actualizar desde inventario reemplaza también el stock local en Tiendanube;
  mantiene las restricciones y recuperación de IDs del envío individual.
- **Editar catálogo de Tiendanube**: consulta el catálogo real, incluidos los
  productos sin vínculo con inventario. Permite seleccionar uno o varios
  (hasta 100, con páginas de 30) y cambiar campos concretos: nombre completo,
  prefijo, sufijo o reemplazo; precio de lista fijo o porcentaje por variante;
  categoría, marca, peso, descripción o visibilidad. Fotos, stock y atributos
  de variantes se preservan. Los precios promocionales solo se quitan cuando
  se elige ese campo. Reemplazar la descripción completa es opcional y avisa
  que también reemplaza la tabla de talles de ese texto.

La edición directa del catálogo toma Tiendanube como fuente. No modifica
costos, precios objetivo ni fichas del inventario local. Volver a publicar
un artículo vinculado desde inventario enviará los datos de esa ficha.

Ambos modos exigen vista previa y confirmación explícita. El catálogo verifica
la tienda y una huella del producto antes de iniciar. La API no ofrece una
transacción remota ni una actualización condicional atómica; un cambio externo
entre la última lectura y el PUT sigue siendo una limitación de esa API.
Las modificaciones parciales se guardan como objetivos absolutos en
`tiendanube_catalog_jobs`. Un reintento con el mismo ID recupera esos objetivos
sin volver a calcular un porcentaje sobre un precio ya aumentado. Se aceptan
solo los campos anteriores o los ya aplicados por el lote; otros cambios
requieren una nueva revisión. La cola del catálogo se recupera desde
sessionStorage después de recargar la misma pestaña. **Nueva edición** consulta
otra vez los datos y comienza con nuevas versiones.

Los bloqueos por producto de PostgreSQL evitan cruces entre el envío desde
inventario y la edición del catálogo. Los errores de autorización, límites de
API o indisponibilidad detienen el lote para no repetir la misma falla sobre
todos los artículos. Cada producto tiene su propio resultado; los éxitos no
se revierten si falla otro artículo. Mantener la pantalla abierta durante la
publicación desde inventario; se pueden reintentar solo pendientes y fallidos.

Validación: `tests/store-catalog.test.ts` cubre cambios acotados, precios por
variante, respuesta perdida, reintentos, versiones, tienda y permisos.
`node tests/tiendanube-bulk-ui.mjs` prueba publicación, fallos parciales y
recuperación del catálogo tras recarga en escritorio y móvil con servicios
simulados. Estas pruebas no publican ni modifican productos reales.

Cada envío pide revisar y confirmar un producto. **Guardar oculto** también oculta un producto ya publicado. **Publicar producto / Actualizar y publicar** lo hace visible cuando todas las operaciones terminan. Durante la actualización queda oculto; si una operación falla, puede conservar cambios parciales y se debe revisar y reintentar. La fecha mostrada corresponde al último envío completo; el estado de visibilidad corresponde al último confirmado por la API, no a una consulta en vivo de la tienda.

La tabla `tiendanube_links` vincula tienda e ítem con el ID remoto. Las actualizaciones conservan ese ID y el identificador de URL. Un bloqueo de PostgreSQL impide dos envíos simultáneos del mismo ítem. Un identificador de URL estable permite recuperar una creación con respuesta perdida. Si el SKU principal ya existe en la tienda, se guarda el vínculo encontrado y se exige actualizar la vista previa antes de modificarlo. Revisar productos importados previamente sin SKU: no es posible reconocer automáticamente que representan el mismo producto. Los SKU compartidos entre ítems se bloquean.

Los talles se emparejan por sus valores, conservando el ID remoto aunque cambie el SKU. Los talles retirados quedan con stock cero. Cambiar los nombres o la cantidad de atributos requiere revisar la estructura en la tienda; esta versión bloquea esa actualización para no reemplazar variantes por error. Cada ítem representa un producto; el color proviene del campo de variante y los talles de su lista existente.

Las fotos se suben por `attachment` o URL HTTPS. Se registran sus IDs para reordenarlas y retirar las fotos quitadas del panel. Las fotos agregadas por fuera de este panel se conservan. Las descripciones se envían como texto escapado a HTML; las notas internas no se exportan, incluidos los productos antiguos. Si usabas notas como texto de venta, copialas a Descripción pública. La exportación CSV usa descripción, categoría, peso y ajustes de precio de la ficha si existe; los valores generales del diálogo se usan como respaldo para los productos antiguos. El CSV continúa sin incluir fotos y omite los ítems sin stock según el flujo anterior.

## Verificación del desarrollo

`npx tsx --test tests/photos.test.ts tests/tiendanube.test.ts tests/publicidad.test.ts tests/store-connection.test.ts` verifica normalización de fotos, márgenes, transparencia, validaciones, protección de enlaces, separación de notas, cálculo de precios, permisos, cifrado, estado OAuth, dominio autorizado, creación y recuperación de IDs remotos con servicios simulados. Con el servidor en el puerto 3001, `node tests/tiendanube-ui.mjs` verifica la galería y el envío y `node tests/tiendanube-connection-ui.mjs` verifica el formulario de conexión y el regreso al inventario, en escritorio y móvil. Ninguno escribe en servicios reales. `npm run build` valida la compilación. El comando de lint preexistente no funciona porque falta `eslint.config.*` en el proyecto.

## Stock y precios

La sincronización es **manual y del panel hacia Tiendanube**. No recibe pedidos, ventas ni cambios de stock mediante webhooks. Revisar las ventas recientes antes de enviar: el stock local reemplaza el stock del depósito configurado. No activar envíos automáticos hasta implementar la recepción de pedidos y acordar la fuente de verdad del stock.

El precio publicado se calcula con el descuento por transferencia y el redondeo guardados en cada ficha. El descuento debe configurarse también en Tiendanube; no se modifica desde este panel. Al actualizar las variantes se borra el precio promocional para que coincida el precio mostrado en la vista previa.

La integración usa la versión `2025-03` de la API. No se realizaron publicaciones reales como parte del desarrollo. La validación final necesita las credenciales y un producto de prueba de la tienda.

Referencias oficiales: [productos](https://tiendanube.github.io/api-documentation/resources/product), [variantes](https://tiendanube.github.io/api-documentation/resources/product-variant), [fotos](https://tiendanube.github.io/api-documentation/resources/product-image) y [autenticación](https://tiendanube.dev/docs-api/getting-started).
