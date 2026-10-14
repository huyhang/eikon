import { describe, expect, it } from 'vitest';
import { BackgroundLoop } from '../src/util/backgroundLoop';
import { flush, ManualSleep } from './support/manualSleep';

/** An iteration that can be held open by the test, to wake the loop while it runs. */
function controllableIteration(delay: number) {
  let calls = 0;
  let finish: (() => void) | null = null;
  const iterate = () =>
    new Promise<number>((resolve) => {
      calls += 1;
      finish = () => resolve(delay);
    });
  return {
    iterate,
    calls: () => calls,
    finish: () => {
      finish?.();
      finish = null;
    },
  };
}

describe('BackgroundLoop', () => {
  it.each([
    { when: 'during the pause', wakeDuringIteration: false },
    { when: 'while an iteration is running', wakeDuringIteration: true },
  ])('a wake $when starts the next iteration without waiting', async ({ wakeDuringIteration }) => {
    const sleep = new ManualSleep();
    const work = controllableIteration(60_000);
    const loop = new BackgroundLoop(work.iterate, sleep.sleep);
    loop.start();
    await flush();
    if (wakeDuringIteration) loop.wake();
    work.finish();
    await flush();
    if (!wakeDuringIteration) loop.wake();
    await flush();
    expect(work.calls()).toBe(2);
    loop.stop();
  });

  it('a wake is consumed once, so later iterations wait their full delay again', async () => {
    const sleep = new ManualSleep();
    const work = controllableIteration(60_000);
    const loop = new BackgroundLoop(work.iterate, sleep.sleep);
    loop.start();
    await flush();
    loop.wake();
    work.finish(); // skips the pause because of the pending wake
    await flush();
    work.finish(); // this time it must sleep
    await flush();
    expect(work.calls()).toBe(2);
    expect(sleep.delays).toEqual([60_000]);
    loop.stop();
  });

  it.each([
    { delay: 0, expectedSleeps: 0 },
    { delay: -5, expectedSleeps: 0 },
    { delay: 30_000, expectedSleeps: 1 },
  ])('a returned delay of $delay ms sleeps $expectedSleeps time(s)', async ({ delay, expectedSleeps }) => {
    const sleep = new ManualSleep();
    let calls = 0;
    const loop = new BackgroundLoop(async () => {
      calls += 1;
      if (calls >= 2) loop.stop();
      return delay;
    }, sleep.sleep);
    loop.start();
    await flush();
    sleep.releaseAll();
    await flush();
    expect(sleep.delays).toHaveLength(expectedSleeps);
  });

  it('stop ends the loop and start is idempotent', async () => {
    const sleep = new ManualSleep();
    let calls = 0;
    const loop = new BackgroundLoop(async () => {
      calls += 1;
      return 1000;
    }, sleep.sleep);
    loop.start();
    loop.start();
    await flush();
    expect(loop.running).toBe(true);
    loop.stop();
    await flush();
    sleep.releaseAll();
    await flush();
    expect(calls).toBe(1);
    expect(loop.running).toBe(false);
  });
});
