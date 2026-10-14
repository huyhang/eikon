import type { Database } from './database';
import { buildGraph, impliedBy, type ImplicationGraph } from './tagGraph';

interface TagRow {
  tag_id: number;
  source: 'auto' | 'manual' | 'removed' | 'implied';
  confidence: number | null;
}

/** Combines confidences of several implying tags: a hand-added one (null) wins, else the strongest. */
function strongest(a: number | null | undefined, b: number | null): number | null {
  if (a === undefined) return b;
  return a === null || b === null ? null : Math.max(a, b);
}

/** Derived 'implied' rows of image_tags: what an image's own tags imply, minus what the user removed. */
export function impliedRowsFor(rows: TagRow[], graph: ImplicationGraph): Map<number, number | null> {
  const blocked = new Set(rows.filter((r) => r.source !== 'implied').map((r) => r.tag_id));
  const implied = new Map<number, number | null>();
  for (const row of rows) {
    if (row.source !== 'auto' && row.source !== 'manual') continue;
    const confidence = row.source === 'manual' ? null : row.confidence;
    for (const tagId of impliedBy(row.tag_id, graph)) {
      if (!blocked.has(tagId)) implied.set(tagId, strongest(implied.get(tagId), confidence));
    }
  }
  return implied;
}

/** Keeps the materialised 'implied' tags of images in step with the implication graph. */
export class ImpliedTags {
  constructor(private readonly db: Database) {}

  graph(): ImplicationGraph {
    return buildGraph(
      this.db.all<{ tagId: number; impliedTagId: number }>(
        'SELECT tag_id AS tagId, implied_tag_id AS impliedTagId FROM tag_implications',
      ),
    );
  }

  recompute(imageIds: Iterable<number>): void {
    const graph = this.graph();
    this.db.transaction(() => {
      for (const imageId of imageIds) this.recomputeOne(imageId, graph);
    });
  }

  /** Images carrying any of these tags directly (not as implied or removed). */
  imagesWithAnyTag(tagIds: number[]): number[] {
    if (tagIds.length === 0) return [];
    return this.db
      .all<{ image_id: number }>(
        `SELECT DISTINCT image_id FROM image_tags WHERE source IN ('auto', 'manual')
         AND tag_id IN (${tagIds.map(() => '?').join(', ')})`,
        ...tagIds,
      )
      .map((r) => r.image_id);
  }

  private recomputeOne(imageId: number, graph: ImplicationGraph): void {
    const rows = this.db.all<TagRow>(
      'SELECT tag_id, source, confidence FROM image_tags WHERE image_id = ?',
      imageId,
    );
    this.db.run("DELETE FROM image_tags WHERE image_id = ? AND source = 'implied'", imageId);
    for (const [tagId, confidence] of impliedRowsFor(rows, graph)) {
      this.db.run(
        "INSERT INTO image_tags (image_id, tag_id, source, confidence) VALUES (?, ?, 'implied', ?)",
        imageId,
        tagId,
        confidence,
      );
    }
  }
}
