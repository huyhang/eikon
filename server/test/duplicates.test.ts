import { describe, expect, it } from 'vitest';
import { bandsOf, betterCopy, findDuplicates, type DuplicateCandidate } from '../src/library/duplicates';
import { DHASH_HEIGHT, DHASH_WIDTH, dHash, hammingDistance } from '../src/media/perceptualHash';

/** A 16-hex-digit hash with the given bits (0 = most significant) set. */
function hashWithBits(bits: number[]): string {
  return bits
    .reduce((acc, bit) => acc | (1n << BigInt(63 - bit)), 0n)
    .toString(16)
    .padStart(16, '0');
}

const image = (
  id: number,
  phash: string,
  width = 100,
  height = 100,
  sizeBytes = 1000,
): DuplicateCandidate => ({
  id,
  phash,
  width,
  height,
  sizeBytes,
});

describe('dHash', () => {
  it.each([
    { label: 'flat grey', pixel: () => 128, expected: '0000000000000000' },
    {
      label: 'brightness falling left to right',
      pixel: (x: number) => 255 - x * 20,
      expected: 'ffffffffffffffff',
    },
    { label: 'brightness rising left to right', pixel: (x: number) => x * 20, expected: '0000000000000000' },
  ])('$label → $expected', ({ pixel, expected }) => {
    const gray = Uint8Array.from({ length: DHASH_WIDTH * DHASH_HEIGHT }, (_unused, i) =>
      pixel(i % DHASH_WIDTH),
    );
    expect(dHash(gray)).toBe(expected);
  });

  it('rejects the wrong number of pixels', () => {
    expect(() => dHash(new Uint8Array(10))).toThrow(/9×8/);
  });

  it.each([
    ['0000000000000000', '0000000000000000', 0],
    ['0000000000000000', '0000000000000001', 1],
    ['ffffffffffffffff', '0000000000000000', 64],
    ['f0f0f0f0f0f0f0f0', '0f0f0f0f0f0f0f0f', 64],
    [hashWithBits([0, 10]), hashWithBits([0, 11]), 2],
  ])('hammingDistance(%s, %s) → %i', (a, b, expected) => {
    expect(hammingDistance(a, b)).toBe(expected);
  });
});

describe('bandsOf', () => {
  it('splits 64 bits into labelled bands covering every bit', () => {
    const bands = bandsOf('ffffffffffffffff', 5);
    expect(bands).toHaveLength(5);
    expect(bands.map((b) => b.split(':')[1]).join('')).toBe('1'.repeat(64));
  });
});

describe('betterCopy', () => {
  it.each([
    { label: 'more pixels wins', a: image(1, '', 200, 200), b: image(2, '', 100, 100), winner: 1 },
    {
      label: 'same pixels: more bytes wins',
      a: image(1, '', 100, 100, 10),
      b: image(2, '', 100, 100, 20),
      winner: 2,
    },
    { label: 'full tie: older id wins', a: image(5, ''), b: image(3, ''), winner: 3 },
  ])('$label', ({ a, b, winner }) => {
    expect(betterCopy(a, b).id).toBe(winner);
  });
});

describe('findDuplicates', () => {
  const base = hashWithBits([1, 7, 20, 33, 48]);

  it.each([
    { label: 'identical hashes', other: base, linked: true },
    { label: '4 bits apart', other: hashWithBits([1, 7, 20, 33, 48, 2, 9, 40, 63]), linked: true },
    { label: '5 bits apart', other: hashWithBits([1, 7, 20, 33, 48, 2, 9, 40, 62, 63]), linked: false },
    { label: 'unrelated', other: hashWithBits([0, 3, 5, 11, 17, 29, 31, 44, 50, 61]), linked: false },
  ])('$label → linked: $linked', ({ other, linked }) => {
    const copies = findDuplicates([image(1, base, 2000, 2000), image(2, other, 500, 500)]);
    expect(copies.get(2) === 1).toBe(linked);
    expect(copies.has(1)).toBe(false);
  });

  it('links every copy in a chain to the single best copy', () => {
    const a = hashWithBits([]);
    const b = hashWithBits([0, 1, 2]);
    const c = hashWithBits([0, 1, 2, 3, 4, 5]); // 6 from a, but 3 from b
    const copies = findDuplicates([image(1, a, 300, 300), image(2, b, 900, 900), image(3, c, 600, 600)]);
    expect(Object.fromEntries(copies)).toEqual({ 1: 2, 3: 2 });
  });

  it('keeps separate pictures separate', () => {
    const copies = findDuplicates([
      image(1, hashWithBits([])),
      image(2, hashWithBits([0])),
      image(3, 'ffffffffffffffff'),
      image(4, 'fffffffffffffffe'),
    ]);
    expect(Object.fromEntries(copies)).toEqual({ 2: 1, 4: 3 });
  });
});
