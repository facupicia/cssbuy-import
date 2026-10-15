import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import dns from "node:dns/promises";
import https from "node:https";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import { photoPlacement } from "../src/lib/photo-format";
import { normalizePhotoBuffer, photoSourceUrl, isPublicPhotoIPv4, downloadPhoto } from "../src/lib/normalize-photo-server";
import { POST } from "../src/app/api/inventario/fotos/normalizar/route";

test("encuadre uniforme sin recortes ni deformación", () => {
  assert.deepEqual(photoPlacement(1600, 800), { width: 1280, height: 640, x: 0, y: 320, upscaled: false });
  assert.deepEqual(photoPlacement(400, 800), { width: 640, height: 1280, x: 320, y: 0, upscaled: true });
  assert.deepEqual(photoPlacement(1280, 1280), { width: 1280, height: 1280, x: 0, y: 0, upscaled: false });
  assert.throws(() => photoPlacement(10000, 10000));
  assert.throws(() => photoPlacement(0, 800));
});

test("fotos horizontales, verticales y transparentes resultan JPEG cuadrado con márgenes blancos", async () => {
  for (const [width, height] of [[1600, 800], [800, 1600], [1280, 1280]]) {
    const source = await sharp({ create: { width, height, channels: 4, background: { r: 190, g: 30, b: 40, alpha: 1 } } }).png().toBuffer();
    const result = await normalizePhotoBuffer(source);
    const bytes = Buffer.from(result.data.split(",")[1], "base64");
    const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 1280); assert.equal(info.height, 1280);
    assert.equal((await sharp(bytes).metadata()).format, "jpeg");
    assert.ok(result.data.length <= 700000);
    const center = (640 * 1280 + 640) * info.channels;
    assert.ok(Math.abs(data[center] - 190) < 5);
    if (width !== height) assert.ok(data[0] >= 250 && data[1] >= 250 && data[2] >= 250);
  }
  const transparent = await sharp({ create: { width: 800, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  const result = await normalizePhotoBuffer(transparent);
  const { data } = await sharp(Buffer.from(result.data.split(",")[1], "base64")).raw().toBuffer({ resolveWithObject: true });
  assert.ok(data.every(v => v >= 250));
  assert.equal(result.upscaled, true);
  await assert.rejects(() => normalizePhotoBuffer(Buffer.from("not an image")));
});

test("enlaces bloquean credenciales, direcciones locales y DNS hacia redes privadas", async t => {
  for (const ip of ["0.0.0.0", "10.0.0.1", "127.0.0.1", "100.64.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "198.18.0.1", "224.0.0.1", "::1", "::ffff:127.0.0.1"]) assert.equal(isPublicPhotoIPv4(ip), false);
  assert.equal(isPublicPhotoIPv4("8.8.8.8"), true);
  for (const url of ["http://example.com/a.jpg", "https://user:pass@example.com/a.jpg", "https://localhost:8080/a.jpg", "https://[::1]/a.jpg", "https://127.1/a.jpg", "https://2130706433/a.jpg"]) assert.throws(() => photoSourceUrl(url));
  assert.equal(photoSourceUrl("https://example.com/a.jpg").hostname, "example.com");
  t.mock.method(dns, "lookup", async () => [{ address: "192.168.1.1", family: 4 }]);
  await assert.rejects(() => downloadPhoto("https://example.com/a.jpg"), /sitio público/);
});

test("normalización de enlaces exige el origen del panel y valida antes de descargar", async () => {
  const old = process.env.BUSINESS_APP_ORIGIN;
  process.env.BUSINESS_APP_ORIGIN = "https://panel.example";
  try {
    const request = (origin: string, url: string) => new Request("https://panel.example/api/inventario/fotos/normalizar", {
      method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ url }),
    });
    assert.equal((await POST(request("https://evil.example", "https://example.com/photo.jpg"))).status, 403);
    assert.equal((await POST(request("https://panel.example", "https://127.0.0.1/photo.jpg"))).status, 400);
  } finally { if (old === undefined) delete process.env.BUSINESS_APP_ORIGIN; else process.env.BUSINESS_APP_ORIGIN = old; }
});

test("la descarga usa la IP validada y rechaza redirecciones a servicios locales", async t => {
  let redirect = false;
  let connections = 0;
  t.mock.method(dns, "lookup", async () => [{ address: "8.8.8.8", family: 4 }]);
  t.mock.method(https, "get", (_url: unknown, options: any, callback: any) => {
    connections++;
    options.lookup("example.com", { all: true }, (error: unknown, addresses: unknown) => {
      assert.equal(error, null);
      assert.deepEqual(addresses, [{ address: "8.8.8.8", family: 4 }]);
    });
    const stream = Object.assign(new PassThrough(), {
      statusCode: redirect ? 302 : 200,
      headers: redirect ? { location: "https://127.0.0.1/private.jpg" } : { "content-type": "image/jpeg" },
    });
    queueMicrotask(() => { callback(stream); if (!redirect) stream.end(Buffer.from("test photo bytes")); });
    return new EventEmitter();
  });
  assert.equal((await downloadPhoto("https://example.com/photo.jpg")).toString(), "test photo bytes");
  redirect = true;
  await assert.rejects(() => downloadPhoto("https://example.com/photo.jpg"), /sitio HTTPS público/);
  assert.equal(connections, 2);
});
