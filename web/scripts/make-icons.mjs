// Renders public/icon.svg into the PNG sizes iOS and Android expect.
// Usage: node web/scripts/make-icons.mjs   (re-run after editing icon.svg; outputs are committed)
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const svg = await readFile(join(publicDir, 'icon.svg'));

const targets = [
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  // Maskable icons need the artwork inside the central 80% safe zone.
  { file: 'icon-maskable-512.png', size: 512, inset: 0.1 },
];

for (const { file, size, inset = 0 } of targets) {
  const inner = Math.round(size * (1 - inset * 2));
  const art = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer();
  const pipeline = inset
    ? sharp({ create: { width: size, height: size, channels: 4, background: '#b03a95' } }).composite([
        { input: art, gravity: 'center' },
      ])
    : sharp(art);
  await pipeline.png({ compressionLevel: 9 }).toFile(join(publicDir, file));
  console.log(`wrote ${file}`);
}
