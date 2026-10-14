import { describe, expect, it } from 'vitest';
import { cloudScale } from './TagCloud';

describe('cloudScale', () => {
  it.each([
    { count: 100, max: 100, expected: 1.45 },
    { count: 25, max: 100, expected: 1.15 },
    { count: 0, max: 100, expected: 0.85 },
    { count: 5, max: 0, expected: 1 },
  ])('$count of $max → $expected', ({ count, max, expected }) => {
    expect(cloudScale(count, max)).toBeCloseTo(expected, 6);
  });
});
