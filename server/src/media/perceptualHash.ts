/**
 * Difference hash (dHash): from a 9×8 greyscale thumbnail, one bit per horizontal neighbour pair
 * (left brighter than right). Resized or re-compressed copies of an image land within a few bits.
 */
export const DHASH_WIDTH = 9;
export const DHASH_HEIGHT = 8;

export function dHash(gray: Uint8Array): string {
  if (gray.length !== DHASH_WIDTH * DHASH_HEIGHT)
    throw new Error(`expected ${DHASH_WIDTH}×${DHASH_HEIGHT} pixels`);
  let bits = 0n;
  for (let y = 0; y < DHASH_HEIGHT; y++) {
    for (let x = 0; x < DHASH_WIDTH - 1; x++) {
      const i = y * DHASH_WIDTH + x;
      bits = (bits << 1n) | (gray[i]! > gray[i + 1]! ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, '0');
}

/** Number of differing bits between two 64-bit hashes written as 16 hex digits. */
export function hammingDistance(a: string, b: string): number {
  let diff = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (diff) {
    diff &= diff - 1n;
    count++;
  }
  return count;
}
