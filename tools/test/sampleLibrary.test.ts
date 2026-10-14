import { mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { artworkSvg, hsl, pickSize } from '../src/artwork';
import { COLLECTIONS, pickFormat, planLibrary, slug } from '../src/libraryPlan';
import { makeSampleLibrary } from '../src/makeSampleLibrary';
import { seededRandom } from '../src/random';

describe('artwork', () => {
  it.each([1, 2, 3, 4, 5])('pickSize(seed %i) keeps the long side within 1200–2400', (seed) => {
    const { width, height } = pickSize(seededRandom(seed));
    expect(Math.max(width, height)).toBeGreaterThanOrEqual(1200);
    expect(Math.max(width, height)).toBeLessThanOrEqual(2400);
  });

  it.each([
    [0, 50, 50, 'hsl(0, 50%, 50%)'],
    [-30, 10.4, 20.6, 'hsl(330, 10%, 21%)'],
    [400, 100, 0, 'hsl(40, 100%, 0%)'],
  ])('hsl(%d, %d, %d) → %s', (h, s, l, expected) => {
    expect(hsl(h, s, l)).toBe(expected);
  });

  it('renders a valid, escaped SVG of the requested size', () => {
    const svg = artworkSvg(
      { width: 300, height: 200, baseHue: 10, label: 'Sable & Fern <3' },
      seededRandom(1),
    );
    expect(svg).toContain('width="300" height="200"');
    expect(svg).toContain('Sable &#38; Fern &#60;3');
  });
});

describe('planLibrary', () => {
  const plan = planLibrary(
    { illustrators: 3, minPerIllustrator: 5, maxPerIllustrator: 8, now: 1e12 },
    seededRandom(7),
  );

  it('creates illustrator folders within the requested counts', () => {
    const byFolder = Map.groupBy(plan.images, (i) => i.relPath.split('/')[1]);
    expect(byFolder.size).toBe(3);
    byFolder.forEach((images) => {
      expect(images.length).toBeGreaterThanOrEqual(5);
      expect(images.length).toBeLessThanOrEqual(8);
    });
  });

  it('copies only existing illustrator images into known collections', () => {
    const sources = new Set(plan.images.map((i) => i.relPath));
    plan.copies.forEach((c) => {
      expect(sources.has(c.sourcePath)).toBe(true);
      expect(COLLECTIONS).toContain(c.relPath.split('/')[1]);
    });
  });

  it('is deterministic for a seed', () => {
    expect(
      planLibrary(
        { illustrators: 3, minPerIllustrator: 5, maxPerIllustrator: 8, now: 1e12 },
        seededRandom(7),
      ),
    ).toEqual(plan);
  });

  it.each([
    ['Sable & Fern', 'sable-fern'],
    ['Aiko Sorano', 'aiko-sorano'],
    ['  Édith  ', 'dith'],
  ])('slug(%j) → %s', (name, expected) => {
    expect(slug(name)).toBe(expected);
  });

  it.each([
    [0.1, 'jpg'],
    [0.8, 'png'],
    [0.9, 'webp'],
  ])('pickFormat(%d) → %s', (roll, expected) => {
    expect(pickFormat(() => roll)).toBe(expected);
  });
});

describe('makeSampleLibrary', () => {
  it('writes images with past mtimes and skips an existing library', async () => {
    const dir = path.join(mkdtempSync(path.join(tmpdir(), 'eikon-lib-')), 'library');
    const options = { dir, illustrators: 1, minPerIllustrator: 2, maxPerIllustrator: 2, log: () => {} };
    expect(await makeSampleLibrary(options)).toBe(true);
    const folder = path.join(dir, 'Illustrators', 'Aiko Sorano');
    const files = readdirSync(folder);
    expect(files).toHaveLength(2);
    expect(statSync(path.join(folder, files[0]!)).mtimeMs).toBeLessThanOrEqual(Date.now());
    expect(await makeSampleLibrary(options)).toBe(false);
  }, 20_000);
});
