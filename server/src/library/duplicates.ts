import { hammingDistance } from '../media/perceptualHash';

export interface DuplicateCandidate {
  id: number;
  phash: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/** Hashes this many bits apart or closer count as the same picture (resized or re-compressed). */
export const DUPLICATE_DISTANCE = 4;

/** The best copy: most pixels, then most bytes, then the oldest id. */
export function betterCopy(a: DuplicateCandidate, b: DuplicateCandidate): DuplicateCandidate {
  const pixels = (c: DuplicateCandidate) => c.width * c.height;
  if (pixels(a) !== pixels(b)) return pixels(a) > pixels(b) ? a : b;
  if (a.sizeBytes !== b.sizeBytes) return a.sizeBytes > b.sizeBytes ? a : b;
  return a.id < b.id ? a : b;
}

/** Splits 64 bits into `count` contiguous bands (as equal as possible). */
export function bandsOf(phash: string, count: number): string[] {
  const bits = BigInt(`0x${phash}`).toString(2).padStart(64, '0');
  const size = Math.ceil(64 / count);
  return Array.from({ length: count }, (_unused, i) => `${i}:${bits.slice(i * size, (i + 1) * size)}`);
}

class UnionFind {
  private readonly parent = new Map<number, number>();

  find(x: number): number {
    let root = x;
    while ((this.parent.get(root) ?? root) !== root) root = this.parent.get(root)!;
    this.parent.set(x, root);
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/** Pairs worth comparing: any two hashes within `distance` bits share at least one of `distance + 1` bands. */
function candidatePairs(items: DuplicateCandidate[], distance: number): Array<[number, number]> {
  const buckets = new Map<string, number[]>();
  items.forEach((item, index) => {
    for (const band of bandsOf(item.phash, distance + 1)) {
      const bucket = buckets.get(band);
      if (bucket) bucket.push(index);
      else buckets.set(band, [index]);
    }
  });
  const pairs = new Set<string>();
  const result: Array<[number, number]> = [];
  for (const bucket of buckets.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const key = `${bucket[i]}-${bucket[j]}`;
        if (!pairs.has(key)) {
          pairs.add(key);
          result.push([bucket[i]!, bucket[j]!]);
        }
      }
    }
  }
  return result;
}

/**
 * Groups near-identical images and maps every copy except the best one to the best one's id.
 * Images without a near-duplicate don't appear in the result.
 */
export function findDuplicates(
  items: DuplicateCandidate[],
  distance = DUPLICATE_DISTANCE,
): Map<number, number> {
  const sets = new UnionFind();
  for (const [i, j] of candidatePairs(items, distance)) {
    if (hammingDistance(items[i]!.phash, items[j]!.phash) <= distance) sets.union(i, j);
  }
  const best = new Map<number, DuplicateCandidate>();
  items.forEach((item, index) => {
    const root = sets.find(index);
    const current = best.get(root);
    best.set(root, current ? betterCopy(current, item) : item);
  });
  const copies = new Map<number, number>();
  items.forEach((item, index) => {
    const winner = best.get(sets.find(index))!;
    if (winner.id !== item.id) copies.set(item.id, winner.id);
  });
  return copies;
}
