import path from "path";
import fs from "fs";

// Cargar variables de entorno desde .env.local automáticamente
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

async function main() {
  console.log("=========================================");
  console.log("🚀 CSSBuy Sync — Sincronizador Local");
  console.log("=========================================");
  console.log(`📡 Base de datos destino: ${process.env.PGHOST || "localhost"}:${process.env.PGPORT || "5432"}/${process.env.PGDATABASE || "default"}`);
  console.log(`👤 Usuario CSSBuy: ${process.env.CSSBUY_USER || "(no configurado)"}\n`);

  if (!process.env.CSSBUY_USER || !process.env.CSSBUY_PASS) {
    console.error("❌ Error: Faltan CSSBUY_USER y CSSBUY_PASS en .env.local");
    process.exit(1);
  }

  if (!process.env.PGHOST || !process.env.PGUSER || !process.env.PGDATABASE) {
    console.error("❌ Error: Faltan credenciales de PostgreSQL (PGHOST, PGUSER, PGDATABASE) en .env.local");
    process.exit(1);
  }

  const { syncCssbuyOrders } = await import("../src/lib/cssbuy-sync");

  const log = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] ${msg}`);
  };

  try {
    const result = await syncCssbuyOrders({}, log);
    console.log("\n=========================================");
    console.log(`🎉 ${result.message}`);
    console.log(`📊 Total en DB: ${result.total} | Nuevas: ${result.inserted} | Actualizadas: ${result.updated}`);
    console.log("=========================================\n");
    process.exit(0);
  } catch (error: any) {
    console.error("\n❌ Error durante la sincronización:", error.message || error);
    process.exit(1);
  }
}

main();
