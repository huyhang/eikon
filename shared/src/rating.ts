export const RATINGS = ['general', 'sensitive', 'questionable', 'explicit'] as const;
export type Rating = (typeof RATINGS)[number];

export function ratingLevel(rating: Rating): number {
  return RATINGS.indexOf(rating);
}

export function ratingFromLevel(level: number): Rating | null {
  return RATINGS[level] ?? null;
}

export function isRating(value: unknown): value is Rating {
  return typeof value === 'string' && (RATINGS as readonly string[]).includes(value);
}

/** Picks the rating with the highest probability. */
export function strongestRating(scores: Record<Rating, number>): Rating {
  return RATINGS.reduce((best, r) => (scores[r] > scores[best] ? r : best), RATINGS[0]);
}
