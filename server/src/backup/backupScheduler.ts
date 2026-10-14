import type { BackupInfo } from '@eikon/shared';
import { BackgroundLoop } from '../util/backgroundLoop';
import type { Clock, Sleep } from '../util/clock';
import type { Logger } from '../util/logger';

const HOUR_MS = 60 * 60 * 1000;

/** The most recent moment the clock read `hour`:00 local time, at or before `now`. */
export function lastScheduledRun(now: number, hour: number): number {
  const at = new Date(now);
  at.setHours(hour, 0, 0, 0);
  if (at.getTime() > now) at.setDate(at.getDate() - 1);
  return at.getTime();
}

/** How long until the next `hour`:00 local time. */
export function msUntilNextRun(now: number, hour: number): number {
  const next = new Date(lastScheduledRun(now, hour));
  next.setDate(next.getDate() + 1);
  return next.getTime() - now;
}

/** Due when no backup has been made since the last scheduled time (e.g. the NAS was off at 3 a.m.). */
export function isBackupDue(now: number, hour: number, latest: BackupInfo | undefined): boolean {
  return !latest || latest.createdAt < lastScheduledRun(now, hour);
}

export interface BackupSource {
  backupNow(): BackupInfo;
  list(): BackupInfo[];
}

/** Makes a backup every day at a set hour, catching up at startup if one was missed. */
export class BackupScheduler {
  private readonly loop: BackgroundLoop;

  constructor(
    private readonly backups: BackupSource,
    private readonly hour: number,
    private readonly clock: Clock,
    sleep: Sleep,
    private readonly logger: Logger,
  ) {
    this.loop = new BackgroundLoop(async () => this.runIfDue(), sleep);
  }

  start(): void {
    this.loop.start();
  }

  stop(): void {
    this.loop.stop();
  }

  /** Exposed for tests; returns the delay until it should run again. */
  runIfDue(): number {
    const now = this.clock.now();
    if (isBackupDue(now, this.hour, this.backups.list()[0])) {
      try {
        const backup = this.backups.backupNow();
        this.logger.info({ backup: backup.name, bytes: backup.sizeBytes }, 'database backed up');
      } catch (error) {
        this.logger.error({ err: error }, 'database backup failed');
        return HOUR_MS; // try again soon rather than tomorrow
      }
    }
    return msUntilNextRun(now, this.hour);
  }
}
