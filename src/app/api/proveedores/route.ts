import { NextResponse } from "next/server";
import { PRIVATE_HEADERS } from "@/lib/integration-auth";
import { readStoreJson, storeGuard } from "@/lib/store-auth";
import { parseSupplier, supplierVersion } from "@/lib/suppliers";
import { createSupplier, deleteSupplier, readSuppliers, updateSupplier } from "@/lib/suppliers-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
export async function GET(request: Request) {
  const denied = await storeGuard(request); if (denied) return denied;
  try { return reply({ proveedores: await readSuppliers() }); }
  catch { return reply({ error: "No se pudo cargar la agenda. Reintentá en unos segundos." }, 503); }
}
async function write(request: Request) {
  const denied = await storeGuard(request); if (denied) return denied;
  let input, id = "", version = 0;
  try {
    const body = await readStoreJson(request, 32_000);
    if (request.method !== "DELETE") input = parseSupplier(body);
    if (request.method !== "POST") {
      if (typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) throw new Error("El proveedor no es válido. Recargá la agenda.");
      id = body.id; version = supplierVersion(body.version);
    }
  } catch(e) { return reply({ error: e instanceof Error ? e.message : "Revisá los datos del proveedor." }, 400); }
  try {
    if (request.method === "POST") return reply({ proveedor: await createSupplier(input!) }, 201);
    if (request.method === "PATCH") {
      const proveedor = await updateSupplier(id, version, input!);
      return proveedor ? reply({ proveedor }) : reply({ error: "Este proveedor cambió o fue eliminado desde otra pantalla. Copiá tus notas y recargá la agenda antes de continuar." }, 409);
    }
    return await deleteSupplier(id, version) ? reply({ ok: true }) : reply({ error: "Este proveedor cambió o ya fue eliminado. Actualizá la agenda antes de volver a intentar." }, 409);
  } catch(e) {
    if ((e as { code?: string }).code === "23505") return reply({ error: "Ya guardaste un proveedor con ese enlace de tienda. Buscalo en la agenda para editarlo." }, 409);
    return reply({ error: "No se pudo guardar el cambio. Tus datos siguen en el formulario; volvé a intentar." }, 503);
  }
}
export const POST = write;
export const PATCH = write;
export const DELETE = write;
