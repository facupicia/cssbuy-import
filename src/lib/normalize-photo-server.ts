import dns from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";
import sharp from "sharp";
import { PRODUCT_PHOTO_MAX_CHARS, PRODUCT_PHOTO_MAX_PIXELS, PRODUCT_PHOTO_QUALITIES, PRODUCT_PHOTO_SIZE } from "./photo-format";

const MAX_DOWNLOAD_BYTES = 12 * 1024 * 1024;
export function isPublicPhotoIPv4(address: string) {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99)))
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113));
}
export function photoSourceUrl(value: unknown): URL {
  if (typeof value !== "string" || value.length > 2048) throw new Error("Ingresá un enlace HTTPS válido a una foto");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Ingresá un enlace HTTPS válido a una foto"); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")
    || isIP(url.hostname.replace(/^\[|\]$/g, "")) === 6
    || (isIP(url.hostname) === 4 && !isPublicPhotoIPv4(url.hostname))) throw new Error("Usá una foto alojada en un sitio HTTPS público");
  return url;
}

export async function downloadPhoto(source: string, redirects = 0): Promise<Buffer> {
  const url = photoSourceUrl(source);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    dns.lookup(url.hostname, { all: true, family: 4 }),
    new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("No se pudo resolver el sitio de la foto")), 8000); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
  if (!addresses.length || addresses.some(a => !isPublicPhotoIPv4(a.address))) throw new Error("La dirección de la foto no pertenece a un sitio público");
  // Pin the validated address for this connection; validate every redirect again.
  const result = await new Promise<Buffer | URL>((resolve, reject) => {
    const req = https.get(url, { agent: false, signal: AbortSignal.timeout(15000),
      headers: { Accept: "image/jpeg,image/png,image/webp", "User-Agent": "PLUG Product Photos" },
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [{ address: addresses[0].address, family: 4 }]);
        else callback(null, addresses[0].address, 4);
      },
    }, response => {
      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location;
        response.destroy();
        if (!location || redirects >= 3) { reject(new Error("El enlace redirige demasiadas veces. Usá el enlace directo a la foto")); return; }
        try { resolve(photoSourceUrl(new URL(location, url).href)); } catch(e) { reject(e); }
        return;
      }
      if (status !== 200 || !/^image\/(jpeg|png|webp)(?:;|$)/i.test(response.headers["content-type"] ?? "")) {
        response.destroy(); reject(new Error("El enlace no devolvió una foto JPG, PNG o WebP. Podés subirla desde tu equipo")); return;
      }
      if (Number(response.headers["content-length"] || 0) > MAX_DOWNLOAD_BYTES) { response.destroy(); reject(new Error("La foto supera el límite de 12 MB")); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_DOWNLOAD_BYTES) { response.destroy(); reject(new Error("La foto supera el límite de 12 MB")); }
        else chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
      response.on("aborted", () => reject(new Error("La descarga de la foto se interrumpió")));
    });
    req.on("error", reject);
  });
  return result instanceof URL ? downloadPhoto(result.href, redirects + 1) : result;
}

export async function normalizePhotoBuffer(input: Buffer) {
  const original = sharp(input, { limitInputPixels: PRODUCT_PHOTO_MAX_PIXELS, failOn: "error" });
  const metadata = await original.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || !metadata.width || !metadata.height) throw new Error("Formato de foto inválido");
  const pipeline = original.rotate().flatten({ background: "#ffffff" }).resize(PRODUCT_PHOTO_SIZE, PRODUCT_PHOTO_SIZE, { fit: "contain", position: "centre", background: "#ffffff" }).toColourspace("srgb");
  for (const quality of PRODUCT_PHOTO_QUALITIES) {
    const output = await pipeline.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
    const data = `data:image/jpeg;base64,${output.toString("base64")}`;
    if (data.length <= PRODUCT_PHOTO_MAX_CHARS) return { data, upscaled: Math.max(metadata.width, metadata.height) < PRODUCT_PHOTO_SIZE };
  }
  throw new Error("No se pudo comprimir la foto. Elegí otra versión de la imagen");
}
