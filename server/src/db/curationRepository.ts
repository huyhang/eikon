import { ratingLevel, type ImageQuery, type Rating } from '@eikon/shared';
import { ratingCondition } from '../search/imageFilter';
import type { Database } from './database';
import { whereAll } from './sql';

/** Hand-made decisions about images that aren't tags: rating overrides and review state. */
export class CurationRepository {
  constructor(private readonly db: Database) {}

  /** null hands the rating back to the tagger. */
  setRatingOverride(imageId: number, rating: Rating | null): void {
    this.db.run(
      'UPDATE images SET rating_override = ? WHERE id = ?',
      rating === null ? null : ratingLevel(rating),
      imageId,
    );
  }

  markReviewed(imageId: number, now: number): void {
    this.db.run('UPDATE images SET reviewed_at = ? WHERE id = ?', now, imageId);
  }

  /** Clears the review backlog, e.g. after first setup. */
  markAllReviewed(now: number): number {
    return this.db.run(
      "UPDATE images SET reviewed_at = ? WHERE tag_status = 'done' AND reviewed_at IS NULL",
      now,
    ).changes;
  }

  /** Tagged, unreviewed images, most recently tagged first. */
  reviewQueue(limit: number, maxRating?: ImageQuery['maxRating']): { total: number; ids: number[] } {
    const where = whereAll([
      { text: "i.tag_status = 'done' AND i.reviewed_at IS NULL", params: [] },
      ...ratingCondition(maxRating),
    ]);
    const total =
      this.db.get<{ n: number }>({
        text: `SELECT count(*) AS n FROM images i WHERE ${where.text}`,
        params: where.params,
      })?.n ?? 0;
    const ids = this.db
      .all<{ id: number }>({
        text: `SELECT i.id FROM images i WHERE ${where.text} ORDER BY i.tagged_at DESC, i.id DESC LIMIT ?`,
        params: [...where.params, limit],
      })
      .map((r) => r.id);
    return { total, ids };
  }

  /** Which of these ids exist. */
  existing(ids: number[]): number[] {
    if (ids.length === 0) return [];
    return this.db
      .all<{ id: number }>(`SELECT id FROM images WHERE id IN (${ids.map(() => '?').join(', ')})`, ...ids)
      .map((r) => r.id);
  }
}
