import { describe, expect, it } from 'vitest';
import { normalize } from '@eikon/shared';
import { VectorIndex } from '../src/similarity/vectorIndex';

const unit = (...values: number[]) => normalize(values);

function seeded(): VectorIndex {
  const index = new VectorIndex(3);
  index.set(1, unit(1, 0, 0));
  index.set(2, unit(0.9, 0.1, 0));
  index.set(3, unit(0, 1, 0));
  index.set(4, unit(-1, 0, 0));
  return index;
}

describe('VectorIndex', () => {
  it.each([
    { label: 'best first', query: unit(1, 0, 0), limit: 4, expected: [1, 2, 3, 4] },
    { label: 'limited', query: unit(1, 0, 0), limit: 2, expected: [1, 2] },
    { label: 'another direction', query: unit(0, 1, 0), limit: 2, expected: [3, 2] },
  ])('nearest: $label', ({ query, limit, expected }) => {
    expect(
      seeded()
        .nearest(query, limit)
        .map((r) => r.id),
    ).toEqual(expected);
  });

  it('scores approximate cosine similarity despite int8 storage', () => {
    const [best, , , worst] = seeded().nearest(unit(1, 0, 0), 4);
    expect(best!.score).toBeCloseTo(1, 1);
    expect(worst!.score).toBeCloseTo(-1, 1);
  });

  it('applies the accept filter', () => {
    expect(
      seeded()
        .nearest(unit(1, 0, 0), 4, (id) => id % 2 === 1)
        .map((r) => r.id),
    ).toEqual([1, 3]);
  });

  it.each([
    { label: 'deleting the last slot', remove: 4 },
    { label: 'deleting a middle slot (moves the last one)', remove: 2 },
  ])('$label keeps the rest searchable', ({ remove }) => {
    const index = seeded();
    index.delete(remove);
    index.delete(999);
    expect(index.size).toBe(3);
    expect(index.has(remove)).toBe(false);
    expect(index.nearest(unit(1, 0, 0), 4).map((r) => r.id)).not.toContain(remove);
    expect(index.get(4)?.length ?? 3).toBe(3);
  });

  it('replaces a vector in place and grows past its initial capacity', () => {
    const index = new VectorIndex(2);
    for (let id = 0; id < 200; id++) index.set(id, unit(1, id / 200));
    index.set(0, unit(0, 1));
    expect(index.size).toBe(200);
    expect(index.nearest(unit(0, 1), 1)[0]!.id).toBe(0);
  });

  it('rejects vectors of the wrong size', () => {
    expect(() => new VectorIndex(3).set(1, [1, 0])).toThrow(/3 dimensions/);
  });
});
