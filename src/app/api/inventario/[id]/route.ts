import { NextResponse } from "next/server";
import {
  isPgConfigured,
  getInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
} from "@/lib/db";
import { sanitizeInventoryInput } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_DB = { error: "Postgres no configurado para el inventario." };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPgConfigured()) return NextResponse.json(NO_DB, { status: 500 });
  try {
    const item = await getInventoryItem(id);
    if (!item) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ item });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPgConfigured()) return NextResponse.json(NO_DB, { status: 500 });
  try {
    const body = await request.json();
    const input = sanitizeInventoryInput(body ?? {});
    if (Object.keys(input).length === 0) {
      return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
    }
    const item = await updateInventoryItem(id, input);
    if (!item) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ item });
  } catch (err) {
    console.error("Error actualizando ítem de inventario:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPgConfigured()) return NextResponse.json(NO_DB, { status: 500 });
  try {
    const deleted = await deleteInventoryItem(id);
    return NextResponse.json({ success: true, deleted });
  } catch (err) {
    console.error("Error borrando ítem de inventario:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}
