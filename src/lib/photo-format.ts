/** One catalog format, shared by the browser uploader and the URL normalizer. */
export const PRODUCT_PHOTO_SIZE = 1280;
export const PRODUCT_PHOTO_MAX_PIXELS = 40_000_000;
export const PRODUCT_PHOTO_MAX_CHARS = 700_000;
export const PRODUCT_PHOTO_QUALITIES = [90, 82, 72, 62, 50, 40];

export function photoPlacement(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0
    || width * height > PRODUCT_PHOTO_MAX_PIXELS) throw new Error("La foto supera el límite de 40 megapíxeles o tiene dimensiones inválidas");
  const scale = Math.min(PRODUCT_PHOTO_SIZE / width, PRODUCT_PHOTO_SIZE / height);
  const drawWidth = Math.max(1, Math.round(width * scale));
  const drawHeight = Math.max(1, Math.round(height * scale));
  return { width: drawWidth, height: drawHeight, x: Math.floor((PRODUCT_PHOTO_SIZE - drawWidth) / 2),
    y: Math.floor((PRODUCT_PHOTO_SIZE - drawHeight) / 2), upscaled: scale > 1 };
}
