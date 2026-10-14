import { describe, expect, it } from 'vitest';
import { ScanScheduler } from '../src/library/scanScheduler';
import type { Logger } from '../src/util/logger';
import { flush, ManualSleep } from './support/manualSleep';

function recordingLogger() {
  const warnings: string[] = [];
  const logger = {
    info() {},
    debug() {},
    error() {},
    warn: (_obj: unknown, msg?: string) => warnings.push(msg ?? ''),
    child: () => logger,
  } as unknown as Logger;
  return { logger, warnings };
}

describe('ScanScheduler', () => {
  it('scans at startup, then waits the interval', async () => {
    const sleep = new ManualSleep();
    let scans = 0;
    const scheduler = new ScanScheduler(
      async () => void (scans += 1),
      300_000,
      sleep.sleep,
      recordingLogger().logger,
    );
    scheduler.start();
    await flush();
    expect(scans).toBe(1);
    expect(sleep.delays).toEqual([300_000]);
    scheduler.stop();
  });

  it.each([
    { when: 'while idle', duringScan: false },
    { when: 'while a scan is running', duringScan: true },
  ])('a scan requested $when runs without waiting for the interval', async ({ duringScan }) => {
    const sleep = new ManualSleep();
    let scans = 0;
    let finishScan: () => void = () => {};
    const scan = () =>
      new Promise<void>((resolve) => {
        scans += 1;
        finishScan = resolve;
      });
    const scheduler = new ScanScheduler(scan, 3_600_000, sleep.sleep, recordingLogger().logger);
    scheduler.start();
    await flush();
    if (duringScan) scheduler.requestScan();
    finishScan();
    await flush();
    if (!duringScan) scheduler.requestScan();
    await flush();
    expect(scans).toBe(2);
    scheduler.stop();
  });

  it('logs a failed scan and keeps scheduling', async () => {
    const sleep = new ManualSleep();
    const { logger, warnings } = recordingLogger();
    let scans = 0;
    const scheduler = new ScanScheduler(
      async () => {
        scans += 1;
        throw new Error('library unavailable');
      },
      1000,
      sleep.sleep,
      logger,
    );
    scheduler.start();
    await flush();
    sleep.releaseAll();
    await flush();
    expect(scans).toBe(2);
    expect(warnings).toEqual(['scheduled scan failed', 'scheduled scan failed']);
    scheduler.stop();
  });
});
