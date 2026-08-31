import { NextResponse } from "next/server";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isPgConfigured, getCotizacion, deleteCotizacion, CotizacionRow } from "@/lib/db";
import { ShopCotizacion, Cotizacion } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapSupabaseRow(row: ShopCotizacion): Cotizacion {
  return {
    id: row.id,
    fecha: row.created_at,
    nombre: row.nombre,
    fx: row.fx,
    envio: row.envio,
    aduana: row.aduana,
    productos: row.productos,
    resultados: row.resultados,
  };
}

function mapPgRow(row: CotizacionRow): Cotizacion {
  return {
    id: row.id,
    fecha: new Date(row.created_at).toISOString(),
    nombre: row.nombre,
    fx: row.fx,
    envio: row.envio,
    aduana: row.aduana,
    productos: row.productos,
    resultados: row.resultados,
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (isPgConfigured()) {
    try {
      const row = await getCotizacion(id);
      if (!row) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
      return NextResponse.json({ cotizacion: mapPgRow(row) });
    } catch (err) {
      console.error("Error leyendo cotización de Postgres:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Error" },
        { status: 500 }
      );
    }
  }

  if (isSupabaseConfigured && supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin
        .from("shop_cotizaciones")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error("Error fetching cotizacion:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ cotizacion: mapSupabaseRow(data as ShopCotizacion) });
    } catch (err) {
      console.error("Unexpected error:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Error" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "Sin base de datos configurada" }, { status: 404 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Las cotizaciones "local-…" solo viven en el navegador: no hay nada que borrar acá.
  if (id.startsWith("local-")) {
    return NextResponse.json({ success: true, mode: "local_only" });
  }

  if (isPgConfigured()) {
    try {
      const borrada = await deleteCotizacion(id);
      return NextResponse.json({ success: true, deleted: borrada, mode: "postgres" });
    } catch (err) {
      console.error("Error borrando cotización de Postgres:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Error" },
        { status: 500 }
      );
    }
  }

  if (isSupabaseConfigured && supabaseAdmin) {
    try {
      const { error } = await supabaseAdmin.from("shop_cotizaciones").delete().eq("id", id);
      if (error) {
        console.error("Error deleting cotizacion:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, mode: "supabase" });
    } catch (err) {
      console.error("Unexpected error:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Error" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ success: true, mode: "local_only" });
}
