import { describe, expect, it, vi } from 'vitest';
import { createFakeOffline } from '../test/fakeOffline';
import { describeOfflineState, SyncRunner, type OfflineState } from './syncRunner';

/** A sync that waits until released, to observe what happens while one is running. */
function gatedOffline() {
  const offline = createFakeOffline();
  const gates: (() => void)[] = [];
  offline.sync.mockImplementation(
    (_url, options) =>
      new Promise((resolve) =>
        gates.push(() => {
          if (!options?.signal?.aborted) options?.onProgress?.({ done: 9, total: 9 });
          resolve({ favorites: 3, saved: 3, failed: 0 });
        }),
      ),
  );
  const release = async () => {
    gates.shift()?.();
    await vi.waitFor(() => {});
  };
  return { offline, gates, release };
}

describe('SyncRunner', () => {
  it('merges requests made mid-sync into one more run with the latest list', async () => {
    const { offline, gates, release } = gatedOffline();
    const states: OfflineState[] = [];
    const runner = new SyncRunner(offline, (s) => states.push(s));
    runner.request('/a');
    await vi.waitFor(() => expect(gates).toHaveLength(1));
    runner.request('/b');
    runner.request('/c');
    await release();
    await vi.waitFor(() => expect(gates).toHaveLength(1));
    await release();
    await vi.waitFor(() => expect(states.at(-1)?.phase).toBe('ready'));
    expect(offline.sync.mock.calls.map(([url]) => url)).toEqual(['/a', '/c']);
  });

  it('stop() abandons the sync in progress and reports off', async () => {
    const { offline, gates, release } = gatedOffline();
    const states: OfflineState[] = [];
    const runner = new SyncRunner(offline, (s) => states.push(s));
    runner.request('/a');
    await vi.waitFor(() => expect(gates).toHaveLength(1));
    const stopped = runner.stop();
    expect(offline.sync.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    await release();
    await stopped;
    expect(states.map((s) => s.phase)).toEqual(['syncing', 'off']);
  });

  it.each([
    { error: new TypeError('Failed to fetch'), message: /Couldn't reach Eikon/ },
    { error: new Error("Couldn't load your favorites (401)."), message: /\(401\)/ },
  ])('reports $error.message as an error', async ({ error, message }) => {
    const offline = createFakeOffline();
    offline.sync.mockRejectedValue(error);
    const states: OfflineState[] = [];
    new SyncRunner(offline, (s) => states.push(s)).request('/a');
    await vi.waitFor(() =>
      expect(states.at(-1)).toEqual({ phase: 'error', message: expect.stringMatching(message) }),
    );
  });
});

describe('describeOfflineState', () => {
  it.each<[OfflineState, string | undefined]>([
    [{ phase: 'off' }, undefined],
    [{ phase: 'syncing', done: 0, total: 0 }, 'Getting ready…'],
    [{ phase: 'syncing', done: 4, total: 30 }, 'Saving… 4 of 30'],
    [
      { phase: 'ready', result: { favorites: 120, saved: 120, failed: 0 }, usage: 52_428_800 },
      '120 favorites saved · 50.0 MB on this device',
    ],
    [{ phase: 'ready', result: { favorites: 1, saved: 1, failed: 0 }, usage: null }, '1 favorite saved'],
    [
      { phase: 'ready', result: { favorites: 10, saved: 8, failed: 2 }, usage: null },
      "8 of 10 favorites saved; 2 couldn't be saved",
    ],
    [{ phase: 'error', message: 'Nope.' }, 'Nope.'],
  ])('%j → %s', (state, expected) => {
    expect(describeOfflineState(state)).toBe(expected);
  });
});
