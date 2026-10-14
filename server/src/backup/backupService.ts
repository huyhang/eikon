import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import type { BackupInfo } from '@eikon/shared';
import type { Clock } from '../util/clock';

const NAME = /^eikon-(\d{8})-(\d{6})\.db$/;

/** "eikon-20261014-030000.db" (UTC), so names sort by time. */
export function backupFileName(now: number): string {
  const iso = new Date(now).toISOString();
  return `eikon-${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}.db`;
}

export interface Backupable {
  backupTo(file: string): void;
}

/** Point-in-time copies of eikon.db in the data folder, keeping the newest few. */
export class BackupService {
  constructor(
    private readonly db: Backupable,
    private readonly dir: string,
    private readonly keep: number,
    private readonly clock: Clock,
  ) {}

  backupNow(): BackupInfo {
    mkdirSync(this.dir, { recursive: true });
    const name = backupFileName(this.clock.now());
    const file = path.join(this.dir, name);
    rmSync(file, { force: true }); // two backups in the same second: keep the newer one
    this.db.backupTo(file);
    this.prune();
    return this.info(name);
  }

  /** Newest first. */
  list(): BackupInfo[] {
    let names: string[];
    try {
      names = readdirSync(this.dir).filter((n) => NAME.test(n));
    } catch {
      return []; // no backups folder yet
    }
    return names
      .toSorted()
      .toReversed()
      .map((n) => this.info(n));
  }

  /** Absolute path of a backup by name, or undefined for anything that isn't one (no path tricks). */
  pathOf(name: string): string | undefined {
    if (!NAME.test(name)) return undefined;
    return this.list().some((b) => b.name === name) ? path.join(this.dir, name) : undefined;
  }

  private prune(): void {
    for (const old of this.list().slice(this.keep)) rmSync(path.join(this.dir, old.name), { force: true });
  }

  private info(name: string): BackupInfo {
    const stat = statSync(path.join(this.dir, name));
    return { name, sizeBytes: stat.size, createdAt: Math.floor(stat.mtimeMs) };
  }
}
