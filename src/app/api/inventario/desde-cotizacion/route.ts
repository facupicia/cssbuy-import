import { NextResponse } from "next/server";
import {
  isPgConfigured,
  getInventoryItems,
  getCotizaciones,
  applyInventoryPrices,
} from "@/lib/db";
import { planificarSync, cambiosAAplicar } from "@/lib/inventory-sync";
import { Cotizacion } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_DB = { error: "Postgres no configurado." };

/** Las filas de la tabla vienen con created_at; la lib trabaja con `fecha`. */
async function leerCotizaciones(): Promise<Cotizacion[]> {
  const rows = await getCotizaciones();
  return rows.map((r) => ({
    id: r.id,
    fecha: new Date(r.created_at).toISOString(),
    nombre: r.nombre,
    fx: r.fx,
    envio: r.envio,
    aduana: r.aduana,
    productos: r.productos,
    resultados: r.resultados,
  }));
}

/** Previsualiza qué cambiaría, sin tocar nada. */
export async function GET() {
  if (!isPgConfigured()) return NextResponse.json({ ...NO_DB, diffs: [] }, { status: 500 });
  try {
    const [items, cotizaciones] = await Promise.all([getInventoryItems(), leerCotizaciones()]);
    const plan = planificarSync(items, cotizaciones);
    return NextResponse.json({
      ...plan,
      cambian: plan.diffs.filter((d) => d.cambia).length,
      cotizaciones: cotizaciones.length,
    });
  } catch (err) {
    console.error("Error planificando el sync desde cotizaciones:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error", diffs: [] },
      { status: 500 }
    );
  }
}

/** Aplica los cambios. Opcionalmente acotado a `ids`. */
export async function POST(request: Request) {
  if (!isPgConfigured()) return NextResponse.json(NO_DB, { status: 500 });
  try {
    const body = await request.json().catch(() => ({}));
    const soloIds: string[] | null = Array.isArray(body?.ids) ? body.ids : null;

    const [items, cotizaciones] = await Promise.all([getInventoryItems(), leerCotizaciones()]);
    const objetivo = soloIds ? items.filter((i) => soloIds.includes(i.id)) : items;

    const plan = planificarSync(objetivo, cotizaciones);
    const cambios = cambiosAAplicar(plan);

    if (cambios.length === 0) {
      return NextResponse.json({ actualizados: 0, message: "Ya estaba todo al día" });
    }

    const actualizados = await applyInventoryPrices(cambios);
    return NextResponse.json({ actualizados, items: actualizados });
  } catch (err) {
    console.error("Error aplicando precios desde cotizaciones:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}
