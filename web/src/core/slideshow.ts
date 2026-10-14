/** Seconds per picture the slideshow offers. */
export const SLIDESHOW_SECONDS = [5, 10, 20, 30] as const;
export type SlideshowSeconds = (typeof SLIDESHOW_SECONDS)[number];

export function isSlideshowSeconds(value: unknown): value is SlideshowSeconds {
  return SLIDESHOW_SECONDS.includes(value as SlideshowSeconds);
}

/**
 * The order to show `count` pictures in, starting with `start`. Shuffled, the rest follow in a random
 * order (Fisher–Yates with the injected random), so each picture appears once per round.
 */
export function slideOrder(count: number, start: number, shuffle: boolean, random: () => number): number[] {
  if (count <= 0) return [];
  const first = Math.min(Math.max(0, start), count - 1);
  const rest = Array.from({ length: count }, (_unused, i) => i).filter((i) => i !== first);
  if (!shuffle) return [first, ...rest.filter((i) => i > first), ...rest.filter((i) => i < first)];
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  return [first, ...rest];
}

/** Next/previous position in the order, wrapping round. */
export function stepPosition(position: number, length: number, direction: 1 | -1): number {
  if (length === 0) return 0;
  return (position + direction + length) % length;
}
