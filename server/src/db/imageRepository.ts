import type { ImageQuery, ImageTile, TagStatus } from '@eikon/shared';
import { imageOrder, imageWhere, ratingCondition, type Thresholds } from '../search/imageFilter';
import type { Database } from './database';
import { TILE_COLUMNS, toTile, type TileRow } from './rows';
import { placeholders, sql, whereAll } from './sql';
import type { DuplicateCandidate } from '../library/duplicates';

export interface NewImage {
  hash: string;
  width: number;
  height: number;
  format: string;
  animated: boolean;
  sizeBytes: number;
  placeholder: string;
  addedAt: number;
  phash?: string | null;
  /** The THUMB_VERSION the image's thumbnails were made with. */
  thumbVersion: number;
}

/** Options for listing images beyond the query itself. */
export interface ListOptions extends Thresholds {
  /** Drop a smaller copy when the best copy of the same picture is in the same result. */
  hideDuplicates?: boolean;
}

export interface ImageRecord extends TileRow {
  hash: string;
  format: string;
  animated: number;
  size_bytes: number;
  added_at: number;
  tag_status: TagStatus;
  rating_override: number | null;
  reviewed_at: number | null;
}

export class ImageRepository {
  constructor(private readonly db: Database) {}

  findIdByHash(hash: string): number | undefined {
    return this.db.get<{ id: number }>('SELECT id FROM images WHERE hash = ?', hash)?.id;
  }

  insert(image: NewImage): number {
    return this.db.run(
      `INSERT INTO images
         (hash, width, height, format, animated, size_bytes, placeholder, added_at, phash, thumb_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      image.hash,
      image.width,
      image.height,
      image.format,
      image.animated ? 1 : 0,
      image.sizeBytes,
      image.placeholder,
      image.addedAt,
      image.phash ?? null,
      image.thumbVersion,
    ).lastInsertRowid;
  }

  /** Keeps added_at at the earliest time any copy of the image was seen. */
  touchAddedAt(id: number, addedAt: number): void {
    this.db.run('UPDATE images SET added_at = min(added_at, ?) WHERE id = ?', addedAt, id);
  }

  get(id: number): ImageRecord | undefined {
    return this.db.get<ImageRecord>(
      `SELECT ${TILE_COLUMNS}, i.hash, i.format, i.animated, i.size_bytes, i.added_at, i.tag_status,
         i.rating_override, i.reviewed_at
       FROM images i WHERE i.id = ?`,
      id,
    );
  }

  hashOf(id: number): string | undefined {
    return this.db.get<{ hash: string }>('SELECT hash FROM images WHERE id = ?', id)?.hash;
  }

  list(query: ImageQuery, options: ListOptions): { total: number; tiles: ImageTile[] } {
    const where = imageWhere(query, options);
    const order = imageOrder(query.sort, query.seed);
    const limit = query.limit ?? -1;
    const rows = this.db.all<TileRow & { dup_of: number | null }>({
      text: `SELECT ${TILE_COLUMNS}, i.dup_of FROM images i WHERE ${where.text} ORDER BY ${order.text} LIMIT ?`,
      params: [...where.params, ...order.params, limit],
    });
    const kept = options.hideDuplicates ? withoutSmallerCopies(rows) : rows;
    const total =
      query.limit === undefined
        ? kept.length
        : (this.db.get<{ n: number }>({
            text: `SELECT count(*) AS n FROM images i WHERE ${where.text}`,
            params: where.params,
          })?.n ?? 0);
    return { total, tiles: kept.map(toTile) };
  }

  /** Tiles for the given ids, in the given order (ids that no longer exist are skipped). */
  tilesByIds(ids: number[], options: ListOptions): ImageTile[] {
    if (ids.length === 0) return [];
    const rows = this.db.all<TileRow & { dup_of: number | null }>({
      text: `SELECT ${TILE_COLUMNS}, i.dup_of FROM images i WHERE i.id IN (${placeholders(ids.length)})`,
      params: ids,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids.flatMap((id) => byId.get(id) ?? []);
    return (options.hideDuplicates ? withoutSmallerCopies(ordered) : ordered).map(toTile);
  }

  /** Ids matching a query's filters (no order), for restricting a similarity ranking. */
  idsMatching(query: ImageQuery, thresholds: Thresholds): Set<number> {
    const where = imageWhere(query, thresholds);
    return new Set(
      this.db
        .all<{ id: number }>({ text: `SELECT i.id FROM images i WHERE ${where.text}`, params: where.params })
        .map((r) => r.id),
    );
  }

  missingPhash(limit: number): { id: number; hash: string }[] {
    return this.db.all('SELECT id, hash FROM images WHERE phash IS NULL ORDER BY id LIMIT ?', limit);
  }

  setPhash(id: number, phash: string): void {
    this.db.run('UPDATE images SET phash = ? WHERE id = ?', phash, id);
  }

  /** Images whose thumbnails were made before `version`, oldest first. */
  staleThumbnails(version: number, limit: number): { id: number; hash: string }[] {
    return this.db.all(
      'SELECT id, hash FROM images WHERE thumb_version < ? ORDER BY id LIMIT ?',
      version,
      limit,
    );
  }

  countStaleThumbnails(version: number): number {
    return (
      this.db.get<{ n: number }>('SELECT count(*) AS n FROM images WHERE thumb_version < ?', version)?.n ?? 0
    );
  }

  setThumbVersion(id: number, version: number): void {
    this.db.run('UPDATE images SET thumb_version = ? WHERE id = ?', version, id);
  }

  duplicateCandidates(): DuplicateCandidate[] {
    return this.db
      .all<{ id: number; phash: string; width: number; height: number; size_bytes: number }>(
        'SELECT id, phash, width, height, size_bytes FROM images WHERE length(phash) = 16',
      )
      .map((r) => ({ id: r.id, phash: r.phash, width: r.width, height: r.height, sizeBytes: r.size_bytes }));
  }

  /** Replaces all duplicate links: copy id → best copy id. Returns how many links changed. */
  setDuplicates(copies: Map<number, number>): number {
    const current = new Map(
      this.db
        .all<{ id: number; dup_of: number }>('SELECT id, dup_of FROM images WHERE dup_of IS NOT NULL')
        .map((r) => [r.id, r.dup_of]),
    );
    let changed = 0;
    this.db.transaction(() => {
      for (const [id] of current) {
        if (!copies.has(id))
          changed += this.db.run('UPDATE images SET dup_of = NULL WHERE id = ?', id).changes;
      }
      for (const [id, best] of copies) {
        if (current.get(id) !== best)
          changed += this.db.run('UPDATE images SET dup_of = ? WHERE id = ?', best, id).changes;
      }
    });
    return changed;
  }

  /** Duplicate clusters: each best copy with its smaller copies. */
  duplicateClusters(): { best: TileRow; copies: TileRow[] }[] {
    const rows = this.db.all<TileRow & { dup_of: number }>(
      `SELECT ${TILE_COLUMNS}, i.dup_of FROM images i WHERE i.dup_of IS NOT NULL ORDER BY i.dup_of, i.id`,
    );
    const bestIds = [...new Set(rows.map((r) => r.dup_of))];
    const best = new Map(
      this.db
        .all<TileRow>({
          text: `SELECT ${TILE_COLUMNS} FROM images i WHERE i.id IN (${placeholders(bestIds.length)})`,
          params: bestIds,
        })
        .map((r) => [r.id, r]),
    );
    return bestIds.flatMap((id) => {
      const head = best.get(id);
      return head ? [{ best: head, copies: rows.filter((r) => r.dup_of === id) }] : [];
    });
  }

  count(maxRating?: ImageQuery['maxRating']): number {
    const where = whereAll(ratingCondition(maxRating));
    return (
      this.db.get<{ n: number }>({
        text: `SELECT count(*) AS n FROM images i WHERE ${where.text}`,
        params: where.params,
      })?.n ?? 0
    );
  }

  /** Random placeholders for the lock screen — colours only. */
  randomPlaceholders(limit: number): string[] {
    return this.db
      .all<{ placeholder: string }>('SELECT placeholder FROM images ORDER BY random() LIMIT ?', limit)
      .map((r) => r.placeholder);
  }

  /** Deletes images no file points at any more; returns them so thumbnails and embeddings can go too. */
  deleteOrphans(): { id: number; hash: string }[] {
    const orphans = this.db.all<{ id: number; hash: string }>(
      'SELECT id, hash FROM images WHERE NOT EXISTS (SELECT 1 FROM files f WHERE f.image_id = images.id)',
    );
    this.db.transaction(() => orphans.forEach((o) => this.db.run('DELETE FROM images WHERE id = ?', o.id)));
    return orphans;
  }

  /** Used by a scan to drop rows whose thumbnails could not be produced. */
  delete(id: number): void {
    this.db.run(sql('DELETE FROM images WHERE id = ?', id));
  }
}

/** Drops rows whose best copy is also among the rows. */
export function withoutSmallerCopies<T extends { id: number; dup_of: number | null }>(rows: T[]): T[] {
  const present = new Set(rows.map((r) => r.id));
  return rows.filter((r) => r.dup_of === null || !present.has(r.dup_of));
}
