import type { ScanStatus, TaggingStatus } from '@eikon/shared';
import type { AuthService } from '../auth/authService';
import type { BackupService } from '../backup/backupService';
import type { TailscaleTrust } from '../auth/tailscaleIdentity';
import type { Repositories } from '../db/repositories';
import type { LibrarySource } from '../library/librarySource';
import type { ThumbnailStore } from '../media/thumbnailStore';
import type { SimilarityService } from '../similarity/similarityService';
import type { Clock } from '../util/clock';

/** Everything the HTTP layer needs, injected by the composition root (or a test). */
export interface AppDeps {
  repos: Repositories;
  auth: AuthService;
  /** Which proxies may assert a tailnet identity, and which users may sign in with one. */
  tailscale: TailscaleTrust;
  scanner: { status(): ScanStatus };
  scheduler: { requestScan(): void };
  worker: { status(): TaggingStatus; wake(): void };
  thumbnails: ThumbnailStore;
  backups: Pick<BackupService, 'backupNow' | 'list' | 'pathOf'>;
  similarity: Pick<SimilarityService, 'similarTo' | 'describe'>;
  library: LibrarySource;
  clock: Clock;
  cookieSecure: boolean;
  webDistDir?: string;
}
