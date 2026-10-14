import type { ScanStatus, TaggingStatus } from '@eikon/shared';
import type { AuthService } from '../auth/authService';
import type { Repositories } from '../db/repositories';
import type { LibrarySource } from '../library/librarySource';
import type { ThumbnailStore } from '../media/thumbnailStore';
import type { Clock } from '../util/clock';

/** Everything the HTTP layer needs, injected by the composition root (or a test). */
export interface AppDeps {
  repos: Repositories;
  auth: AuthService;
  scanner: { status(): ScanStatus };
  scheduler: { requestScan(): void };
  worker: { status(): TaggingStatus; wake(): void };
  thumbnails: ThumbnailStore;
  library: LibrarySource;
  clock: Clock;
  cookieSecure: boolean;
  webDistDir?: string;
}
