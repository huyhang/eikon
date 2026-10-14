import type { ImageQuery, ImageTag, TagCategory, TagCount } from '@eikon/shared';
import type { TaggerTag } from '@eikon/shared';
import { imageConditions, ratingCondition, visibleTag, type Thresholds } from '../search/imageFilter';
import type { Database } from './database';
import { joinSql, placeholders, sql, whereAll, type SqlFragment } from './sql';

interface TagCountRow {
  name: string;
  category: TagCategory;
  count: number;
}

const toTagCount = (r: TagCountRow): TagCount => ({ name: r.name, category: r.category, count: r.count });

/** Escapes LIKE wildcards so user input matches literally (ESCAPE '\'). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export class TagRepository {
  constructor(private readonly db: Database) {}

  ensure(name: string, category: TagCategory): number {
    this.db.run(
      'INSERT INTO tags (name, category) VALUES (?, ?) ON CONFLICT (name) DO NOTHING',
      name,
      category,
    );
    return this.db.get<{ id: number }>('SELECT id FROM tags WHERE name = ?', name)!.id;
  }

  forImage(imageId: number, thresholds: Thresholds): ImageTag[] {
    const visible = visibleTag(thresholds);
    const rows = this.db.all<{
      name: string;
      category: TagCategory;
      confidence: number | null;
      source: 'auto' | 'manual';
    }>({
      text: `SELECT t.name, t.category, it.confidence, it.source FROM image_tags it JOIN tags t ON t.id = it.tag_id
             WHERE it.image_id = ? AND (${visible.text})`,
      params: [imageId, ...visible.params],
    });
    return rows
      .map((r) => ({
        name: r.name,
        category: r.category,
        source: r.source,
        confidence: r.source === 'manual' ? null : r.confidence,
      }))
      .sort(compareImageTags);
  }

  /** Replaces automatic tags of an image, leaving manual and removed ones untouched. */
  replaceAuto(imageId: number, tags: TaggerTag[]): void {
    this.db.transaction(() => {
      this.db.run("DELETE FROM image_tags WHERE image_id = ? AND source = 'auto'", imageId);
      tags.forEach((tag) => {
        const tagId = this.ensure(tag.name, tag.category);
        this.db.run(
          `INSERT INTO image_tags (image_id, tag_id, source, confidence) VALUES (?, ?, 'auto', ?)
           ON CONFLICT (image_id, tag_id) DO UPDATE SET confidence = excluded.confidence`,
          imageId,
          tagId,
          tag.confidence,
        );
      });
    });
  }

  addManual(imageId: number, name: string, category: TagCategory): void {
    const tagId = this.ensure(name, category);
    this.db.run(
      `INSERT INTO image_tags (image_id, tag_id, source, confidence) VALUES (?, ?, 'manual', NULL)
       ON CONFLICT (image_id, tag_id) DO UPDATE SET source = 'manual'`,
      imageId,
      tagId,
    );
  }

  /** Marks the tag removed (rather than deleting the row) so automatic tagging never re-adds it. */
  remove(imageId: number, name: string): boolean {
    const tag = this.db.get<{ id: number }>('SELECT id FROM tags WHERE name = ?', name);
    if (!tag) return false;
    this.db.run(
      `INSERT INTO image_tags (image_id, tag_id, source, confidence) VALUES (?, ?, 'removed', NULL)
       ON CONFLICT (image_id, tag_id) DO UPDATE SET source = 'removed'`,
      imageId,
      tag.id,
    );
    return true;
  }

  suggest(
    input: string,
    limit: number,
    thresholds: Thresholds,
    maxRating?: ImageQuery['maxRating'],
  ): TagCount[] {
    if (!input) return [];
    const term = escapeLike(input);
    return this.counted(
      [sql("(t.name LIKE ? ESCAPE '\\' OR t.name LIKE ? ESCAPE '\\')", `${term}%`, `%\\_${term}%`)],
      thresholds,
      maxRating,
      sql("(t.name LIKE ? ESCAPE '\\') DESC, count DESC, t.name", `${term}%`),
      limit,
    );
  }

  top(limit: number, thresholds: Thresholds, maxRating?: ImageQuery['maxRating']): TagCount[] {
    return this.counted([], thresholds, maxRating, sql('count DESC, t.name'), limit);
  }

  /** Most common tags among the images matching a query, minus the query's own tags. */
  related(query: ImageQuery, limit: number, thresholds: Thresholds): TagCount[] {
    const own = [...(query.tags ?? []), ...(query.exclude ?? [])];
    return this.counted(
      [
        ...imageConditions(query, thresholds),
        ...(own.length ? [{ text: `t.name NOT IN (${placeholders(own.length)})`, params: own }] : []),
      ],
      thresholds,
      undefined,
      sql('count DESC, t.name'),
      limit,
    );
  }

  topInGroup(
    groupId: number,
    limit: number,
    thresholds: Thresholds,
    maxRating?: ImageQuery['maxRating'],
  ): TagCount[] {
    return this.counted(
      [sql('EXISTS (SELECT 1 FROM files f WHERE f.image_id = i.id AND f.group_id = ?)', groupId)],
      thresholds,
      maxRating,
      sql('count DESC, t.name'),
      limit,
    );
  }

  deleteUnused(): number {
    return this.db.run(
      'DELETE FROM tags WHERE NOT EXISTS (SELECT 1 FROM image_tags it WHERE it.tag_id = tags.id)',
    ).changes;
  }

  private counted(
    conditions: SqlFragment[],
    thresholds: Thresholds,
    maxRating: ImageQuery['maxRating'],
    order: SqlFragment,
    limit: number,
  ): TagCount[] {
    const where = whereAll([visibleTag(thresholds), ...ratingCondition(maxRating), ...conditions]);
    const query = joinSql(
      [
        sql(`SELECT t.name, t.category, count(*) AS count
             FROM image_tags it JOIN tags t ON t.id = it.tag_id JOIN images i ON i.id = it.image_id WHERE`),
        where,
        sql('GROUP BY t.id ORDER BY'),
        order,
        sql('LIMIT ?', limit),
      ],
      ' ',
    );
    return this.db.all<TagCountRow>(query).map(toTagCount);
  }
}

const CATEGORY_ORDER: TagCategory[] = ['artist', 'character', 'copyright', 'general', 'meta'];

/** Category order (artist → meta), then manual first, then confidence, then name. */
export function compareImageTags(a: ImageTag, b: ImageTag): number {
  return (
    CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
    (b.confidence ?? 2) - (a.confidence ?? 2) ||
    a.name.localeCompare(b.name)
  );
}
