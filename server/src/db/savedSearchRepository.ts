import type { SavedQuery, SavedSearch } from '@eikon/shared';
import type { Database } from './database';

interface SavedSearchRow {
  id: number;
  name: string;
  query: string;
  created_at: number;
}

const toSavedSearch = (r: SavedSearchRow): SavedSearch => ({
  id: r.id,
  name: r.name,
  query: JSON.parse(r.query) as SavedQuery,
  createdAt: r.created_at,
});

export class SavedSearchRepository {
  constructor(private readonly db: Database) {}

  list(): SavedSearch[] {
    return this.db
      .all<SavedSearchRow>('SELECT * FROM saved_searches ORDER BY created_at, id')
      .map(toSavedSearch);
  }

  create(name: string, query: SavedQuery, now: number): SavedSearch {
    const id = this.db.run(
      'INSERT INTO saved_searches (name, query, created_at) VALUES (?, ?, ?)',
      name,
      JSON.stringify(query),
      now,
    ).lastInsertRowid;
    return { id, name, query, createdAt: now };
  }

  delete(id: number): boolean {
    return this.db.run('DELETE FROM saved_searches WHERE id = ?', id).changes > 0;
  }
}
