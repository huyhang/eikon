import type { Sleep } from '../util/clock';
import type { Logger } from '../util/logger';

/** Runs a scan at startup, then every interval; on-demand requests start one immediately. */
export class ScanScheduler {
  private controller: AbortController | null = null;
  private wake: AbortController = new AbortController();

  constructor(
    private readonly scan: () => Promise<unknown>,
    private readonly intervalMs: number,
    private readonly sleep: Sleep,
    private readonly logger: Logger,
  ) {}

  start(): void {
    if (this.controller) return;
    this.controller = new AbortController();
    void this.loop(this.controller.signal);
  }

  stop(): void {
    this.controller?.abort();
    this.wake.abort();
    this.controller = null;
  }

  /** Cuts the current wait short so a scan starts now (or right after the running one). */
  requestScan(): void {
    this.wake.abort();
  }

  private async loop(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      await this.scan().catch((error) => this.logger.warn({ err: error }, 'scheduled scan failed'));
      if (signal.aborted) break;
      this.wake = new AbortController();
      await this.sleep(this.intervalMs, AbortSignal.any([signal, this.wake.signal]));
    }
  }
}
