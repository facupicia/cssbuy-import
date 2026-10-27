import { readFile, writeFile } from "node:fs/promises";
import { deflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = ["manifest.json", "background.js", "bridge.js", "fill.js", "popup.html", "popup.js", "popup.css"];
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
const local = [], directory = []; let offset = 0;
for (const file of files) {
  const bytes = await readFile(resolve(root, "extensions/marketplace-connector", file)), compressed = deflateRawSync(bytes), name = Buffer.from(`plug-marketplace-connector/${file}`), crc = crc32(bytes);
  const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(8, 8); header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(name.length, 26);
  local.push(header, name, compressed);
  const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(8, 10); entry.writeUInt16LE(33, 14); entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(compressed.length, 20); entry.writeUInt32LE(bytes.length, 24); entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42); directory.push(entry, name);
  offset += header.length + name.length + compressed.length;
}
const dir = Buffer.concat(directory), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
await writeFile(resolve(root, "public/plug-marketplace-connector.zip"), Buffer.concat([...local, dir, end]));
console.log("Extensión PLUG Marketplace empaquetada.");
