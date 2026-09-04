import { NextResponse } from "next/server";
import { isPgConfigured, bulkUpdateInventory, bulkDeleteInventory } from "@/lib/db";
import { sanitizeInventoryInput, type BulkPriceOp, type BulkTextOp } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_DB = { error: "Postgres no configurado para el inventario." };

/**
 * Edición masiva. El cuerpo trae los ids y una de dos cosas:
 *   - `patch`: campos fijos a aplicar igual a todos (estado, ubicación…)
 *   - `precio`: una operación relativa sobre el precio de cada ítem
 *     (porcentaje, markup sobre el costo, o valor fijo)
 *
 * La operación de precio se resuelve en SQL por ítem, porque depende del
 * costo de cada fila y no se puede expresar como un valor único.
 */
export async function PATCH(request: Request) {
  if (!isPgConfigured()) return NextResponse.json(NO_DB, { status: 500 });

  try {
    const body = await request.json();
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "No se recibió ningún ítem" }, { status: 400 });
    }
    if (ids.length > 500) {
      return NextResponse.json(
        { error: "Demasiados ítems en una sola operación (máx. 500)" },
        { status: 400 }
      );
    }

    const patch = body?.patch ? sanitizeInventoryInput(body.patch) : {};
    const precio: BulkPriceOp | undefined = body?.precio;
    const textos: BulkTextOp[] = Array.isArray(body?.textos) ? body.textos : [];

    if (Object.keys(patch).length === 0 && !precio && textos.length === 0) {
      return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
    }

    const items = await bulkUpdateInventory(ids, patch, precio, textos);
    return NextResponse.json({ items, count: items.length });
  } catch (err) {
    console.error("Error en edición masiva de inventario:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!isPgConfigured()) return NextResponse.json(NO_DB, { status: 500 });

  try {
    const body = await request.json();
    if (body?.action !== "delete") {
      return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
    }
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "No se recibió ningún ítem" }, { status: 400 });
    }

    const borrados = await bulkDeleteInventory(ids);
    return NextResponse.json({ success: true, deleted: borrados });
  } catch (err) {
    console.error("Error en borrado masivo de inventario:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}
