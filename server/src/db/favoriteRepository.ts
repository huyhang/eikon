import type { Database } from './database';

export class FavoriteRepository {
  constructor(private readonly db: Database) {}

  add(imageId: number, now: number): void {
    this.db.run(
      'INSERT INTO favorites (image_id, created_at) VALUES (?, ?) ON CONFLICT DO NOTHING',
      imageId,
      now,
    );
  }

  remove(imageId: number): void {
    this.db.run('DELETE FROM favorites WHERE image_id = ?', imageId);
  }

  has(imageId: number): boolean {
    return this.db.get('SELECT 1 FROM favorites WHERE image_id = ?', imageId) !== undefined;
  }
}
