import { RATINGS, ratingLevel, type Rating } from '@eikon/shared';

export interface SafeModePrefs {
  enabled: boolean;
  /** Highest rating still shown while safe mode is on. */
  maxRating: Rating;
}

export const DEFAULT_SAFE_MODE: SafeModePrefs = { enabled: false, maxRating: 'general' };

/** The `maxRating` query parameter implied by the device's safe-mode prefs. */
export function maxRatingFor(prefs: SafeModePrefs): Rating | undefined {
  return prefs.enabled ? prefs.maxRating : undefined;
}

/** Ratings that safe mode hides, for explaining the setting. */
export function hiddenRatings(prefs: SafeModePrefs): Rating[] {
  if (!prefs.enabled) return [];
  return RATINGS.filter((r) => ratingLevel(r) > ratingLevel(prefs.maxRating));
}

export function isVisibleUnder(rating: Rating | null, maxRating: Rating | undefined): boolean {
  if (!maxRating) return true;
  return rating !== null && ratingLevel(rating) <= ratingLevel(maxRating);
}

export const RATING_LABELS: Record<Rating, string> = {
  general: 'General',
  sensitive: 'Sensitive',
  questionable: 'Questionable',
  explicit: 'Explicit',
};
