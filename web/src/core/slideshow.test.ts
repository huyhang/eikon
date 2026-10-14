import { describe, expect, it } from 'vitest';
import { isSlideshowSeconds, slideOrder, stepPosition } from './slideshow';

describe('slideOrder', () => {
  it.each([
    { count: 4, start: 0, expected: [0, 1, 2, 3] },
    { count: 4, start: 2, expected: [2, 3, 0, 1] },
    { count: 1, start: 0, expected: [0] },
    { count: 0, start: 0, expected: [] },
    { count: 3, start: 9, expected: [2, 0, 1] },
  ])('in order: $count from $start → $expected', ({ count, start, expected }) => {
    expect(slideOrder(count, start, false, Math.random)).toEqual(expected);
  });

  it('shuffled: starts where you are and shows every picture once', () => {
    const order = slideOrder(10, 4, true, () => 0.3);
    expect(order[0]).toBe(4);
    expect(order.toSorted((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(order).not.toEqual([4, 5, 6, 7, 8, 9, 0, 1, 2, 3]);
  });
});

describe('stepPosition', () => {
  it.each([
    { position: 0, length: 3, direction: 1 as const, expected: 1 },
    { position: 2, length: 3, direction: 1 as const, expected: 0 },
    { position: 0, length: 3, direction: -1 as const, expected: 2 },
    { position: 0, length: 0, direction: 1 as const, expected: 0 },
  ])('$position + $direction in $length → $expected', ({ position, length, direction, expected }) => {
    expect(stepPosition(position, length, direction)).toBe(expected);
  });
});

it.each([
  [10, true],
  [7, false],
  ['10', false],
])('isSlideshowSeconds(%j) → %s', (value, expected) => {
  expect(isSlideshowSeconds(value)).toBe(expected);
});
