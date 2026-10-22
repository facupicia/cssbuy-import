import type { InventoryItem } from "./types";
import { newStoreProfile } from "./store-defaults";

/** Private image references are read models, never values to save as originals. */
export function inventoryPhotoUrl(id: string, index: number, version: string, thumbnail = false) {
  return `/api/inventario/${id}/photos/${index}?v=${encodeURIComponent(version)}${thumbnail ? "&size=thumb" : ""}`;
}

export function isInventoryPhotoUrl(value: string) {
  return /^\/api\/inventario\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/photos\/[0-8]\?v=[^\s&#]+(?:&size=thumb)?$/i.test(value);
}

export function deferInventoryMedia(item: InventoryItem, count = item.tienda?.fotos.length || (item.imagen ? 1 : 0), includePhotos = true): InventoryItem {
  const photos = includePhotos ? Array.from({ length: count }, (_, index) => inventoryPhotoUrl(item.id, index, item.updatedAt)) : [];
  return { ...item, mediaDeferred: true,
    imagen: photos.length ? inventoryPhotoUrl(item.id, 0, item.updatedAt, true) : null,
    tienda: item.tienda ? { ...item.tienda, fotos: photos } : photos.length ? { ...newStoreProfile(), fotos: photos } : null };
}
