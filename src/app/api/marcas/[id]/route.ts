import { NextResponse } from "next/server";
import { isPgConfigured, updateMarca, deleteMarca } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_DB = { error: "Postgres no configurado." };

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPgConfigured()) return NextResponse.json(NO_DB, { status: 500 });
  try {
    const body = await request.json();
    const marca = await updateMarca(id, {
      nombre: typeof body?.nombre === "string" ? body.nombre : undefined,
      activa: typeof body?.activa === "boolean" ? body.activa : undefined,
    });
    if (!marca) return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
    return NextResponse.json({ marca });
  } catch (err) {
    // El índice único es case-insensitive: dos marcas no pueden llamarse igual.
    if ((err as { code?: string })?.code === "23505") {
      return NextResponse.json({ error: "Ya existe una marca con ese nombre" }, { status: 409 });
    }
    console.error("Error actualizando marca:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}

/** Borra la marca; los productos que la tenían quedan sin marca (FK ON DELETE SET NULL). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPgConfigured()) return NextResponse.json(NO_DB, { status: 500 });
  try {
    const borrada = await deleteMarca(id);
    return NextResponse.json({ success: true, deleted: borrada });
  } catch (err) {
    console.error("Error borrando marca:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}
