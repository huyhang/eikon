import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { sampleTile } from '../../test/fakeApi';
import { renderWithProviders } from '../../test/render';
import { Slideshow } from './Slideshow';

const tiles = [sampleTile(11), sampleTile(12), sampleTile(13)];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function renderShow(startIndex = 0, random = () => 0.5) {
  const onExit = vi.fn();
  renderWithProviders(<Slideshow tiles={tiles} startIndex={startIndex} onExit={onExit} />, { random });
  return onExit;
}

const slide = (n: number) => screen.getByAltText(`Slide ${n} of 3`);
const press = (key: string) => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key })));

describe('Slideshow', () => {
  it('starts on the chosen picture and moves on every 10 seconds by default', () => {
    renderShow(1);
    expect(slide(1)).toHaveAttribute('src', '/media/thumb/12/lg?v=2');
    act(() => vi.advanceTimersByTime(10_000));
    expect(slide(2)).toHaveAttribute('src', '/media/thumb/13/lg?v=2');
    act(() => vi.advanceTimersByTime(10_000));
    expect(slide(3)).toHaveAttribute('src', '/media/thumb/11/lg?v=2');
  });

  it('Space pauses and resumes', () => {
    renderShow();
    press(' ');
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.queryByAltText('Slide 2 of 3')).toBeNull();
    press(' ');
    act(() => vi.advanceTimersByTime(10_000));
    expect(slide(2)).toBeInTheDocument();
  });

  it.each([
    { key: 'ArrowRight', expected: { n: 2, id: 12 } },
    { key: 'ArrowLeft', expected: { n: 3, id: 13 } },
  ])('$key steps through the pictures, wrapping round', ({ key, expected }) => {
    renderShow();
    press(key);
    expect(slide(expected.n)).toHaveAttribute('src', `/media/thumb/${expected.id}/lg?v=2`);
  });

  it('Esc leaves at the picture on screen', () => {
    const onExit = renderShow();
    press('ArrowRight');
    press('Escape');
    expect(onExit).toHaveBeenCalledWith(1);
  });

  it('shuffle reorders the rest of the pictures with the injected random', () => {
    renderShow(0, () => 0);
    fireEvent.click(screen.getByRole('switch', { name: 'Shuffle' }));
    press('ArrowRight');
    expect(slide(2)).toHaveAttribute('src', '/media/thumb/13/lg?v=2');
  });

  it('a shorter interval takes effect straight away', () => {
    renderShow();
    fireEvent.click(screen.getByRole('radio', { name: '5s' }));
    act(() => vi.advanceTimersByTime(5_000));
    expect(slide(2)).toBeInTheDocument();
  });

  it('warns when the screen cannot be kept awake', () => {
    renderShow();
    expect(screen.getByText(/screen may sleep/)).toBeInTheDocument();
  });
});
