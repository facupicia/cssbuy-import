import { randomUUID } from "node:crypto";
import { getPool } from "./db";
import type { Supplier, SupplierInput } from "./suppliers";

let schema: Promise<unknown> | undefined;
async function ensure() {
  schema ??= getPool().query(`CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY, nombre TEXT NOT NULL, tipo TEXT NOT NULL CHECK(tipo IN ('vendedor','fabrica')),
    categoria TEXT NOT NULL DEFAULT '', tienda_url TEXT NOT NULL DEFAULT '', referencia_url TEXT NOT NULL DEFAULT '',
    contacto TEXT NOT NULL DEFAULT '', notas TEXT NOT NULL DEFAULT '', favorito BOOLEAN NOT NULL DEFAULT false,
    version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`).then(() => getPool().query(`CREATE UNIQUE INDEX IF NOT EXISTS suppliers_store_url_idx ON suppliers(tienda_url) WHERE tienda_url <> ''`)).catch(e => { schema = undefined; throw e; });
  await schema;
}
function supplier(row: Record<string, any>): Supplier {
  return { id: row.id, nombre: row.nombre, tipo: row.tipo, categoria: row.categoria, tiendaUrl: row.tienda_url, referenciaUrl: row.referencia_url, contacto: row.contacto, notas: row.notas, favorito: row.favorito, version: row.version, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() };
}
const values = (input: SupplierInput) => [input.nombre, input.tipo, input.categoria, input.tiendaUrl, input.referenciaUrl, input.contacto, input.notas, input.favorito];
export async function readSuppliers() {
  await ensure();
  const result = await getPool().query("SELECT * FROM suppliers ORDER BY favorito DESC, lower(nombre), id");
  return result.rows.map(supplier);
}
export async function createSupplier(input: SupplierInput) {
  await ensure();
  const result = await getPool().query(`INSERT INTO suppliers(nombre,tipo,categoria,tienda_url,referencia_url,contacto,notas,favorito,id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [...values(input), randomUUID()]);
  return supplier(result.rows[0]);
}
export async function updateSupplier(id: string, version: number, input: SupplierInput) {
  await ensure();
  const result = await getPool().query(`UPDATE suppliers SET nombre=$1,tipo=$2,categoria=$3,tienda_url=$4,referencia_url=$5,contacto=$6,notas=$7,favorito=$8,version=version+1,updated_at=now() WHERE id=$9 AND version=$10 RETURNING *`, [...values(input), id, version]);
  return result.rows.length ? supplier(result.rows[0]) : null;
}
export async function deleteSupplier(id: string, version: number) {
  await ensure();
  const result = await getPool().query("DELETE FROM suppliers WHERE id=$1 AND version=$2 RETURNING id", [id, version]);
  return Boolean(result.rowCount);
}
