import type { Sleep } from '../../src/util/clock';

/** A Sleep that only ends when aborted or released by the test, recording each requested delay. */
export class ManualSleep {
  delays: number[] = [];
  private releases: Array<() => void> = [];

  readonly sleep: Sleep = (ms, signal) =>
    new Promise<void>((resolve) => {
      this.delays.push(ms);
      if (signal?.aborted) return resolve();
      signal?.addEventListener('abort', () => resolve(), { once: true });
      this.releases.push(resolve);
    });

  /** Ends every pending sleep as if its delay had elapsed. */
  releaseAll(): void {
    this.releases.splice(0).forEach((resolve) => resolve());
  }
}

/** Lets pending promise callbacks run. */
export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
