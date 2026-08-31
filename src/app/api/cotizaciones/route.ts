import { NextResponse } from "next/server";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  isPgConfigured,
  getCotizaciones,
  insertCotizacion,
  CotizacionRow,
} from "@/lib/db";
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

/**
 * Orden de preferencia del almacenamiento:
 *   1) Postgres propio (PGHOST/...), que es donde ya viven las órdenes
 *   2) Supabase, si está configurado
 *   3) localStorage del navegador (el cliente hace el fallback)
 */
export async function GET() {
  if (isPgConfigured()) {
    try {
      const rows = await getCotizaciones();
      return NextResponse.json({ cotizaciones: rows.map(mapPgRow), mode: "postgres" });
    } catch (err) {
      console.error("Error leyendo cotizaciones de Postgres:", err);
      return NextResponse.json(
        {
          cotizaciones: [],
          mode: "error",
          error: err instanceof Error ? err.message : "Error de base de datos",
        },
        { status: 500 }
      );
    }
  }

  if (isSupabaseConfigured && supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin
        .from("shop_cotizaciones")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching cotizaciones:", error);
        return NextResponse.json({ error: error.message, cotizaciones: [] }, { status: 500 });
      }

      return NextResponse.json({
        cotizaciones: (data || []).map((row) => mapSupabaseRow(row as ShopCotizacion)),
        mode: "supabase",
      });
    } catch (err) {
      console.error("Unexpected error:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Error", cotizaciones: [] },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    cotizaciones: [],
    mode: "local_only",
    message: "Sin base de datos configurada, se usa el almacenamiento local del navegador.",
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { nombre, fx, envio, aduana, productos, resultados } = body;

    if (!nombre || !fx || !envio || !aduana || !productos || !resultados) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    if (isPgConfigured()) {
      const row = await insertCotizacion({ nombre, fx, envio, aduana, productos, resultados });
      return NextResponse.json({ cotizacion: mapPgRow(row), mode: "postgres" });
    }

    if (isSupabaseConfigured && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from("shop_cotizaciones")
        .insert({ nombre, fx, envio, aduana, productos, resultados })
        .select()
        .single();

      if (error) {
        console.error("Error saving cotizacion:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        cotizacion: mapSupabaseRow(data as ShopCotizacion),
        mode: "supabase",
      });
    }

    // Sin base: el cliente igual la persiste en localStorage
    const local: Cotizacion = {
      id: "local-" + Date.now(),
      fecha: new Date().toISOString(),
      nombre,
      fx,
      envio,
      aduana,
      productos,
      resultados,
    };
    return NextResponse.json({ cotizacion: local, mode: "local_only" });
  } catch (err) {
    console.error("Error guardando cotización:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}
