import { describe, expect, it } from 'vitest';
import { clampAspect, computeJustifiedLayout, findRowOfItem } from './justifiedLayout';

const sumRowWidth = (row: { items: { width: number }[] }, gap: number) =>
  row.items.reduce((acc, item) => acc + item.width, 0) + gap * (row.items.length - 1);

describe('computeJustifiedLayout', () => {
  it.each([
    { name: 'empty list', aspects: [], width: 1000, expectedRows: 0 },
    { name: 'zero width', aspects: [1, 1], width: 0, expectedRows: 0 },
    { name: 'one short row', aspects: [1, 1], width: 1000, expectedRows: 1 },
    { name: 'squares wrap two per row', aspects: [1, 1, 1, 1, 1, 1, 1, 1], width: 400, expectedRows: 4 },
    { name: 'panoramas take their own rows', aspects: [3, 3, 3], width: 600, expectedRows: 3 },
  ])('$name → $expectedRows rows', ({ aspects, width, expectedRows }) => {
    const layout = computeJustifiedLayout(aspects, { containerWidth: width, targetRowHeight: 200, gap: 4 });
    expect(layout.rows).toHaveLength(expectedRows);
  });

  it.each([
    { aspects: [1, 1.5, 0.7, 1, 2, 0.5, 1.33, 1], width: 800, gap: 4 },
    { aspects: [0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6], width: 375, gap: 2 },
    { aspects: [1.77, 1.77, 1.77, 1.77], width: 1200, gap: 6 },
  ])('full rows exactly fill $width px', ({ aspects, width, gap }) => {
    const layout = computeJustifiedLayout(aspects, { containerWidth: width, targetRowHeight: 180, gap });
    for (const row of layout.rows.slice(0, -1)) {
      expect(sumRowWidth(row, gap)).toBeCloseTo(width, 5);
    }
  });

  it('keeps the last row at target height and left aligned', () => {
    const layout = computeJustifiedLayout([1, 1, 1, 1, 1], {
      containerWidth: 500,
      targetRowHeight: 200,
      gap: 0,
    });
    const last = layout.rows.at(-1)!;
    expect(last.height).toBe(200);
    expect(last.items[0]!.left).toBe(0);
  });

  it('stacks rows with gaps and reports total height', () => {
    const layout = computeJustifiedLayout([2, 2, 2, 2], {
      containerWidth: 400,
      targetRowHeight: 100,
      gap: 10,
    });
    expect(layout.rows.map((r) => r.top)).toEqual([0, layout.rows[0]!.height + 10]);
    const last = layout.rows.at(-1)!;
    expect(layout.height).toBeCloseTo(last.top + last.height, 5);
  });

  it('preserves item order and indexes', () => {
    const layout = computeJustifiedLayout([1, 2, 1, 0.5, 1, 1], {
      containerWidth: 300,
      targetRowHeight: 100,
      gap: 2,
    });
    expect(layout.rows.flatMap((r) => r.items.map((i) => i.index))).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('clampAspect', () => {
  it.each([
    { input: 1, expected: 1 },
    { input: 10, expected: 3.5 },
    { input: 0.01, expected: 0.3 },
    { input: 0, expected: 1 },
    { input: Number.NaN, expected: 1 },
    { input: -2, expected: 1 },
  ])('$input → $expected', ({ input, expected }) => {
    expect(clampAspect(input)).toBe(expected);
  });
});

describe('findRowOfItem', () => {
  const layout = computeJustifiedLayout([1, 1, 1, 1, 1, 1, 1], {
    containerWidth: 300,
    targetRowHeight: 100,
    gap: 0,
  });

  it.each([
    { item: 0, row: 0 },
    { item: 2, row: 0 },
    { item: 3, row: 1 },
    { item: 6, row: 2 },
    { item: 99, row: -1 },
  ])('item $item is in row $row', ({ item, row }) => {
    expect(findRowOfItem(layout, item)).toBe(row);
  });
});
