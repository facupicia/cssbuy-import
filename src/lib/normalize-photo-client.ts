import { PRODUCT_PHOTO_SIZE, PRODUCT_PHOTO_MAX_CHARS, PRODUCT_PHOTO_QUALITIES, photoPlacement } from "./photo-format";

export interface NormalizedPhoto { data: string; upscaled: boolean }

export async function normalizePhotoFile(file: Blob): Promise<NormalizedPhoto> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 12 * 1024 * 1024) throw new Error("Elegí fotos JPG, PNG o WebP de hasta 12 MB");
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("No se pudo abrir la foto. Verificá que el archivo sea una imagen válida"); }
  try {
    const fit = photoPlacement(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = PRODUCT_PHOTO_SIZE;
    canvas.height = PRODUCT_PHOTO_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("El navegador no pudo procesar esta foto");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, fit.x, fit.y, fit.width, fit.height);
    for (const quality of PRODUCT_PHOTO_QUALITIES) {
      const data = canvas.toDataURL("image/jpeg", quality / 100);
      if (data.length <= PRODUCT_PHOTO_MAX_CHARS) return { data, upscaled: fit.upscaled };
    }
    throw new Error("No se pudo comprimir la foto. Elegí otra versión de la imagen");
  } finally { bitmap.close(); }
}

export async function normalizePhotoSource(source: string): Promise<NormalizedPhoto> {
  if (source.startsWith("data:image/")) return normalizePhotoFile(await (await fetch(source)).blob());
  const response = await fetch("/api/inventario/fotos/normalizar", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: source }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "No se pudo descargar la foto. Podés subirla desde tu equipo");
  return result as NormalizedPhoto;
}
