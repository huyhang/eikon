import type { ImageQuery, ImageTag, TagCategory, TagCount } from '@eikon/shared';
import type { TaggerTag } from '@eikon/shared';
import { imageConditions, ratingCondition, visibleTag, type Thresholds } from '../search/imageFilter';
import type { Database } from './database';
import type { ImpliedTags } from './impliedTags';
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
  constructor(
    private readonly db: Database,
    private readonly implied: ImpliedTags,
  ) {}

  /** The id of a tag by name or alias, if it exists. */
  idOf(name: string): number | undefined {
    return (
      this.db.get<{ id: number }>('SELECT id FROM tags WHERE name = ?', name)?.id ??
      this.db.get<{ tag_id: number }>('SELECT tag_id FROM tag_aliases WHERE alias = ?', name)?.tag_id
    );
  }

  /** The tag's id, creating it unless the name is an alias of an existing tag. */
  ensure(name: string, category: TagCategory): number {
    const existing = this.idOf(name);
    if (existing !== undefined) return existing;
    return this.db.run('INSERT INTO tags (name, category) VALUES (?, ?)', name, category).lastInsertRowid;
  }

  forImage(imageId: number, thresholds: Thresholds): ImageTag[] {
    const visible = visibleTag(thresholds);
    const rows = this.db.all<{
      name: string;
      category: TagCategory;
      confidence: number | null;
      source: 'auto' | 'manual' | 'implied';
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
      .toSorted(compareImageTags);
  }

  /**
   * Replaces automatic tags of an image, leaving manual and removed ones untouched. Tagger names that
   * are aliases land on their tag; an auto tag takes over a row that was only implied.
   */
  replaceAuto(imageId: number, tags: TaggerTag[]): void {
    this.db.transaction(() => {
      this.db.run("DELETE FROM image_tags WHERE image_id = ? AND source = 'auto'", imageId);
      for (const [tagId, confidence] of this.strongestById(tags)) {
        this.db.run(
          `INSERT INTO image_tags (image_id, tag_id, source, confidence) VALUES (?, ?, 'auto', ?)
           ON CONFLICT (image_id, tag_id) DO UPDATE SET confidence = excluded.confidence,
             source = CASE image_tags.source WHEN 'implied' THEN 'auto' ELSE image_tags.source END`,
          imageId,
          tagId,
          confidence,
        );
      }
      this.implied.recompute([imageId]);
    });
  }

  addManual(imageId: number, name: string, category: TagCategory): void {
    this.db.transaction(() => {
      this.setSource(imageId, this.ensure(name, category), 'manual');
      this.implied.recompute([imageId]);
    });
  }

  /** Marks the tag removed (rather than deleting the row) so neither tagging nor implications re-add it. */
  remove(imageId: number, name: string): boolean {
    const tagId = this.idOf(name);
    if (tagId === undefined) return false;
    this.db.transaction(() => {
      this.setSource(imageId, tagId, 'removed');
      this.implied.recompute([imageId]);
    });
    return true;
  }

  private setSource(imageId: number, tagId: number, source: 'manual' | 'removed'): void {
    this.db.run(
      `INSERT INTO image_tags (image_id, tag_id, source, confidence) VALUES (?, ?, ?, NULL)
       ON CONFLICT (image_id, tag_id) DO UPDATE SET source = excluded.source, confidence = NULL`,
      imageId,
      tagId,
      source,
    );
  }

  /** Several tagger names can be aliases of one tag; keep its highest confidence. */
  private strongestById(tags: TaggerTag[]): Map<number, number> {
    const result = new Map<number, number>();
    for (const tag of tags) {
      const id = this.ensure(tag.name, tag.category);
      result.set(id, Math.max(result.get(id) ?? 0, tag.confidence));
    }
    return result;
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
      [
        sql(
          "(t.name LIKE ? ESCAPE '\\' OR t.name LIKE ? ESCAPE '\\' OR " +
            "t.id IN (SELECT tag_id FROM tag_aliases WHERE alias LIKE ? ESCAPE '\\'))",
          `${term}%`,
          `%\\_${term}%`,
          `${term}%`,
        ),
      ],
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

  /** Drops tags no image uses, unless an alias or implication still refers to them. */
  deleteUnused(): number {
    return this.db.run(
      `DELETE FROM tags WHERE NOT EXISTS (SELECT 1 FROM image_tags it WHERE it.tag_id = tags.id)
         AND NOT EXISTS (SELECT 1 FROM tag_aliases a WHERE a.tag_id = tags.id)
         AND NOT EXISTS (SELECT 1 FROM tag_implications ti
                         WHERE ti.tag_id = tags.id OR ti.implied_tag_id = tags.id)`,
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
