import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDensityGestures } from './useDensityGestures';

/** jsdom has no Touch constructor, so fake the parts the hook reads. */
function touchEvent(type: string, points: Array<[number, number]>): Event {
  const event = new Event(type, { cancelable: true, bubbles: true });
  const touches = points.map(([clientX, clientY]) => ({ clientX, clientY }));
  Object.defineProperty(event, 'touches', {
    value: Object.assign(touches, { item: (i: number) => touches[i] }),
  });
  return event;
}

function wheelEvent(deltaY: number, ctrlKey: boolean): WheelEvent {
  return new WheelEvent('wheel', { deltaY, ctrlKey, cancelable: true, bubbles: true });
}

function mount(onStep: ((delta: 1 | -1) => void) | undefined) {
  const el = document.createElement('div');
  const ref = { current: el };
  const hook = renderHook(({ handler }) => useDensityGestures(ref, handler), {
    initialProps: { handler: onStep },
  });
  return { el, hook };
}

describe('useDensityGestures', () => {
  it('keeps stepping through one continuous pinch even as the handler changes', () => {
    const steps: number[] = [];
    const { el, hook } = mount((d) => steps.push(d));
    el.dispatchEvent(
      touchEvent('touchstart', [
        [0, 0],
        [100, 0],
      ]),
    );
    for (const width of [140, 200, 290, 410]) {
      el.dispatchEvent(
        touchEvent('touchmove', [
          [0, 0],
          [width, 0],
        ]),
      );
      // The parent re-renders with a new handler after every step, as ImageCollection does.
      hook.rerender({ handler: (d) => steps.push(d) });
    }
    expect(steps.length).toBeGreaterThan(1);
    expect(new Set(steps)).toEqual(new Set([1]));
  });

  it.each([
    { label: 'ctrl+wheel with a handler', handler: vi.fn(), ctrlKey: true, prevented: true },
    { label: 'plain wheel with a handler', handler: vi.fn(), ctrlKey: false, prevented: false },
    {
      label: 'ctrl+wheel without a handler (browser zoom)',
      handler: undefined,
      ctrlKey: true,
      prevented: false,
    },
  ])('$label → preventDefault: $prevented', ({ handler, ctrlKey, prevented }) => {
    const { el } = mount(handler);
    const event = wheelEvent(-80, ctrlKey);
    el.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(prevented);
  });

  it('lets two-finger touches through when there is no handler', () => {
    const { el } = mount(undefined);
    el.dispatchEvent(
      touchEvent('touchstart', [
        [0, 0],
        [100, 0],
      ]),
    );
    const move = touchEvent('touchmove', [
      [0, 0],
      [300, 0],
    ]);
    el.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(false);
  });
});
