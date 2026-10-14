import { BackgroundLoop } from '../util/backgroundLoop';
import type { Sleep } from '../util/clock';
import type { Logger } from '../util/logger';

/** Runs a scan at startup, then every interval; on-demand requests start one now (or right after the running one). */
export class ScanScheduler {
  private readonly loop: BackgroundLoop;

  constructor(
    private readonly scan: () => Promise<unknown>,
    private readonly intervalMs: number,
    sleep: Sleep,
    private readonly logger: Logger,
  ) {
    this.loop = new BackgroundLoop(() => this.scanOnce(), sleep);
  }

  start(): void {
    this.loop.start();
  }

  stop(): void {
    this.loop.stop();
  }

  requestScan(): void {
    this.loop.wake();
  }

  private async scanOnce(): Promise<number> {
    await this.scan().catch((error) => this.logger.warn({ err: error }, 'scheduled scan failed'));
    return this.intervalMs;
  }
}
