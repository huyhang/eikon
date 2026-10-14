import {
  ratingLevel,
  strongestRating,
  type FailedImage,
  type TaggerResult,
  type TagStatus,
} from '@eikon/shared';
import type { Database } from './database';
import { TILE_COLUMNS, toTile, type TileRow } from './rows';
import type { TagRepository } from './tagRepository';

export interface QueueCounts {
  pending: number;
  done: number;
  failed: number;
  total: number;
}

/** The tagging queue is simply the images table's tag_status columns — persistent by construction. */
export class TagQueueRepository {
  constructor(
    private readonly db: Database,
    private readonly tags: TagRepository,
  ) {}

  /** Newest images first, so freshly added art gets tagged before the back catalogue. */
  nextBatch(now: number, limit: number): number[] {
    return this.db
      .all<{ id: number }>(
        `SELECT id FROM images WHERE tag_status = 'pending' AND next_tag_at <= ?
         ORDER BY added_at DESC, id DESC LIMIT ?`,
        now,
        limit,
      )
      .map((r) => r.id);
  }

  markTagged(imageId: number, result: TaggerResult, now: number): void {
    this.db.transaction(() => {
      this.tags.replaceAuto(imageId, result.tags);
      this.db.run(
        `UPDATE images SET rating = ?, tag_status = 'done', tag_attempts = 0, tag_error = NULL,
           next_tag_at = 0, tagged_at = ?, tagger_model = ? WHERE id = ?`,
        ratingLevel(strongestRating(result.rating)),
        now,
        result.model,
        imageId,
      );
    });
  }

  /**
   * Records a failed attempt and schedules a retry at `retryAt(attempt)`;
   * gives up (status 'failed') once maxAttempts is reached.
   */
  markFailed(
    imageId: number,
    error: string,
    retryAt: (attempt: number) => number,
    maxAttempts: number,
  ): TagStatus {
    const attempt =
      (this.db.get<{ n: number }>('SELECT tag_attempts AS n FROM images WHERE id = ?', imageId)?.n ?? 0) + 1;
    const status: TagStatus = attempt >= maxAttempts ? 'failed' : 'pending';
    this.db.run(
      'UPDATE images SET tag_attempts = ?, tag_error = ?, next_tag_at = ?, tag_status = ? WHERE id = ?',
      attempt,
      error,
      retryAt(attempt),
      status,
      imageId,
    );
    return status;
  }

  counts(): QueueCounts {
    const rows = this.db.all<{ tag_status: TagStatus; n: number }>(
      'SELECT tag_status, count(*) AS n FROM images GROUP BY tag_status',
    );
    const counts = { pending: 0, done: 0, failed: 0, total: 0 };
    rows.forEach((r) => {
      counts[r.tag_status] = r.n;
      counts.total += r.n;
    });
    return counts;
  }

  listFailed(limit: number): FailedImage[] {
    return this.db
      .all<TileRow & { tag_error: string | null; tag_attempts: number }>(
        `SELECT ${TILE_COLUMNS}, i.tag_error, i.tag_attempts FROM images i
         WHERE i.tag_status = 'failed' ORDER BY i.added_at DESC LIMIT ?`,
        limit,
      )
      .map((r) => ({ tile: toTile(r), error: r.tag_error ?? 'unknown error', attempts: r.tag_attempts }));
  }

  retryFailed(): number {
    return this.db.run(
      "UPDATE images SET tag_status = 'pending', tag_attempts = 0, next_tag_at = 0 WHERE tag_status = 'failed'",
    ).changes;
  }

  /** Re-queues everything; existing tags stay visible until each image is re-tagged. */
  retagAll(): number {
    return this.db.run(
      "UPDATE images SET tag_status = 'pending', tag_attempts = 0, next_tag_at = 0, tag_error = NULL",
    ).changes;
  }
}
