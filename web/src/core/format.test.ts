import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatCompact,
  formatCount,
  formatDate,
  formatPercent,
  formatRelative,
  pluralize,
} from './format';

describe('formatCount', () => {
  it.each([
    { n: 0, expected: '0' },
    { n: 999, expected: '999' },
    { n: 1284, expected: '1,284' },
    { n: 1203456, expected: '1,203,456' },
  ])('$n → $expected', ({ n, expected }) => expect(formatCount(n)).toBe(expected));
});

describe('formatCompact', () => {
  it.each([
    { n: 412, expected: '412' },
    { n: 9999, expected: '9,999' },
    { n: 12_400, expected: '12.4K' },
    { n: 2_500_000, expected: '2.5M' },
  ])('$n → $expected', ({ n, expected }) => expect(formatCompact(n)).toBe(expected));
});

describe('pluralize', () => {
  it.each([
    { n: 1, expected: '1 image' },
    { n: 0, expected: '0 images' },
    { n: 3000, expected: '3,000 images' },
  ])('$n → $expected', ({ n, expected }) => expect(pluralize(n, 'image')).toBe(expected));
});

describe('formatBytes', () => {
  it.each([
    { bytes: 0, expected: '0 B' },
    { bytes: 512, expected: '512 B' },
    { bytes: 1536, expected: '1.5 KB' },
    { bytes: 5 * 1024 * 1024, expected: '5.0 MB' },
    { bytes: 250 * 1024 * 1024, expected: '250 MB' },
    { bytes: 3.2 * 1024 ** 3, expected: '3.2 GB' },
    { bytes: -1, expected: '—' },
  ])('$bytes → $expected', ({ bytes, expected }) => expect(formatBytes(bytes)).toBe(expected));
});

describe('formatDate', () => {
  it('formats as a long date', () => {
    expect(formatDate(new Date(2026, 9, 13, 12).getTime())).toBe('October 13, 2026');
  });
});

describe('formatRelative', () => {
  const now = new Date(2026, 9, 13, 12).getTime();
  it.each([
    { ago: 10_000, expected: 'just now' },
    { ago: 5 * 60_000, expected: '5 min ago' },
    { ago: 3 * 3_600_000, expected: '3 h ago' },
    { ago: 86_400_000, expected: '1 day ago' },
    { ago: 4 * 86_400_000, expected: '4 days ago' },
    { ago: 40 * 86_400_000, expected: formatDate(now - 40 * 86_400_000) },
  ])('$ago ms ago → $expected', ({ ago, expected }) => expect(formatRelative(now - ago, now)).toBe(expected));
});

describe('formatPercent', () => {
  it.each([
    { f: 0, expected: '0%' },
    { f: 0.413, expected: '41%' },
    { f: 1.2, expected: '100%' },
    { f: -1, expected: '0%' },
  ])('$f → $expected', ({ f, expected }) => expect(formatPercent(f)).toBe(expected));
});
