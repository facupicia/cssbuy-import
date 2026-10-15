# Productos y Tiendanube

En `/inventario`, **Agregar / Editar ítem → Ficha para la tienda** permite guardar una descripción pública independiente de las notas internas, hasta nueve fotos, categoría, peso y ajustes de precio. La primera foto es la portada; **Antes** cambia el orden. Las fotos se guardan como JPEG en PostgreSQL junto con la ficha. No dependen del disco efímero de Docker. Para catálogos grandes conviene migrarlas a almacenamiento de objetos, porque hoy se leen con el inventario.

## Fotos uniformes antes de importar

El formato del catálogo es **1280 × 1280 px**. Las fotos se centran manteniendo sus proporciones; los espacios restantes quedan blancos. No se recorta el producto, no se estira y no se elimina el fondo original. Las transparencias se convierten a blanco y se corrige la orientación de las fotos al decodificarlas. Es la recomendación para imágenes cuadradas de [Tiendanube Argentina](https://ayuda.tiendanube.com/es_AR/fotos-del-producto/como-adaptar-el-tamano-de-las-imagenes-de-mis-productos).

Se pueden seleccionar varias fotos JPG, PNG o WebP juntas desde el equipo y seguir agregando fotos en otra tanda, hasta nueve por producto. Cada archivo admite hasta 12 MB y 40 megapíxeles; se comprime ajustando la calidad JPEG para que su representación guardada no supere 700.000 caracteres. Las imágenes pequeñas se amplían al tamaño uniforme con un aviso de nitidez: no se inventa detalle adicional.

Las fotos nuevas, incluidas las agregadas por enlace HTTPS, se normalizan automáticamente. **Normalizar todas** adapta también las fotos existentes, como la imagen de un producto importado de CSSBuy. Las dimensiones de cada miniatura indican si ya tiene el tamaño uniforme. Si falla una foto durante la normalización del lote, la galería anterior queda intacta. **Guardar cambios** conserva la galería preparada; esta operación no envía ni publica productos en Tiendanube. Revisar las fotos antes del envío manual.

Los archivos del equipo se procesan en el navegador. Para enlaces, `/api/inventario/fotos/normalizar` descarga exclusivamente imágenes de sitios HTTPS públicos: valida DNS y cada redirección, fija la IP de la conexión, bloquea redes internas y limita tamaño, duración, cantidad de solicitudes y operaciones simultáneas. No requiere las credenciales de Tiendanube. Algunos sitios restringen descargas externas; en ese caso se puede subir el archivo desde el equipo.

En **Herramientas → Preparar y publicar productos** se revisan los productos seleccionados, o los filtrados si no hay selección. Se muestran precio publicado, SKU, stock por talle, validaciones y advertencias. La ficha se puede preparar sin credenciales de Tiendanube.

## Configuración privada

Crear o autorizar una aplicación para la tienda con permisos de lectura y escritura de productos, y lectura de categorías. Configurar en `.env.local` o en el servidor:

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

Cada envío pide revisar y confirmar un producto. **Guardar oculto** también oculta un producto ya publicado. **Publicar producto / Actualizar y publicar** lo hace visible cuando todas las operaciones terminan. Durante la actualización queda oculto; si una operación falla, puede conservar cambios parciales y se debe revisar y reintentar. La fecha mostrada corresponde al último envío completo; el estado de visibilidad corresponde al último confirmado por la API, no a una consulta en vivo de la tienda.

La tabla `tiendanube_links` vincula tienda e ítem con el ID remoto. Las actualizaciones conservan ese ID y el identificador de URL. Un bloqueo de PostgreSQL impide dos envíos simultáneos del mismo ítem. Un identificador de URL estable permite recuperar una creación con respuesta perdida. Si el SKU principal ya existe en la tienda, se guarda el vínculo encontrado y se exige actualizar la vista previa antes de modificarlo. Revisar productos importados previamente sin SKU: no es posible reconocer automáticamente que representan el mismo producto. Los SKU compartidos entre ítems se bloquean.

Los talles se emparejan por sus valores, conservando el ID remoto aunque cambie el SKU. Los talles retirados quedan con stock cero. Cambiar los nombres o la cantidad de atributos requiere revisar la estructura en la tienda; esta versión bloquea esa actualización para no reemplazar variantes por error. Cada ítem representa un producto; el color proviene del campo de variante y los talles de su lista existente.

Las fotos se suben por `attachment` o URL HTTPS. Se registran sus IDs para reordenarlas y retirar las fotos quitadas del panel. Las fotos agregadas por fuera de este panel se conservan. Las descripciones se envían como texto escapado a HTML; las notas internas no se exportan, incluidos los productos antiguos. Si usabas notas como texto de venta, copialas a Descripción pública. La exportación CSV usa descripción, categoría, peso y ajustes de precio de la ficha si existe; los valores generales del diálogo se usan como respaldo para los productos antiguos. El CSV continúa sin incluir fotos y omite los ítems sin stock según el flujo anterior.

## Verificación del desarrollo

`npx tsx --test tests/photos.test.ts tests/tiendanube.test.ts tests/publicidad.test.ts` verifica normalización de fotos, márgenes, transparencia, validaciones, protección de enlaces, separación de notas, cálculo de precios, permisos, creación y recuperación de IDs remotos con servicios simulados. Con el servidor en el puerto 3001, `node tests/tiendanube-ui.mjs` verifica escritorio y móvil, carga de varias fotos, dimensiones reales, recuperación de errores, edición y confirmación de envío sin escribir en servicios reales. `npm run build` valida la compilación. El comando de lint preexistente no funciona porque falta `eslint.config.*` en el proyecto.

## Stock y precios

La sincronización es **manual y del panel hacia Tiendanube**. No recibe pedidos, ventas ni cambios de stock mediante webhooks. Revisar las ventas recientes antes de enviar: el stock local reemplaza el stock del depósito configurado. No activar envíos automáticos hasta implementar la recepción de pedidos y acordar la fuente de verdad del stock.

El precio publicado se calcula con el descuento por transferencia y el redondeo guardados en cada ficha. El descuento debe configurarse también en Tiendanube; no se modifica desde este panel. Al actualizar las variantes se borra el precio promocional para que coincida el precio mostrado en la vista previa.

La integración usa la versión `2025-03` de la API. No se realizaron publicaciones reales como parte del desarrollo. La validación final necesita las credenciales y un producto de prueba de la tienda.

Referencias oficiales: [productos](https://tiendanube.github.io/api-documentation/resources/product), [variantes](https://tiendanube.github.io/api-documentation/resources/product-variant), [fotos](https://tiendanube.github.io/api-documentation/resources/product-image) y [autenticación](https://tiendanube.dev/docs-api/getting-started).
