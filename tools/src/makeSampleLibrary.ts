import { copyFile, mkdir, rm, stat, utimes } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { artworkSvg } from './artwork';
import { planLibrary, type PlannedImage } from './libraryPlan';
import { seededRandom } from './random';

export interface SampleLibraryOptions {
  dir: string;
  illustrators?: number;
  minPerIllustrator?: number;
  maxPerIllustrator?: number;
  force?: boolean;
  log?: (message: string) => void;
}

async function exists(p: string): Promise<boolean> {
  return stat(p).then(
    () => true,
    () => false,
  );
}

async function render(image: PlannedImage, dir: string): Promise<void> {
  const target = path.join(dir, image.relPath);
  await mkdir(path.dirname(target), { recursive: true });
  const svg = Buffer.from(
    artworkSvg(image.spec, seededRandom(image.relPath.length * 7919 + image.spec.width)),
  );
  const pipeline = sharp(svg);
  const encoded =
    image.format === 'png'
      ? pipeline.png()
      : image.format === 'webp'
        ? pipeline.webp({ quality: 88 })
        : pipeline.jpeg({ quality: 88 });
  await encoded.toFile(target);
  await setMtime(target, image.mtimeMs);
}

async function setMtime(file: string, mtimeMs: number): Promise<void> {
  const time = new Date(mtimeMs);
  await utimes(file, time, time);
}

/** Generates a deterministic sample library; skips work if one already exists unless forced. */
export async function makeSampleLibrary(options: SampleLibraryOptions): Promise<boolean> {
  const log = options.log ?? console.log;
  if (!options.force && (await exists(path.join(options.dir, 'Illustrators')))) return false;
  await rm(options.dir, { recursive: true, force: true });
  const plan = planLibrary(
    {
      illustrators: options.illustrators ?? 8,
      minPerIllustrator: options.minPerIllustrator ?? 18,
      maxPerIllustrator: options.maxPerIllustrator ?? 40,
      now: Date.now(),
    },
    seededRandom(42),
  );
  log(`Painting ${plan.images.length} sample illustrations into ${options.dir} …`);
  for (let i = 0; i < plan.images.length; i += 8) {
    await Promise.all(plan.images.slice(i, i + 8).map((image) => render(image, options.dir)));
  }
  for (const copy of plan.copies) {
    const target = path.join(options.dir, copy.relPath);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(options.dir, copy.sourcePath), target);
    await setMtime(target, copy.mtimeMs);
  }
  log(`Sample library ready: ${plan.images.length} images, ${plan.copies.length} collection copies.`);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = path.resolve(process.argv.find((a) => a.startsWith('--dir='))?.slice(6) ?? '.dev/library');
  await makeSampleLibrary({ dir, force: process.argv.includes('--force') });
}
