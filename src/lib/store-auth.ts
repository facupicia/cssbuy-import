import { NextResponse } from "next/server";
import { isReportingOrigin, PRIVATE_HEADERS } from "./integration-auth";

import { storeAuthenticated } from "./admin-session";
export { storeAuthenticated } from "./admin-session";
export async function storeGuard(request: Request) {
  if (request.method !== "GET" && !isReportingOrigin(request)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: PRIVATE_HEADERS });
  try {
    if (!await storeAuthenticated(request)) return NextResponse.json({ error: "Iniciá sesión con tu cuenta para continuar" }, { status: 401, headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ error: "No se pudo comprobar tu sesión. Reintentá en unos instantes." }, { status: 503, headers: PRIVATE_HEADERS });
  }
  return null;
}
export async function readStoreJson(request: Request, max = 8192) {
  if (Number(request.headers.get("content-length") || 0) > max) throw new Error("Solicitud demasiado grande");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Solicitud vacía");
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > max) { await reader.cancel(); throw new Error("Solicitud demasiado grande"); }
    parts.push(chunk.value);
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8")) as Record<string, unknown>;
}
