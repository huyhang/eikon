import type { ImageQuery, ImageTile, TagStatus } from '@eikon/shared';
import { imageOrder, imageWhere, ratingCondition, type Thresholds } from '../search/imageFilter';
import type { Database } from './database';
import { TILE_COLUMNS, toTile, type TileRow } from './rows';
import { sql, whereAll } from './sql';

export interface NewImage {
  hash: string;
  width: number;
  height: number;
  format: string;
  animated: boolean;
  sizeBytes: number;
  placeholder: string;
  addedAt: number;
}

export interface ImageRecord extends TileRow {
  hash: string;
  format: string;
  animated: number;
  size_bytes: number;
  added_at: number;
  tag_status: TagStatus;
}

export class ImageRepository {
  constructor(private readonly db: Database) {}

  findIdByHash(hash: string): number | undefined {
    return this.db.get<{ id: number }>('SELECT id FROM images WHERE hash = ?', hash)?.id;
  }

  insert(image: NewImage): number {
    return this.db.run(
      `INSERT INTO images (hash, width, height, format, animated, size_bytes, placeholder, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      image.hash,
      image.width,
      image.height,
      image.format,
      image.animated ? 1 : 0,
      image.sizeBytes,
      image.placeholder,
      image.addedAt,
    ).lastInsertRowid;
  }

  /** Keeps added_at at the earliest time any copy of the image was seen. */
  touchAddedAt(id: number, addedAt: number): void {
    this.db.run('UPDATE images SET added_at = min(added_at, ?) WHERE id = ?', addedAt, id);
  }

  get(id: number): ImageRecord | undefined {
    return this.db.get<ImageRecord>(
      `SELECT ${TILE_COLUMNS}, i.hash, i.format, i.animated, i.size_bytes, i.added_at, i.tag_status
       FROM images i WHERE i.id = ?`,
      id,
    );
  }

  hashOf(id: number): string | undefined {
    return this.db.get<{ hash: string }>('SELECT hash FROM images WHERE id = ?', id)?.hash;
  }

  list(query: ImageQuery, thresholds: Thresholds): { total: number; tiles: ImageTile[] } {
    const where = imageWhere(query, thresholds);
    const order = imageOrder(query.sort, query.seed);
    const limit = query.limit ?? -1;
    const rows = this.db.all<TileRow>({
      text: `SELECT ${TILE_COLUMNS} FROM images i WHERE ${where.text} ORDER BY ${order.text} LIMIT ?`,
      params: [...where.params, ...order.params, limit],
    });
    const total =
      query.limit === undefined
        ? rows.length
        : (this.db.get<{ n: number }>({
            text: `SELECT count(*) AS n FROM images i WHERE ${where.text}`,
            params: where.params,
          })?.n ?? 0);
    return { total, tiles: rows.map(toTile) };
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

  /** Deletes images no file points at any more; returns their hashes so thumbnails can go too. */
  deleteOrphans(): string[] {
    const orphans = this.db.all<{ id: number; hash: string }>(
      'SELECT id, hash FROM images WHERE NOT EXISTS (SELECT 1 FROM files f WHERE f.image_id = images.id)',
    );
    this.db.transaction(() => orphans.forEach((o) => this.db.run('DELETE FROM images WHERE id = ?', o.id)));
    return orphans.map((o) => o.hash);
  }

  /** Used by a scan to drop rows whose thumbnails could not be produced. */
  delete(id: number): void {
    this.db.run(sql('DELETE FROM images WHERE id = ?', id));
  }
}
