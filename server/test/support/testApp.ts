import { vi } from 'vitest';
import { encodeVector, normalize } from '@eikon/shared';
import { AuthService } from '../../src/auth/authService';
import { LoginThrottle } from '../../src/auth/loginThrottle';
import { MemorySecretStore } from '../../src/auth/secretStore';
import { SessionSigner } from '../../src/auth/session';
import { buildApp } from '../../src/http/app';
import type { AppDeps } from '../../src/http/deps';
import { SimilarityService } from '../../src/similarity/similarityService';
import { createTestRepos } from './fixtures';
import { FakeClock, MemoryLibrary, MemoryThumbnails } from './fakes';

export interface TestAppOptions {
  passcode?: string;
  webDistDir?: string;
  tailscaleUsers?: string[];
}

export async function createTestApp(options: TestAppOptions = {}) {
  const repos = createTestRepos();
  const clock = new FakeClock();
  const library = new MemoryLibrary();
  const thumbnails = new MemoryThumbnails();
  const scheduler = { requestScan: vi.fn() };
  const worker = {
    wake: vi.fn(),
    status: () => ({
      ...repos.tagQueue.counts(),
      taggerOnline: true,
      taggerModel: 'fake',
      embedModel: 'clip',
      embeddingsPending: 0,
    }),
  };
  const embedText = vi.fn(async (_text: string) => ({
    model: 'clip',
    vector: encodeVector(normalize([1, 0])),
  }));
  const similarity = new SimilarityService(repos.embeddings, { embedText });
  const deps: AppDeps = {
    repos,
    auth: new AuthService({
      passcode: options.passcode,
      tailscaleSignIn: (options.tailscaleUsers ?? []).length > 0,
      signer: new SessionSigner('test', options.passcode ?? ''),
      secrets: new MemorySecretStore('test'),
      throttle: new LoginThrottle(clock),
      clock,
    }),
    // app.inject() connections come from 127.0.0.1.
    tailscale: { proxies: ['127.0.0.1'], users: options.tailscaleUsers ?? [] },
    scanner: {
      status: () => ({ phase: 'idle' as const, processed: 0, total: 0, lastScanAt: null, lastError: null }),
    },
    scheduler,
    worker,
    thumbnails,
    similarity,
    library,
    clock,
    cookieSecure: false,
    webDistDir: options.webDistDir,
  };
  const app = await buildApp(deps, { logger: false });
  return { app, repos, library, thumbnails, scheduler, worker, similarity, embedText };
}
