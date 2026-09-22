# CSSBuy Landed Cost Calculator & Cotizaciones

Aplicación web independiente y moderna para el cálculo de costos de importación (landed cost), prorrateo de flete por peso, aduana / franquicias, y cotizador de productos para CSSBuy.

## Características

- 🧮 **Calculadora Multiproducto de Landed Cost**: Simulación en tiempo real de flete internacional, comisiones de depósito de CSSBuy (5.3%), franquicia aduanera de USD 50, aranceles, IVA e IIBB.
- 📦 **Scraper de CSSBuy Warehouse**: Script en un clic para extraer todos los pedidos almacenados y descargarlos en `orders.json`.
- 💳 **Balance Records Analyzer**: Parser inteligente de transacciones financieras de CSSBuy (`records.json`) para conocer el costo real por orden incluyendo fotos, servicios adicionales y flete interno.
- 🔄 **Sync automático a Postgres (CSSBuy → tu BD)**: Botón **"Sync CSSBuy"** que inicia sesión en `cssbuy.com` con tus credenciales y vuelca en la tabla `cssbuy_orders` de tu base Postgres propia (base `cssbuy_products`) **solo las órdenes en estado "en almacén" (In Warehouse, `state === 4`)** de `https://www.cssbuy.com/shop/cate/order`. Las demás (submitidas, pendientes, inválidas) se descartan para mantener la tabla enfocada en lo que está en el depósito. La primera vez puede pedir captcha (se abre el navegador para que lo resuelvas); luego reusa la sesión guardada para correr de forma automática (headless). Idempotente: re-sincronizar actualiza las órdenes existentes y elimina las que ya no están en almacén.
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

## Variables de Entorno (Opcionales)

Para sincronizar las cotizaciones con Supabase, creá un archivo `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
```

*Si no configurás Supabase, la aplicación funciona al 100% en modo LocalStorage / Offline.*

### Sync automático de órdenes CSSBuy → Postgres

Para usar el botón **"Sync CSSBuy"**, agregá al `.env.local` tus credenciales de CSSBuy y los datos de tu base Postgres:

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
