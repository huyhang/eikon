import { useLayoutEffect, useState, type RefObject } from 'react';

export interface ElementSize {
  width: number;
  height: number;
}

const listeners = new WeakMap<Element, (size: ElementSize) => void>();
let observer: ResizeObserver | undefined;

/** One observer for every caller: a grid can have hundreds of images on screen. */
function sharedObserver(): ResizeObserver | undefined {
  if (typeof ResizeObserver === 'undefined') return undefined;
  observer ??= new ResizeObserver((entries) => {
    for (const entry of entries) listeners.get(entry.target)?.(entry.contentRect);
  });
  return observer;
}

/** The element's content size, measured before first paint and kept up to date. */
export function useElementSize(ref: RefObject<HTMLElement | null>): ElementSize {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = ({ width, height }: ElementSize) =>
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    update({ width: el.clientWidth, height: el.clientHeight });
    const shared = sharedObserver();
    if (!shared) return;
    listeners.set(el, update);
    shared.observe(el);
    return () => {
      shared.unobserve(el);
      listeners.delete(el);
    };
  }, [ref]);
  return size;
}
