import { formatBytes, pluralize } from '../core/format';
import type { SyncResult } from './favoritesSync';
import type { OfflineService } from './offlineService';

export type OfflineState =
  | { phase: 'off' }
  | { phase: 'syncing'; done: number; total: number }
  | { phase: 'ready'; result: SyncResult; usage: number | null }
  | { phase: 'error'; message: string };

/**
 * Runs one sync at a time. Requests that arrive mid-sync are merged into one more run afterwards
 * (with the latest list URL); stop() abandons the run in progress.
 */
export class SyncRunner {
  private pending: string | null = null;
  private running: Promise<void> | null = null;
  private controller: AbortController | null = null;

  constructor(
    private readonly offline: OfflineService,
    private readonly report: (state: OfflineState) => void,
  ) {}

  request(listUrl: string): void {
    this.pending = listUrl;
    this.running ??= this.loop();
  }

  /** Abandons any sync and waits for it to wind down, so nothing is written afterwards. */
  async stop(): Promise<void> {
    this.pending = null;
    this.controller?.abort();
    await this.running;
    this.report({ phase: 'off' });
  }

  private async loop(): Promise<void> {
    for (let url = this.pending; url !== null; url = this.pending) {
      this.pending = null;
      const controller = (this.controller = new AbortController());
      const { signal } = controller;
      this.report({ phase: 'syncing', done: 0, total: 0 });
      try {
        await this.offline.enable();
        const result = await this.offline.sync(url, {
          signal,
          onProgress: (progress) => !signal.aborted && this.report({ phase: 'syncing', ...progress }),
        });
        if (!signal.aborted) this.report({ phase: 'ready', result, usage: await this.offline.usage() });
      } catch (error) {
        if (!signal.aborted) this.report({ phase: 'error', message: messageOf(error) });
      }
    }
    this.running = null;
  }
}

function messageOf(error: unknown): string {
  if (error instanceof TypeError)
    return "Couldn't reach Eikon. Favorites will be saved when you're back online.";
  return error instanceof Error ? error.message : String(error);
}

/** One line for Settings describing where offline saving is at. */
export function describeOfflineState(state: OfflineState): string | undefined {
  switch (state.phase) {
    case 'off':
      return undefined;
    case 'syncing':
      return state.total === 0 ? 'Getting ready…' : `Saving… ${state.done} of ${state.total}`;
    case 'ready': {
      const { favorites, saved, failed } = state.result;
      const size = state.usage === null ? '' : ` · ${formatBytes(state.usage)} on this device`;
      if (failed === 0) return `${pluralize(favorites, 'favorite')} saved${size}`;
      return `${saved} of ${pluralize(favorites, 'favorite')} saved; ${failed} couldn't be saved${size}`;
    }
    case 'error':
      return state.message;
  }
}
