import { useEffect, useState } from 'react';

type WakeLockApi = Pick<WakeLock, 'request'>;

/**
 * Keeps the screen on while `active` (a slideshow on an iPad), re-acquiring the lock when the page
 * becomes visible again. Returns false when the browser has no wake lock or refused it, so the UI
 * can say the screen may sleep.
 */
export function useWakeLock(
  active: boolean,
  wakeLock: WakeLockApi | undefined = navigator.wakeLock,
): boolean {
  const [held, setHeld] = useState(true);
  useEffect(() => {
    if (!active || !wakeLock) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () =>
      wakeLock.request('screen').then(
        (lock) => {
          if (cancelled) void lock.release();
          else {
            sentinel = lock;
            setHeld(true);
          }
        },
        () => setHeld(false), // e.g. battery saver: the slideshow still runs, the UI warns instead
      );
    void acquire();
    const onVisible = () => document.visibilityState === 'visible' && void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
    };
  }, [active, wakeLock]);
  return wakeLock !== undefined && held;
}
