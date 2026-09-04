import { NextResponse } from "next/server";
import { isPgConfigured, getMarcas, insertMarca, contarItemsPorMarca } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_DB = { error: "Postgres no configurado." };

export async function GET() {
  if (!isPgConfigured()) return NextResponse.json({ ...NO_DB, marcas: [] }, { status: 500 });
  try {
    const [marcas, conteo] = await Promise.all([getMarcas(), contarItemsPorMarca()]);
    return NextResponse.json({
      marcas: marcas.map((m) => ({ ...m, items: conteo[m.id] ?? 0 })),
    });
  } catch (err) {
    console.error("Error leyendo marcas:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error", marcas: [] },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!isPgConfigured()) return NextResponse.json(NO_DB, { status: 500 });
  try {
    const body = await request.json();

    // Alta múltiple, para cargar varias marcas de una
    const lista: string[] | null = Array.isArray(body?.nombres) ? body.nombres : null;
    if (lista) {
      const creadas = [];
      for (const n of lista) {
        const nombre = String(n ?? "").trim();
        if (nombre) creadas.push(await insertMarca(nombre));
      }
      return NextResponse.json({ marcas: creadas, count: creadas.length });
    }

    const nombre = String(body?.nombre ?? "").trim();
    if (!nombre) {
      return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    }
    if (nombre.length > 60) {
      return NextResponse.json({ error: "El nombre es demasiado largo" }, { status: 400 });
    }

    const marca = await insertMarca(nombre);
    return NextResponse.json({ marca });
  } catch (err) {
    console.error("Error creando marca:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}
