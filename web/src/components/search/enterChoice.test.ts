import { describe, expect, it } from 'vitest';
import type { TagCount } from '@eikon/shared';
import { enterChoice } from './enterChoice';

const sky: TagCount = { name: 'sky', category: 'general', count: 3 };
const night: TagCount = { name: 'night_sky', category: 'general', count: 2 };

describe('enterChoice', () => {
  it.each<[string, Parameters<typeof enterChoice>[0], TagCount | string | null]>([
    ['empty text', { text: '  ', suggestions: [sky], highlight: 0, fresh: true }, null],
    [
      'fresh highlighted suggestion',
      { text: 'sk', suggestions: [sky, night], highlight: 1, fresh: true },
      night,
    ],
    [
      'stale suggestions fall back to the typed text',
      { text: 'city', suggestions: [sky, night], highlight: 0, fresh: false },
      'city',
    ],
    ['no suggestions', { text: 'brand_new', suggestions: [], highlight: 0, fresh: true }, 'brand_new'],
    ['highlight out of range', { text: 'sk', suggestions: [sky], highlight: 4, fresh: true }, 'sk'],
  ])('%s', (_, context, expected) => {
    expect(enterChoice(context)).toEqual(expected);
  });
});
