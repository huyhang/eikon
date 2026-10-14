import type { TagCategory, TagInfo } from '@eikon/shared';
import { visibleTag, type Thresholds } from '../search/imageFilter';
import type { Database } from './database';
import type { ImpliedTags } from './impliedTags';
import { placeholders } from './sql';
import { wouldCreateCycle } from './tagGraph';
import { escapeLike, type TagRepository } from './tagRepository';

/** A tag edit that can't be made, with the HTTP status that explains why. */
export class TagAdminError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

interface TagRow {
  id: number;
  name: string;
  category: TagCategory;
  count: number;
}

/** Precedence when two rows meet on one image (merging tags): what the user did beats what was inferred. */
const SOURCE_RANK = "CASE {s} WHEN 'manual' THEN 4 WHEN 'removed' THEN 3 WHEN 'auto' THEN 2 ELSE 1 END";
const rank = (column: string) => SOURCE_RANK.replace('{s}', column);

export interface TagListOptions {
  query?: string;
  limit: number;
  offset: number;
}

/** Renames, merges, recategorises tags and edits their aliases and implications. */
export class TagAdminRepository {
  constructor(
    private readonly db: Database,
    private readonly tags: TagRepository,
    private readonly implied: ImpliedTags,
  ) {}

  list(options: TagListOptions, thresholds: Thresholds): { total: number; tags: TagInfo[] } {
    const term = escapeLike(options.query ?? '');
    const match = `(t.name LIKE ? ESCAPE '\\' OR t.id IN (SELECT tag_id FROM tag_aliases WHERE alias LIKE ? ESCAPE '\\'))`;
    const params = [`%${term}%`, `%${term}%`];
    const total =
      this.db.get<{ n: number }>(`SELECT count(*) AS n FROM tags t WHERE ${match}`, ...params)?.n ?? 0;
    const rows = this.rows(
      `${match} ORDER BY count DESC, t.name LIMIT ? OFFSET ?`,
      [...params, options.limit, options.offset],
      thresholds,
    );
    return { total, tags: this.withRelations(rows) };
  }

  info(name: string, thresholds: Thresholds): TagInfo | undefined {
    const id = this.tags.idOf(name);
    if (id === undefined) return undefined;
    return this.withRelations(this.rows('t.id = ?', [id], thresholds))[0];
  }

  /** Renames a tag; a name that already belongs to another tag merges this tag into it. Returns the final name. */
  rename(name: string, newName: string): string {
    const id = this.require(name);
    const target = this.tags.idOf(newName);
    if (target !== undefined && target !== id) {
      this.merge(id, target);
      return this.nameOf(target);
    }
    const oldName = this.nameOf(id);
    if (oldName === newName) return newName;
    this.db.transaction(() => {
      this.db.run('DELETE FROM tag_aliases WHERE alias = ?', newName);
      this.db.run('UPDATE tags SET name = ? WHERE id = ?', newName, id);
      // The tagger keeps saying the old name; the alias makes it land here.
      this.db.run('INSERT OR IGNORE INTO tag_aliases (alias, tag_id) VALUES (?, ?)', oldName, id);
    });
    return newName;
  }

  setCategory(name: string, category: TagCategory): void {
    this.db.run('UPDATE tags SET category = ? WHERE id = ?', category, this.require(name));
  }

  addAlias(name: string, alias: string): void {
    const id = this.require(name);
    const existing = this.tags.idOf(alias);
    if (existing === id) return;
    if (existing !== undefined) {
      throw new TagAdminError(
        409,
        `“${alias}” is already a tag or alias. Rename it to “${this.nameOf(id)}” to merge them.`,
      );
    }
    this.db.run('INSERT INTO tag_aliases (alias, tag_id) VALUES (?, ?)', alias, id);
  }

  removeAlias(name: string, alias: string): void {
    const removed = this.db.run(
      'DELETE FROM tag_aliases WHERE alias = ? AND tag_id = ?',
      alias,
      this.require(name),
    );
    if (removed.changes === 0) throw new TagAdminError(404, `“${alias}” is not an alias of “${name}”.`);
  }

  addImplication(name: string, implies: string, category: TagCategory = 'general'): void {
    const from = this.require(name);
    const to = this.tags.ensure(implies, category);
    if (wouldCreateCycle(from, to, this.implied.graph())) {
      throw new TagAdminError(
        409,
        `“${implies}” already implies “${name}”, so this would go round in a circle.`,
      );
    }
    this.db.transaction(() => {
      this.db.run('INSERT OR IGNORE INTO tag_implications (tag_id, implied_tag_id) VALUES (?, ?)', from, to);
      this.implied.recompute(this.imagesAffectedBy(from));
    });
  }

  removeImplication(name: string, implies: string): void {
    const from = this.require(name);
    const to = this.tags.idOf(implies);
    this.db.transaction(() => {
      const affected = this.imagesAffectedBy(from);
      const removed = this.db.run(
        'DELETE FROM tag_implications WHERE tag_id = ? AND implied_tag_id = ?',
        from,
        to ?? -1,
      );
      if (removed.changes === 0) throw new TagAdminError(404, `“${name}” does not imply “${implies}”.`);
      this.implied.recompute(affected);
    });
  }

  private merge(fromId: number, toId: number): void {
    const fromName = this.nameOf(fromId);
    this.db.transaction(() => {
      const affected = this.implied.imagesWithAnyTag([fromId, toId]);
      this.db.run(
        `INSERT INTO image_tags (image_id, tag_id, source, confidence)
           SELECT image_id, ?, source, confidence FROM image_tags WHERE tag_id = ? AND source <> 'implied'
         ON CONFLICT (image_id, tag_id) DO UPDATE SET
           source = CASE WHEN ${rank('excluded.source')} > ${rank('image_tags.source')}
                         THEN excluded.source ELSE image_tags.source END,
           confidence = CASE WHEN excluded.source = 'auto' AND image_tags.source = 'auto'
                             THEN max(excluded.confidence, image_tags.confidence)
                             WHEN ${rank('excluded.source')} > ${rank('image_tags.source')}
                             THEN excluded.confidence ELSE image_tags.confidence END`,
        toId,
        fromId,
      );
      this.db.run('UPDATE tag_aliases SET tag_id = ? WHERE tag_id = ?', toId, fromId);
      this.db.run(
        `INSERT OR IGNORE INTO tag_implications (tag_id, implied_tag_id)
           SELECT ?, implied_tag_id FROM tag_implications WHERE tag_id = ? AND implied_tag_id <> ?`,
        toId,
        fromId,
        toId,
      );
      this.db.run(
        `INSERT OR IGNORE INTO tag_implications (tag_id, implied_tag_id)
           SELECT tag_id, ? FROM tag_implications WHERE implied_tag_id = ? AND tag_id <> ?`,
        toId,
        fromId,
        toId,
      );
      this.db.run('DELETE FROM tags WHERE id = ?', fromId); // cascades its rows and edges
      this.db.run('INSERT OR IGNORE INTO tag_aliases (alias, tag_id) VALUES (?, ?)', fromName, toId);
      this.implied.recompute(affected);
    });
  }

  /** Images whose implied tags change when implications of `tagId` change: those with it or anything implying it. */
  private imagesAffectedBy(tagId: number): number[] {
    const implying = new Set([tagId]);
    for (let frontier = [tagId]; frontier.length;) {
      const next = this.db
        .all<{ tag_id: number }>(
          `SELECT tag_id FROM tag_implications WHERE implied_tag_id IN (${placeholders(frontier.length)})`,
          ...frontier,
        )
        .map((r) => r.tag_id)
        .filter((id) => !implying.has(id));
      next.forEach((id) => implying.add(id));
      frontier = next;
    }
    return this.implied.imagesWithAnyTag([...implying]);
  }

  private rows(where: string, params: Array<string | number>, thresholds: Thresholds): TagRow[] {
    const visible = visibleTag(thresholds);
    return this.db.all<TagRow>(
      `SELECT t.id, t.name, t.category,
         (SELECT count(*) FROM image_tags it WHERE it.tag_id = t.id AND (${visible.text})) AS count
       FROM tags t WHERE ${where}`,
      ...visible.params,
      ...params,
    );
  }

  private withRelations(rows: TagRow[]): TagInfo[] {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const inIds = placeholders(ids.length);
    const aliases = this.db.all<{ tag_id: number; alias: string }>(
      `SELECT tag_id, alias FROM tag_aliases WHERE tag_id IN (${inIds}) ORDER BY alias`,
      ...ids,
    );
    const edges = this.db.all<{ tag_id: number; implied_tag_id: number; from_name: string; to_name: string }>(
      `SELECT ti.tag_id, ti.implied_tag_id, a.name AS from_name, b.name AS to_name
       FROM tag_implications ti JOIN tags a ON a.id = ti.tag_id JOIN tags b ON b.id = ti.implied_tag_id
       WHERE ti.tag_id IN (${inIds}) OR ti.implied_tag_id IN (${inIds}) ORDER BY b.name, a.name`,
      ...ids,
      ...ids,
    );
    return rows.map((r) => ({
      name: r.name,
      category: r.category,
      count: r.count,
      aliases: aliases.filter((a) => a.tag_id === r.id).map((a) => a.alias),
      implies: edges.filter((e) => e.tag_id === r.id).map((e) => e.to_name),
      impliedBy: edges.filter((e) => e.implied_tag_id === r.id).map((e) => e.from_name),
    }));
  }

  private require(name: string): number {
    const id = this.tags.idOf(name);
    if (id === undefined) throw new TagAdminError(404, `There is no tag “${name}”.`);
    return id;
  }

  private nameOf(id: number): string {
    return this.db.get<{ name: string }>('SELECT name FROM tags WHERE id = ?', id)!.name;
  }
}
