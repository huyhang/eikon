import type { GroupRef } from '@eikon/shared';
import type { Database } from './database';

export interface KnownFile {
  path: string;
  imageId: number;
  sizeBytes: number;
  mtimeMs: number;
}

export interface FileUpsert {
  path: string;
  imageId: number;
  groupId: number;
  sizeBytes: number;
  mtimeMs: number;
  scanId: number;
}

export class FileRepository {
  constructor(private readonly db: Database) {}

  all(): Map<string, KnownFile> {
    const rows = this.db.all<{ path: string; image_id: number; size_bytes: number; mtime_ms: number }>(
      'SELECT path, image_id, size_bytes, mtime_ms FROM files',
    );
    return new Map(
      rows.map((r) => [
        r.path,
        { path: r.path, imageId: r.image_id, sizeBytes: r.size_bytes, mtimeMs: r.mtime_ms },
      ]),
    );
  }

  markSeen(paths: string[], scanId: number): void {
    this.db.transaction(() =>
      paths.forEach((p) => this.db.run('UPDATE files SET seen_scan = ? WHERE path = ?', scanId, p)),
    );
  }

  upsert(file: FileUpsert): void {
    this.db.run(
      `INSERT INTO files (path, image_id, group_id, size_bytes, mtime_ms, seen_scan) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (path) DO UPDATE SET image_id = excluded.image_id, group_id = excluded.group_id,
         size_bytes = excluded.size_bytes, mtime_ms = excluded.mtime_ms, seen_scan = excluded.seen_scan`,
      file.path,
      file.imageId,
      file.groupId,
      file.sizeBytes,
      file.mtimeMs,
      file.scanId,
    );
  }

  deleteNotSeen(scanId: number): number {
    return this.db.run('DELETE FROM files WHERE seen_scan <> ?', scanId).changes;
  }

  firstPathOf(imageId: number): string | undefined {
    return this.db.get<{ path: string }>(
      'SELECT path FROM files WHERE image_id = ? ORDER BY id LIMIT 1',
      imageId,
    )?.path;
  }

  refsOf(imageId: number): { path: string; group: GroupRef }[] {
    return this.db
      .all<{ path: string; id: number; kind: GroupRef['kind']; name: string }>(
        `SELECT f.path, g.id, g.kind, g.name FROM files f JOIN groups g ON g.id = f.group_id
         WHERE f.image_id = ? ORDER BY g.kind DESC, g.name`,
        imageId,
      )
      .map((r) => ({ path: r.path, group: { id: r.id, kind: r.kind, name: r.name } }));
  }
}
