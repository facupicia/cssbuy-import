import type { StoreProductProfile } from "./types";

export const DEFAULT_TRANSFER_DISCOUNT_PCT = 10;

export function newStoreProfile(): StoreProductProfile {
  return { descripcion: "", categoria: "", categoriaId: null, fotos: [],
    pesoKg: 0, descuentoPct: DEFAULT_TRANSFER_DISCOUNT_PCT, redondearA: 0 };
}
