# CSSBuy Landed Cost Calculator & Cotizaciones

Aplicación web independiente y moderna para el cálculo de costos de importación (landed cost), prorrateo de flete por peso, aduana / franquicias, y cotizador de productos para CSSBuy.

## Características

- 🧮 **Calculadora Multiproducto de Landed Cost**: Simulación en tiempo real de flete internacional, comisiones de depósito de CSSBuy (5.3%), franquicia aduanera de USD 50, aranceles, IVA e IIBB.
- 📦 **Scraper de CSSBuy Warehouse**: Script en un clic para extraer todos los pedidos almacenados y descargarlos en `orders.json`.
- 💳 **Costos desde movimientos CSSBuy**: La calculadora puede importar `records.json` para calcular el costo real por orden, incluyendo fotos, servicios adicionales y flete interno.
- 🔄 **Conector CSSBuy → Postgres**: sincronización manual desde la sesión de Chrome mediante el conector PLUG. Trae pedidos válidos, pesos, fotos y movimientos sin copiar credenciales de CSSBuy al servidor. Ver [instalación](docs/cssbuy.md).
- 📋 **Gestión de Cotizaciones**: Guardado en la nube (vía Supabase) y/o persistencia local con LocalStorage, con exportación a CSV y JSON.
- 🎨 **Diseño Moderno & Modo Oscuro**: Interfaz limpia, responsiva, con paleta cálida y soporte para modo oscuro.

## Instalación y Ejecución

```bash
# 1. Instalar dependencias
npm install
# o con pnpm:
pnpm install

# 2. Iniciar servidor de desarrollo (puerto 3001)
npm run dev
```

La app estará disponible en [http://localhost:3001](http://localhost:3001).

## Cuenta de usuario

El panel requiere iniciar sesión. En el primer ingreso creá tu cuenta con email y contraseña usando la clave de administración actual una sola vez. Podés recordar la sesión por 30 días, cambiar tu contraseña y cerrar sesiones de otros dispositivos desde Configuración. Conservá `ADMIN_PASSWORD` en el servidor: sigue protegiendo la conexión con Tiendanube.

Ver [alta inicial, configuración, sesiones y recuperación](docs/usuarios.md).

## Conexión con CSSBuy desde Chrome

El botón **Sincronizar órdenes** usa el conector de Chrome para traer pedidos,
pesos, fotos y movimientos a PostgreSQL. Ver [instalación y límites](docs/cssbuy.md).
Este flujo reemplaza el acceso directo del servidor, bloqueado por CSSBuy.

## Productos y Tiendanube

El inventario incluye ficha pública, galería de fotos, validaciones, vista previa y envío manual a Tiendanube. Ver [configuración, flujo de publicación y límites del stock](docs/tiendanube.md).

## Publicidad y rentabilidad

El panel `/publicidad` consulta Meta y calcula límites de adquisición con el inventario. Requiere configuración privada en el servidor; no atribuye las ventas acumuladas a campañas. Ver [configuración, API de lectura y límites del análisis](docs/publicidad.md).

## Variables de Entorno (Opcionales)

Para sincronizar las cotizaciones con Supabase, creá un archivo `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
```

*Supabase es opcional para cotizaciones. El acceso al panel requiere PostgreSQL y la configuración de autenticación indicada arriba.*

### Sincronizador local anterior (opcional)

El botón del panel usa el conector de Chrome. El comando local `npm run sync` anterior puede seguir configurándose con estas variables; depende del acceso que permita CSSBuy y no funciona desde el contenedor actual:

```env
# CSSBuy
CSSBUY_USER=tu-usuario-de-cssbuy
CSSBUY_PASS=tu-contraseña-de-cssbuy

# PostgreSQL propio (se guarda en la tabla cssbuy_orders de la base cssbuy_products)
PGHOST=ip-de-tu-server
PGPORT=5432
PGUSER=tu-usuario
PGPASSWORD=tu-contraseña
PGDATABASE=cssbuy_products
```

Al primer `Sync CSSBuy` se abre un navegador para resolver el captcha de CSSBuy; la sesión queda guardada en `.cssbuy-session.json` (ya ignorado por git) para las próximas corridas.

## Deploy automático en el server

El server se actualiza solo cuando hay commits nuevos en `main`: cron corre
`scripts/auto-deploy.sh` cada 2 minutos, y si `main` cambió hace `git pull` y
`docker compose up -d --build`. No hace falta abrir ningún puerto a internet.

Se configura una sola vez, en el server, desde la carpeta del proyecto:

```bash
git pull origin main
(crontab -l 2>/dev/null; echo "*/2 * * * * bash $(pwd)/scripts/auto-deploy.sh >> $HOME/auto-deploy.log 2>&1") | crontab -
```

Para ver qué hizo: `tail -f ~/auto-deploy.log`. Si un build falla, el sitio sigue
con la versión anterior y se reintenta con el próximo commit. Si alguien cambia
archivos a mano en el server, el pull se frena y lo avisa en el log.
