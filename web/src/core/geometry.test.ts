import { describe, expect, it } from 'vitest';
import { fitRect, flipToTarget, scrollFraction, scrubberToScroll, type Rect } from './geometry';

const screen: Rect = { x: 0, y: 0, width: 1000, height: 500 };

describe('fitRect', () => {
  it.each<{ name: string; aspect: number; padding: number; expected: Rect }>([
    {
      name: 'wide image fills width',
      aspect: 4,
      padding: 0,
      expected: { x: 0, y: 125, width: 1000, height: 250 },
    },
    {
      name: 'tall image fills height',
      aspect: 0.5,
      padding: 0,
      expected: { x: 375, y: 0, width: 250, height: 500 },
    },
    {
      name: 'square with padding',
      aspect: 1,
      padding: 50,
      expected: { x: 300, y: 50, width: 400, height: 400 },
    },
    {
      name: 'invalid aspect is square',
      aspect: 0,
      padding: 0,
      expected: { x: 250, y: 0, width: 500, height: 500 },
    },
  ])('$name', ({ aspect, padding, expected }) => {
    expect(fitRect(screen, aspect, padding)).toEqual(expected);
  });
});

describe('flipToTarget', () => {
  const stage: Rect = { x: 0, y: 0, width: 1000, height: 500 };

  it.each<{ name: string; target: Rect; box: Rect }>([
    {
      name: 'centred box onto thumbnail',
      target: { x: 100, y: 50, width: 100, height: 50 },
      box: { x: 0, y: 0, width: 1000, height: 500 },
    },
    {
      name: 'offset box onto thumbnail',
      target: { x: 600, y: 300, width: 80, height: 120 },
      box: { x: 250, y: 0, width: 333, height: 500 },
    },
  ])('$name: box centre lands on target centre at target width', ({ target, box }) => {
    const t = flipToTarget(target, box, stage);
    const cx = stage.width / 2;
    const cy = stage.height / 2;
    const mappedCenterX = cx + (box.x + box.width / 2 - cx) * t.scale + t.x;
    const mappedCenterY = cy + (box.y + box.height / 2 - cy) * t.scale + t.y;
    expect(mappedCenterX).toBeCloseTo(target.x + target.width / 2, 6);
    expect(mappedCenterY).toBeCloseTo(target.y + target.height / 2, 6);
    expect(box.width * t.scale).toBeCloseTo(target.width, 6);
  });

  it('is identity-safe for empty boxes', () => {
    expect(flipToTarget(stage, { x: 0, y: 0, width: 0, height: 0 }, stage)).toEqual({ x: 0, y: 0, scale: 1 });
  });
});

describe('scrubber math', () => {
  it.each([
    { pointer: 100, top: 100, height: 400, range: 8000, expected: 0 },
    { pointer: 300, top: 100, height: 400, range: 8000, expected: 4000 },
    { pointer: 900, top: 100, height: 400, range: 8000, expected: 8000 },
    { pointer: 0, top: 100, height: 400, range: 8000, expected: 0 },
    { pointer: 300, top: 100, height: 0, range: 8000, expected: 0 },
  ])('pointer $pointer → $expected', ({ pointer, top, height, range, expected }) => {
    expect(scrubberToScroll(pointer, top, height, range)).toBe(expected);
  });

  it.each([
    { top: 0, range: 100, expected: 0 },
    { top: 50, range: 100, expected: 0.5 },
    { top: 500, range: 100, expected: 1 },
    { top: 10, range: 0, expected: 0 },
  ])('scrollFraction($top, $range) → $expected', ({ top, range, expected }) => {
    expect(scrollFraction(top, range)).toBe(expected);
  });
});
