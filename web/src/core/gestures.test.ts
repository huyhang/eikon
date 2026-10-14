import { describe, expect, it } from 'vitest';
import {
  clampDensity,
  defaultDensity,
  densityStepForPinch,
  lockAxis,
  resolveSwipe,
  type SwipeInput,
  type SwipeOutcome,
} from './gestures';

const base: SwipeInput = {
  axis: 'x',
  dx: 0,
  dy: 0,
  velocity: 0,
  viewportWidth: 400,
  viewportHeight: 800,
  hasPrev: true,
  hasNext: true,
};

describe('resolveSwipe', () => {
  it.each<{ name: string; input: Partial<SwipeInput>; expected: SwipeOutcome }>([
    { name: 'long left drag → next', input: { dx: -150 }, expected: 'next' },
    { name: 'long right drag → prev', input: { dx: 150 }, expected: 'prev' },
    { name: 'short drag → none', input: { dx: -40 }, expected: 'none' },
    { name: 'short fast flick → next', input: { dx: -40, velocity: -1 }, expected: 'next' },
    { name: 'no next at end → none', input: { dx: -200, hasNext: false }, expected: 'none' },
    { name: 'no prev at start → none', input: { dx: 200, hasPrev: false }, expected: 'none' },
    { name: 'drag down → close', input: { axis: 'y', dy: 200 }, expected: 'close' },
    { name: 'flick down → close', input: { axis: 'y', dy: 40, velocity: 1 }, expected: 'close' },
    { name: 'drag up → info', input: { axis: 'y', dy: -120 }, expected: 'info' },
    { name: 'tiny vertical → none', input: { axis: 'y', dy: 20 }, expected: 'none' },
    { name: 'no axis → none', input: { axis: null, dx: -300 }, expected: 'none' },
  ])('$name', ({ input, expected }) => {
    expect(resolveSwipe({ ...base, ...input })).toBe(expected);
  });
});

describe('lockAxis', () => {
  it.each([
    { dx: 2, dy: 3, expected: null },
    { dx: 20, dy: 3, expected: 'x' },
    { dx: -3, dy: 20, expected: 'y' },
  ])('($dx, $dy) → $expected', ({ dx, dy, expected }) => {
    expect(lockAxis(dx, dy)).toBe(expected);
  });
});

describe('density', () => {
  it.each([
    { level: -3, expected: 0 },
    { level: 2.4, expected: 2 },
    { level: 99, expected: 5 },
  ])('clamp $level → $expected', ({ level, expected }) => expect(clampDensity(level)).toBe(expected));

  it.each([
    { width: 390, expected: 1 },
    { width: 820, expected: 2 },
    { width: 1440, expected: 3 },
  ])('default for $width px → $expected', ({ width, expected }) =>
    expect(defaultDensity(width)).toBe(expected),
  );

  it.each([
    { scale: 1, expected: 0 },
    { scale: 1.4, expected: 1 },
    { scale: 0.6, expected: -1 },
  ])('pinch $scale → $expected', ({ scale, expected }) => expect(densityStepForPinch(scale)).toBe(expected));
});
