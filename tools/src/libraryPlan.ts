import { pickSize, type ArtworkSpec } from './artwork';
import type { Random } from './random';

export const ILLUSTRATORS = [
  'Aiko Sorano',
  'Mateo Vance',
  'Lumen Atelier',
  'Noor Haddad',
  'Kenji Morrow',
  'Elise Fontaine',
  'Rafael Ito',
  'Sable & Fern',
];

export const COLLECTIONS = ['Golden Hour', 'Quiet Cities', 'Night Skies', 'Desktop Rotation'];

export type ImageFormat = 'jpg' | 'png' | 'webp';

export interface PlannedImage {
  relPath: string;
  spec: ArtworkSpec;
  format: ImageFormat;
  mtimeMs: number;
}

export interface PlannedCopy {
  relPath: string;
  /** An illustrator image duplicated byte-for-byte into a collection. */
  sourcePath: string;
  mtimeMs: number;
}

export interface LibraryPlan {
  images: PlannedImage[];
  copies: PlannedCopy[];
}

export interface PlanOptions {
  illustrators: number;
  minPerIllustrator: number;
  maxPerIllustrator: number;
  now: number;
}

const DAY = 86_400_000;

export function pickFormat(random: Random): ImageFormat {
  const roll = random();
  return roll < 0.7 ? 'jpg' : roll < 0.85 ? 'png' : 'webp';
}

/** Lays out Illustrators/<name>/… and Collections/<name>/… with shared copies between them. */
export function planLibrary(options: PlanOptions, random: Random): LibraryPlan {
  const images: PlannedImage[] = [];
  ILLUSTRATORS.slice(0, options.illustrators).forEach((name, index) => {
    const span = options.maxPerIllustrator - options.minPerIllustrator + 1;
    const count = options.minPerIllustrator + Math.floor(random() * span);
    const baseHue = (index * 360) / options.illustrators;
    for (let n = 1; n <= count; n++) {
      const format = pickFormat(random);
      images.push({
        relPath: `Illustrators/${name}/${slug(name)}-${String(n).padStart(3, '0')}.${format}`,
        spec: { ...pickSize(random), baseHue, label: `${name} · No. ${n}` },
        format,
        mtimeMs: options.now - Math.floor(random() * 400 * DAY),
      });
    }
  });
  const copies = COLLECTIONS.flatMap((collection) =>
    images
      .filter(() => random() < 0.12)
      .map((source) => ({
        relPath: `Collections/${collection}/${source.relPath.split('/').pop()}`,
        sourcePath: source.relPath,
        mtimeMs: source.mtimeMs + Math.floor(random() * 30 * DAY),
      })),
  );
  return { images, copies };
}

export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
