import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { sampleTile } from '../../test/fakeApi';
import { Filmstrip, filmstripWindow } from './Filmstrip';

describe('filmstripWindow', () => {
  it.each([
    { count: 100, index: 50, reach: 20, expected: { start: 30, end: 71 } },
    { count: 100, index: 3, reach: 20, expected: { start: 0, end: 24 } },
    { count: 100, index: 98, reach: 20, expected: { start: 78, end: 100 } },
    { count: 5, index: 2, reach: 20, expected: { start: 0, end: 5 } },
    { count: 1, index: 0, reach: 20, expected: { start: 0, end: 1 } },
  ])('$count tiles at $index → $expected', ({ count, index, reach, expected }) => {
    expect(filmstripWindow(count, index, reach)).toEqual(expected);
  });
});

describe('Filmstrip', () => {
  const tiles = Array.from({ length: 6 }, (_unused, i) => sampleTile(i + 1));

  it('marks the current picture and jumps to a tapped one', () => {
    const onJump = vi.fn();
    render(<Filmstrip tiles={tiles} index={2} onJump={onJump} bottom={84} />);
    expect(screen.getByRole('button', { name: 'Image 3' })).toHaveAttribute('aria-current', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Image 5' }));
    expect(onJump).toHaveBeenCalledWith(4);
  });

  it('keeps the current thumbnail in view as the index moves', () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { rerender } = render(<Filmstrip tiles={tiles} index={0} onJump={() => {}} bottom={84} />);
    rerender(<Filmstrip tiles={tiles} index={3} onJump={() => {}} bottom={84} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(screen.getByRole('button', { name: 'Image 4' }));
    scrollIntoView.mockRestore();
  });
});
