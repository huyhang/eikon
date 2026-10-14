import { vi } from 'vitest';
import { AuthService } from '../../src/auth/authService';
import { LoginThrottle } from '../../src/auth/loginThrottle';
import { SessionSigner } from '../../src/auth/session';
import { buildApp } from '../../src/http/app';
import type { AppDeps } from '../../src/http/deps';
import { createTestRepos } from './fixtures';
import { FakeClock, MemoryLibrary, MemoryThumbnails } from './fakes';

export async function createTestApp(options: { passcode?: string; webDistDir?: string } = {}) {
  const repos = createTestRepos();
  const clock = new FakeClock();
  const library = new MemoryLibrary();
  const thumbnails = new MemoryThumbnails();
  const scheduler = { requestScan: vi.fn() };
  const worker = {
    wake: vi.fn(),
    status: () => ({ ...repos.tagQueue.counts(), taggerOnline: true, taggerModel: 'fake' }),
  };
  const deps: AppDeps = {
    repos,
    auth: new AuthService(
      options.passcode,
      new SessionSigner('test', options.passcode ?? ''),
      new LoginThrottle(clock),
      clock,
    ),
    scanner: {
      status: () => ({ phase: 'idle' as const, processed: 0, total: 0, lastScanAt: null, lastError: null }),
    },
    scheduler,
    worker,
    thumbnails,
    library,
    clock,
    cookieSecure: false,
    webDistDir: options.webDistDir,
  };
  const app = await buildApp(deps, { logger: false });
  return { app, repos, library, thumbnails, scheduler, worker };
}
