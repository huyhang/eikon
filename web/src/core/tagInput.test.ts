import { describe, expect, it } from 'vitest';
import { parseTagInput, withTypedPrefix } from './tagInput';

describe('parseTagInput', () => {
  it.each([
    { text: 'sunset', expected: { exclude: false, prefix: '', term: 'sunset' } },
    { text: '-night', expected: { exclude: true, prefix: '', term: 'night' } },
    { text: 'character:miku', expected: { exclude: false, prefix: 'character:', term: 'miku' } },
    { text: '-Artist:wlop', expected: { exclude: true, prefix: 'Artist:', term: 'wlop' } },
    { text: 're:zero', expected: { exclude: false, prefix: '', term: 're:zero' } },
    { text: 'rem_(re:zero)', expected: { exclude: false, prefix: '', term: 'rem_(re:zero)' } },
    { text: 'meta:', expected: { exclude: false, prefix: 'meta:', term: '' } },
  ])('$text', ({ text, expected }) => {
    expect(parseTagInput(text)).toEqual(expected);
  });
});

describe('withTypedPrefix', () => {
  it.each([
    { text: 're:ze', suggestion: 're:zero_two', expected: 're:zero_two' },
    { text: '-blu', suggestion: 'blue_sky', expected: '-blue_sky' },
    { text: 'character:mi', suggestion: 'hatsune_miku', expected: 'character:hatsune_miku' },
    { text: 'sun', suggestion: 'sunset', expected: 'sunset' },
  ])('$text + $suggestion → $expected', ({ text, suggestion, expected }) => {
    expect(withTypedPrefix(text, suggestion)).toBe(expected);
  });
});
