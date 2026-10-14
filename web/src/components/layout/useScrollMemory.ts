import { useEffect, useEffectEvent, useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router';

const positions = new Map<string, number>();
const RESTORE_ATTEMPTS = 20;

/**
 * Scrolls to top on new pages and restores the previous position on Back/Forward,
 * waiting briefly for async content to make the page tall enough. Viewer-only URL
 * changes (same path) are ignored.
 */
export function useScrollMemory(): void {
  const location = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    const save = () => positions.set(location.key, window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [location.key]);

  // Reads the latest location and navigation type, but only runs when the page (path) changes.
  const enterPage = useEffectEvent((_pathname: string) => {
    if (navigationType !== 'POP') {
      window.scrollTo(0, 0);
      return undefined;
    }
    const target = positions.get(location.key) ?? 0;
    let attempts = 0;
    let frame = 0;
    const restore = () => {
      const reachable = document.documentElement.scrollHeight - window.innerHeight >= target;
      if (reachable || attempts++ > RESTORE_ATTEMPTS) window.scrollTo(0, target);
      else frame = requestAnimationFrame(restore);
    };
    restore();
    return () => cancelAnimationFrame(frame);
  });

  useLayoutEffect(() => enterPage(location.pathname), [location.pathname]);
}
