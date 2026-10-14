import { vi } from 'vitest';
import type { SyncResult } from '../offline/favoritesSync';
import type { OfflineService, SyncOptions } from '../offline/offlineService';

/** An offline service that "saves" instantly; the mocks record what the app asked for. */
export function createFakeOffline(result: SyncResult = { favorites: 3, saved: 3, failed: 0 }) {
  return {
    supported: true,
    enable: vi.fn(async () => {}),
    disable: vi.fn(async () => {}),
    sync: vi.fn(async (_listUrl: string, options?: SyncOptions) => {
      options?.onProgress?.({ done: 0, total: 9 });
      return result;
    }),
    usage: vi.fn(async (): Promise<number | null> => 5_000_000),
  } satisfies OfflineService;
}
