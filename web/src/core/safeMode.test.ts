import { describe, expect, it } from 'vitest';
import type { Rating } from '@eikon/shared';
import { hiddenRatings, isVisibleUnder, maxRatingFor, type SafeModePrefs } from './safeMode';

describe('maxRatingFor', () => {
  it.each<{ prefs: SafeModePrefs; expected: Rating | undefined }>([
    { prefs: { enabled: false, maxRating: 'general' }, expected: undefined },
    { prefs: { enabled: false, maxRating: 'questionable' }, expected: undefined },
    { prefs: { enabled: true, maxRating: 'general' }, expected: 'general' },
    { prefs: { enabled: true, maxRating: 'sensitive' }, expected: 'sensitive' },
  ])('$prefs → $expected', ({ prefs, expected }) => {
    expect(maxRatingFor(prefs)).toBe(expected);
  });
});

describe('hiddenRatings', () => {
  it.each<{ prefs: SafeModePrefs; expected: Rating[] }>([
    { prefs: { enabled: false, maxRating: 'general' }, expected: [] },
    { prefs: { enabled: true, maxRating: 'general' }, expected: ['sensitive', 'questionable', 'explicit'] },
    { prefs: { enabled: true, maxRating: 'questionable' }, expected: ['explicit'] },
    { prefs: { enabled: true, maxRating: 'explicit' }, expected: [] },
  ])('$prefs hides $expected', ({ prefs, expected }) => {
    expect(hiddenRatings(prefs)).toEqual(expected);
  });
});

describe('isVisibleUnder', () => {
  it.each<{ rating: Rating | null; max: Rating | undefined; expected: boolean }>([
    { rating: 'explicit', max: undefined, expected: true },
    { rating: null, max: undefined, expected: true },
    { rating: null, max: 'explicit', expected: false },
    { rating: 'general', max: 'general', expected: true },
    { rating: 'sensitive', max: 'general', expected: false },
    { rating: 'sensitive', max: 'questionable', expected: true },
  ])('$rating under $max → $expected', ({ rating, max, expected }) => {
    expect(isVisibleUnder(rating, max)).toBe(expected);
  });
});
