import { NextResponse } from "next/server";
import {
  isPgConfigured,
  getInventoryItems,
  getMarcas,
  applyInventorySkus,
} from "@/lib/db";
import { generarSkusLote } from "@/lib/sku";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_DB = { error: "Postgres no configurado." };

/**
 * Genera SKUs y los guarda.
 *
 * Se genera acá y no en el cliente para que el correlativo vea TODOS los SKUs
 * de la base, no solo los de los ítems que están filtrados en pantalla: si no,
 * dos productos fuera de la vista podrían terminar con el mismo.
 *
 * Body: { ids?: string[], sobrescribir?: boolean, preview?: boolean }
 *   - ids: acota a esos ítems; sin ids, va sobre todo el inventario.
 *   - sobrescribir: si false (por defecto) respeta los SKUs ya cargados.
 *   - preview: calcula y devuelve sin escribir.
 */
export async function POST(request: Request) {
  if (!isPgConfigured()) return NextResponse.json(NO_DB, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const ids: string[] | null = Array.isArray(body?.ids) ? body.ids : null;
    const sobrescribir = body?.sobrescribir === true;
    const preview = body?.preview === true;

    const [todos, marcas] = await Promise.all([getInventoryItems(), getMarcas()]);
    const nombreDeMarca = Object.fromEntries(marcas.map((m) => [m.id, m.nombre]));

    // El lote se calcula sobre el inventario completo para que el correlativo y
    // la detección de repetidos tengan en cuenta todo lo que ya existe.
    const objetivo = ids ? new Set(ids) : null;
    const asignaciones = generarSkusLote(todos, { nombreDeMarca, sobrescribir }).filter(
      (a) => !objetivo || objetivo.has(a.id)
    );

    if (asignaciones.length === 0) {
      return NextResponse.json({
        asignaciones: [],
        actualizados: 0,
        message: sobrescribir
          ? "No hay ítems para generar"
          : "Todos los ítems seleccionados ya tienen SKU",
      });
    }

    if (preview) {
      return NextResponse.json({ asignaciones, actualizados: 0, preview: true });
    }

    const actualizados = await applyInventorySkus(asignaciones);
    return NextResponse.json({ asignaciones, actualizados });
  } catch (err) {
    console.error("Error generando SKUs:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}
