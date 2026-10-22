import { deferInventoryMedia } from "@/lib/inventory-media";
import { PRIVATE_HEADERS } from "@/lib/integration-auth";
import { storeGuard } from "@/lib/store-auth";
import { NextResponse } from "next/server";
import {
  isPgConfigured,
  getInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
} from "@/lib/db";
import { sanitizeInventoryInput } from "@/lib/inventory";
import { readStoreJson } from "@/lib/store-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_DB = { error: "Postgres no configurado para el inventario." };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await storeGuard(request); if (denied) return denied;
  const { id } = await params;
  if (!isPgConfigured()) return NextResponse.json(NO_DB, { status: 500 });
  try {
    const item = await getInventoryItem(id);
    if (!item) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ item }, { headers: PRIVATE_HEADERS });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await storeGuard(request); if (denied) return denied;
  const { id } = await params;
  if (!isPgConfigured()) return NextResponse.json(NO_DB, { status: 500 });
  try {
    let input;
    try { input = sanitizeInventoryInput(await readStoreJson(request, 7 * 1024 * 1024)); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Solicitud inválida" }, { status: 400 }); }
    if (Object.keys(input).length === 0) {
      return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
    }
    const item = await updateInventoryItem(id, input);
    if (!item) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ item: deferInventoryMedia(item) }, { headers: PRIVATE_HEADERS });
  } catch (err) {
    console.error("Error actualizando ítem de inventario:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await storeGuard(request); if (denied) return denied;
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
