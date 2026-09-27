import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const output = process.argv[2];
if (!output) throw new Error("Usage: node make-load-image.mjs OUTPUT.jpg");

// 20 MP of deterministic, incompressible pixels exercise libvips decoding.
const width = 4000;
const height = 5000;
const pixels = Buffer.allocUnsafe(width * height * 3);
let state = 0x5eed1234;
for (let i = 0; i < pixels.length; i++) {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  pixels[i] = state & 255;
}

let image;
let quality;
let low = 1;
let high = 100;
while (low <= high) {
  const q = Math.floor((low + high) / 2);
  const candidate = await sharp(pixels, {
    raw: { width, height, channels: 3 },
  })
    .jpeg({ quality: q, chromaSubsampling: "4:2:0" })
    .toBuffer();
  if (candidate.length >= 5_000_000 && candidate.length <= 5 * 1024 * 1024) {
    image = candidate;
    quality = q;
    break;
  }
  if (candidate.length < 5_000_000) low = q + 1;
  else high = q - 1;
}
if (!image) throw new Error("Could not produce a valid 5 MB JPEG within the upload limit");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, image);
console.log(
  JSON.stringify({
    output,
    bytes: image.length,
    width,
    height,
    format: "jpeg",
    quality,
    sha256: createHash("sha256").update(image).digest("hex"),
  }),
);
