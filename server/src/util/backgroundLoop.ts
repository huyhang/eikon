import type { Sleep } from './clock';

/**
 * Runs `iterate` repeatedly, pausing for the delay it returns. `wake()` ends the current pause, and a
 * wake that arrives while an iteration is running is remembered, so the next pause is skipped instead
 * of the request being lost.
 */
export class BackgroundLoop {
  private controller: AbortController | null = null;
  private wakeController = new AbortController();
  private wakePending = false;

  constructor(
    private readonly iterate: () => Promise<number>,
    private readonly sleep: Sleep,
  ) {}

  get running(): boolean {
    return this.controller !== null;
  }

  start(): void {
    if (this.controller) return;
    this.controller = new AbortController();
    void this.loop(this.controller.signal);
  }

  stop(): void {
    this.controller?.abort();
    this.controller = null;
    this.wakeController.abort();
  }

  wake(): void {
    this.wakePending = true;
    this.wakeController.abort();
  }

  private async loop(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const delay = await this.iterate();
      if (signal.aborted) break;
      await this.pause(delay, signal);
    }
  }

  private async pause(delay: number, signal: AbortSignal): Promise<void> {
    if (delay <= 0) return;
    if (this.wakePending) {
      this.wakePending = false;
      return;
    }
    this.wakeController = new AbortController();
    await this.sleep(delay, AbortSignal.any([signal, this.wakeController.signal]));
    this.wakePending = false;
  }
}
