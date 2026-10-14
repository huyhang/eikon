import { vi } from 'vitest';
import type { AuthStatus, ImageDetail, ImageTile, StatusResponse } from '@eikon/shared';
import type { ApiClient } from '../api/client';

export const sampleTile = (id: number, partial: Partial<ImageTile> = {}): ImageTile => ({
  id,
  width: 800,
  height: 1200,
  placeholder: btoa(String.fromCharCode(...Array.from({ length: 27 }, (_, i) => (i * 9) % 255))),
  rating: 'general',
  ...partial,
});

export const sampleDetail = (partial: Partial<ImageDetail> = {}): ImageDetail => ({
  ...sampleTile(1),
  format: 'png',
  animated: false,
  sizeBytes: 1_500_000,
  addedAt: new Date(2026, 0, 2).getTime(),
  files: [{ path: 'Illustrators/Mika/sky.png', group: { id: 3, kind: 'illustrator', name: 'Mika' } }],
  tags: [
    { name: 'blue_sky', category: 'general', confidence: 0.92, source: 'auto' },
    { name: 'my_note', category: 'general', confidence: null, source: 'manual' },
  ],
  favorite: false,
  tagStatus: 'done',
  ratingOverridden: false,
  reviewedAt: null,
  ...partial,
});

const DEFAULT_TEST_SETTINGS = { generalThreshold: 0.35, characterThreshold: 0.85, hideDuplicates: true };

export const idleStatus: StatusResponse = {
  scan: { phase: 'idle', processed: 0, total: 0, lastScanAt: null, lastError: null },
  tagging: {
    pending: 0,
    done: 10,
    failed: 0,
    total: 10,
    taggerOnline: true,
    taggerModel: 'wd-eva02-large-tagger-v3',
    embedModel: 'clip-vit-large-patch14',
    embeddingsPending: 0,
  },
};

/** An AuthStatus for an open (no passcode) server, with overrides. */
export function fakeAuthStatus(overrides: Partial<AuthStatus> = {}): AuthStatus {
  return {
    required: false,
    authenticated: true,
    passcode: false,
    numeric: false,
    method: 'open',
    user: null,
    ...overrides,
  };
}

/** Every method is a vi.fn with a harmless default; override per test. */
export function createFakeApi(overrides: Partial<ApiClient> = {}): ApiClient {
  const api: ApiClient = {
    authStatus: vi.fn(async () => fakeAuthStatus()),
    login: vi.fn(async () => ({ ok: true as const })),
    logout: vi.fn(async () => {}),
    mosaic: vi.fn(async () => []),
    home: vi.fn(async () => ({
      recent: [],
      illustrators: [],
      collections: [],
      rediscover: [],
      totals: { images: 0, illustrators: 0, collections: 0 },
    })),
    groups: vi.fn(async () => []),
    group: vi.fn(async () => {
      throw new Error('not stubbed');
    }),
    images: vi.fn(async () => ({ total: 0, tiles: [] })),
    image: vi.fn(async () => sampleDetail()),
    setFavorite: vi.fn(async () => {}),
    addTag: vi.fn(async () => sampleDetail()),
    removeTag: vi.fn(async () => sampleDetail()),
    suggestTags: vi.fn(async () => []),
    relatedTags: vi.fn(async () => []),
    topTags: vi.fn(async () => []),
    savedSearches: vi.fn(async () => []),
    createSavedSearch: vi.fn(async (req) => ({ id: 1, createdAt: 0, ...req })),
    deleteSavedSearch: vi.fn(async () => {}),
    status: vi.fn(async () => idleStatus),
    scan: vi.fn(async () => {}),
    failedImages: vi.fn(async () => []),
    retryFailed: vi.fn(async () => {}),
    retagAll: vi.fn(async () => {}),
    settings: vi.fn(async () => ({ ...DEFAULT_TEST_SETTINGS })),
    updateSettings: vi.fn(async (patch) => ({ ...DEFAULT_TEST_SETTINGS, ...patch })),
  };
  return { ...api, ...overrides };
}
