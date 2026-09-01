import { NextResponse } from "next/server";
import { isPgConfigured, getInventoryItems, insertInventoryItem } from "@/lib/db";
import { sanitizeInventoryInput, suggestEstado } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_DB = {
  error:
    "Postgres no configurado. Completá PGHOST/PGUSER/PGPASSWORD/PGDATABASE en .env.local para usar el inventario.",
};

export async function GET() {
  if (!isPgConfigured()) {
    return NextResponse.json({ ...NO_DB, items: [] }, { status: 500 });
  }
  try {
    const items = await getInventoryItems();
    return NextResponse.json({ items });
  } catch (err) {
    console.error("Error leyendo inventario:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error de base de datos", items: [] },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!isPgConfigured()) {
    return NextResponse.json(NO_DB, { status: 500 });
  }
  try {
    const body = await request.json();

    // Alta múltiple (importación desde CSSBuy / cotizaciones)
    const list = Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : null;
    if (list) {
      const created = [];
      for (const raw of list) {
        const input = sanitizeInventoryInput(raw ?? {});
        if (!input.nombre) continue;
        input.cantidadInicial ??= 0;
        input.cantidadVendida ??= 0;
        input.estado ??= suggestEstado(input.cantidadInicial, input.cantidadVendida);
        input.origen ??= "manual";
        created.push(await insertInventoryItem(input));
      }
      return NextResponse.json({ items: created, count: created.length });
    }

    const input = sanitizeInventoryInput(body ?? {});
    if (!input.nombre) {
      return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    }
    input.cantidadInicial ??= 0;
    input.cantidadVendida ??= 0;
    input.estado ??= suggestEstado(input.cantidadInicial, input.cantidadVendida);
    input.origen ??= "manual";

    const item = await insertInventoryItem(input);
    return NextResponse.json({ item });
  } catch (err) {
    console.error("Error creando ítem de inventario:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}
