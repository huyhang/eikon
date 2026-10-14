import type { GroupKind, GroupSort, GroupSummary, ImageQuery } from '@eikon/shared';
import { ratingCondition } from '../search/imageFilter';
import type { Database } from './database';
import { TILE_COLUMNS, toTile, type TileRow } from './rows';
import { sql, whereAll, type SqlFragment } from './sql';

const COVERS_PER_GROUP = 4;

const ORDER: Record<GroupSort, string> = {
  name: 'g.name COLLATE NOCASE ASC',
  count: 'image_count DESC, g.name COLLATE NOCASE ASC',
  recent: 'latest_at DESC, g.name COLLATE NOCASE ASC',
};

interface GroupRow {
  id: number;
  kind: GroupKind;
  name: string;
  image_count: number;
  latest_at: number;
}

export interface GroupListOptions {
  kind?: GroupKind;
  id?: number;
  sort?: GroupSort;
  limit?: number;
  maxRating?: ImageQuery['maxRating'];
}

export class GroupRepository {
  constructor(private readonly db: Database) {}

  upsert(kind: GroupKind, name: string): number {
    this.db.run(
      'INSERT INTO groups (kind, name) VALUES (?, ?) ON CONFLICT (kind, name) DO NOTHING',
      kind,
      name,
    );
    const row = this.db.get<{ id: number }>('SELECT id FROM groups WHERE kind = ? AND name = ?', kind, name);
    if (!row) throw new Error(`group ${kind}/${name} vanished`);
    return row.id;
  }

  /** Groups with at least one visible image, each with up to four newest covers. */
  list(options: GroupListOptions): GroupSummary[] {
    const filter = whereAll([
      ...ratingCondition(options.maxRating),
      ...(options.kind ? [sql('g.kind = ?', options.kind)] : []),
      ...(options.id !== undefined ? [sql('g.id = ?', options.id)] : []),
    ]);
    const rows = this.db.all<GroupRow>({
      text: `SELECT g.id, g.kind, g.name, count(DISTINCT i.id) AS image_count, max(i.added_at) AS latest_at
             FROM groups g JOIN files f ON f.group_id = g.id JOIN images i ON i.id = f.image_id
             WHERE ${filter.text} GROUP BY g.id ORDER BY ${ORDER[options.sort ?? 'name']} LIMIT ?`,
      params: [...filter.params, options.limit ?? -1],
    });
    const covers = this.coversFor(
      rows.map((r) => r.id),
      options.maxRating,
    );
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      name: r.name,
      imageCount: r.image_count,
      latestAt: r.latest_at,
      covers: covers.get(r.id) ?? [],
    }));
  }

  get(id: number, maxRating?: ImageQuery['maxRating']): GroupSummary | undefined {
    return this.list({ id, maxRating })[0];
  }

  /** Groups of a kind with at least one image visible under the safe-mode rating. */
  count(kind: GroupKind, maxRating?: ImageQuery['maxRating']): number {
    const filter = whereAll([sql('g.kind = ?', kind), ...ratingCondition(maxRating)]);
    return (
      this.db.get<{ n: number }>({
        text: `SELECT count(DISTINCT g.id) AS n
               FROM groups g JOIN files f ON f.group_id = g.id JOIN images i ON i.id = f.image_id
               WHERE ${filter.text}`,
        params: filter.params,
      })?.n ?? 0
    );
  }

  deleteEmpty(): number {
    return this.db.run(
      'DELETE FROM groups WHERE NOT EXISTS (SELECT 1 FROM files f WHERE f.group_id = groups.id)',
    ).changes;
  }

  private coversFor(
    groupIds: number[],
    maxRating: ImageQuery['maxRating'],
  ): Map<number, ReturnType<typeof toTile>[]> {
    const result = new Map<number, ReturnType<typeof toTile>[]>();
    if (groupIds.length === 0) return result;
    const filter = whereAll([...ratingCondition(maxRating), inList('d.group_id', groupIds)]);
    const rows = this.db.all<TileRow & { group_id: number }>({
      text: `SELECT group_id, ${TILE_COLUMNS.replace(/i\./g, '')} FROM (
               SELECT d.group_id, ${TILE_COLUMNS}, row_number() OVER (
                 PARTITION BY d.group_id ORDER BY i.added_at DESC, i.id DESC) AS rn
               FROM (SELECT DISTINCT group_id, image_id FROM files) d JOIN images i ON i.id = d.image_id
               WHERE ${filter.text})
             WHERE rn <= ${COVERS_PER_GROUP}`,
      params: filter.params,
    });
    rows.forEach((row) => {
      const list = result.get(row.group_id) ?? [];
      list.push(toTile(row));
      result.set(row.group_id, list);
    });
    return result;
  }
}

function inList(column: string, values: number[]): SqlFragment {
  return { text: `${column} IN (${values.map(() => '?').join(', ')})`, params: values };
}
