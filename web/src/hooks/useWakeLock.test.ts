import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useWakeLock } from './useWakeLock';

function fakeWakeLock(outcome: 'granted' | 'refused') {
  const release = vi.fn(async () => {});
  const request = vi.fn(async () => {
    if (outcome === 'refused') throw new DOMException('Battery saver', 'NotAllowedError');
    return { release } as unknown as WakeLockSentinel;
  });
  return { wakeLock: { request }, request, release };
}

describe('useWakeLock', () => {
  it('holds the screen while active and lets go afterwards', async () => {
    const { wakeLock, request, release } = fakeWakeLock('granted');
    const { result, rerender } = renderHook(({ active }) => useWakeLock(active, wakeLock), {
      initialProps: { active: true },
    });
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    expect(result.current).toBe(true);
    rerender({ active: false });
    await waitFor(() => expect(release).toHaveBeenCalled());
  });

  it.each([
    { label: 'unsupported', wakeLock: undefined },
    { label: 'refused', wakeLock: fakeWakeLock('refused').wakeLock },
  ])('reports false when the lock is $label', async ({ wakeLock }) => {
    const { result } = renderHook(() => useWakeLock(true, wakeLock));
    await waitFor(() => expect(result.current).toBe(false));
  });
});
