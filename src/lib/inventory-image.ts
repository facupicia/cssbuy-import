import sharp from "sharp";
import { createHash } from "node:crypto";

const thumbnails = new Map<string, Buffer>();
const inFlight = new Map<string, Promise<Buffer>>();
let cacheBytes = 0;
const MAX_BYTES = 8 * 1024 * 1024;

export function imageTag(source: string, thumbnail: boolean) {
  return `"${createHash("sha256").update(thumbnail ? "thumb-256-v1:" : "original:").update(source).digest("hex")}"`;
}

export async function inventoryImage(source: string, thumbnail: boolean) {
  const data = source.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/);
  if (!data) return null;
  const original = Buffer.from(data[2], "base64");
  if (!thumbnail) return { bytes: original, type: `image/${data[1]}` };
  const key = imageTag(source, true);
  const cached = thumbnails.get(key);
  if (cached) {
    thumbnails.delete(key); thumbnails.set(key, cached);
    return { bytes: cached, type: "image/webp" };
  }
  let task = inFlight.get(key);
  if (!task) {
    task = sharp(original, { limitInputPixels: 40_000_000 }).rotate()
      .resize(256, 256, { fit: "inside", withoutEnlargement: true }).webp({ quality: 72 }).toBuffer()
      .then(bytes => {
        thumbnails.set(key, bytes); cacheBytes += bytes.length;
        while (cacheBytes > MAX_BYTES || thumbnails.size > 128) {
          const first = thumbnails.keys().next().value!;
          cacheBytes -= thumbnails.get(first)!.length; thumbnails.delete(first);
        }
        return bytes;
      }).finally(() => { inFlight.delete(key); });
    inFlight.set(key, task);
  }
  return { bytes: await task, type: "image/webp" };
}
