import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { Database } from '../src/db/database';
import { MIGRATIONS } from '../src/db/migrations';

function columnsOf(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

describe('migrations', () => {
  it('upgrades a version-1 database in place, keeping its data', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'eikon-db-')), 'eikon.db');
    const old = new DatabaseSync(file);
    old.exec(MIGRATIONS[0]!);
    old.exec('PRAGMA user_version = 1');
    old.exec(`INSERT INTO images (hash, width, height, format, size_bytes, placeholder, added_at)
              VALUES ('h1', 10, 20, 'png', 5, 'AAAA', 1)`);
    old.exec("INSERT INTO tags (name, category) VALUES ('sky', 'general')");
    old.exec("INSERT INTO image_tags (image_id, tag_id, source, confidence) VALUES (1, 1, 'manual', NULL)");
    old.close();

    Database.open(file).close();

    const upgraded = new DatabaseSync(file);
    expect((upgraded.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(
      MIGRATIONS.length,
    );
    expect(columnsOf(upgraded, 'images')).toEqual(expect.arrayContaining(['phash', 'dup_of']));
    expect(columnsOf(upgraded, 'image_embeddings')).toEqual(['image_id', 'model', 'vector']);
    expect(columnsOf(upgraded, 'images')).toEqual(expect.arrayContaining(['rating_override', 'reviewed_at']));
    expect(columnsOf(upgraded, 'tag_aliases')).toEqual(['alias', 'tag_id']);
    expect(columnsOf(upgraded, 'tag_implications')).toEqual(['tag_id', 'implied_tag_id']);
    expect(upgraded.prepare('SELECT hash, phash, dup_of FROM images').all()).toEqual([
      { hash: 'h1', phash: null, dup_of: null },
    ]);
    expect(upgraded.prepare('SELECT source FROM image_tags').all()).toEqual([{ source: 'manual' }]);
    upgraded.close();
  });

  it.each([{ opens: 1 }, { opens: 3 }])('is idempotent across $opens open(s)', ({ opens }) => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'eikon-db-')), 'eikon.db');
    for (let i = 0; i < opens; i++) Database.open(file).close();
    const db = new DatabaseSync(file);
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(
      MIGRATIONS.length,
    );
    db.close();
  });
});
