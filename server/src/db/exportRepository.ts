import {
  ratingFromLevel,
  type CurationExport,
  type ExportedImage,
  type GroupKind,
  type TagCategory,
} from '@eikon/shared';
import type { Database } from './database';
import { placeholders } from './sql';

interface ImageRow {
  id: number;
  hash: string;
  width: number;
  height: number;
  format: string;
  added_at: number;
  rating: number | null;
  rating_override: number | null;
  reviewed_at: number | null;
}

const rating = (level: number | null) => (level === null ? null : ratingFromLevel(level));

/** Reads everything the curation export contains, in id-ordered pages so huge libraries stream. */
export class ExportRepository {
  constructor(private readonly db: Database) {}

  *images(pageSize = 500): Generator<ExportedImage> {
    for (let after = 0; ;) {
      const rows = this.db.all<ImageRow>(
        `SELECT id, hash, width, height, format, added_at, rating, rating_override, reviewed_at
         FROM images WHERE id > ? ORDER BY id LIMIT ?`,
        after,
        pageSize,
      );
      if (rows.length === 0) return;
      yield* this.withDetails(rows);
      after = rows.at(-1)!.id;
    }
  }

  tags(): CurationExport['tags'] {
    const rows = this.db.all<{ id: number; name: string; category: TagCategory }>(
      'SELECT id, name, category FROM tags ORDER BY name',
    );
    const aliases = this.db.all<{ tag_id: number; alias: string }>(
      'SELECT tag_id, alias FROM tag_aliases ORDER BY alias',
    );
    const implies = this.db.all<{ tag_id: number; name: string }>(
      'SELECT ti.tag_id, t.name FROM tag_implications ti JOIN tags t ON t.id = ti.implied_tag_id ORDER BY t.name',
    );
    return rows.map((t) => ({
      name: t.name,
      category: t.category,
      aliases: aliases.filter((a) => a.tag_id === t.id).map((a) => a.alias),
      implies: implies.filter((i) => i.tag_id === t.id).map((i) => i.name),
    }));
  }

  private withDetails(rows: ImageRow[]): ExportedImage[] {
    const ids = rows.map((r) => r.id);
    const inIds = placeholders(ids.length);
    const files = this.db.all<{ image_id: number; path: string; id: number; kind: GroupKind; name: string }>(
      `SELECT f.image_id, f.path, g.id, g.kind, g.name FROM files f JOIN groups g ON g.id = f.group_id
       WHERE f.image_id IN (${inIds}) ORDER BY f.path`,
      ...ids,
    );
    const tags = this.db.all<{
      image_id: number;
      name: string;
      category: TagCategory;
      source: 'auto' | 'manual' | 'removed';
      confidence: number | null;
    }>(
      `SELECT it.image_id, t.name, t.category, it.source, it.confidence FROM image_tags it
       JOIN tags t ON t.id = it.tag_id WHERE it.source <> 'implied' AND it.image_id IN (${inIds}) ORDER BY t.name`,
      ...ids,
    );
    const favorites = new Set(
      this.db
        .all<{ image_id: number }>(`SELECT image_id FROM favorites WHERE image_id IN (${inIds})`, ...ids)
        .map((r) => r.image_id),
    );
    return rows.map((r) => ({
      sha256: r.hash,
      width: r.width,
      height: r.height,
      format: r.format,
      addedAt: r.added_at,
      files: files
        .filter((f) => f.image_id === r.id)
        .map((f) => ({ path: f.path, group: { id: f.id, kind: f.kind, name: f.name } })),
      favorite: favorites.has(r.id),
      rating: rating(r.rating),
      ratingOverride: rating(r.rating_override),
      reviewedAt: r.reviewed_at,
      tags: tags
        .filter((t) => t.image_id === r.id)
        .map(({ name, category, source, confidence }) => ({ name, category, source, confidence })),
    }));
  }
}

export interface ExportSource {
  images(): Iterable<ExportedImage>;
  tags(): CurationExport['tags'];
  savedSearches(): CurationExport['savedSearches'];
}

/** The export as a stream of JSON text pieces: valid JSON once joined, never all in memory at once. */
export function* curationExportChunks(source: ExportSource, exportedAt: number): Generator<string> {
  const head = {
    format: 'eikon-curation',
    version: 1,
    exportedAt,
    tags: source.tags(),
    savedSearches: source.savedSearches(),
  };
  yield `${JSON.stringify(head).slice(0, -1)},"images":[`;
  let first = true;
  for (const image of source.images()) {
    yield `${first ? '' : ','}\n${JSON.stringify(image)}`;
    first = false;
  }
  yield '\n]}\n';
}
