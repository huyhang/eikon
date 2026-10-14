/** Ordered schema migrations; the index + 1 is stored in PRAGMA user_version. Never edit a shipped entry. */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE groups (
    id   INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('illustrator', 'collection')),
    name TEXT NOT NULL,
    UNIQUE (kind, name)
  );

  -- AUTOINCREMENT so ids are never reused: media URLs are cached forever by id.
  CREATE TABLE images (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    hash         TEXT NOT NULL UNIQUE,
    width        INTEGER NOT NULL,
    height       INTEGER NOT NULL,
    format       TEXT NOT NULL,
    animated     INTEGER NOT NULL DEFAULT 0,
    size_bytes   INTEGER NOT NULL,
    placeholder  TEXT NOT NULL,
    added_at     INTEGER NOT NULL,
    rating       INTEGER,
    tag_status   TEXT NOT NULL DEFAULT 'pending' CHECK (tag_status IN ('pending', 'done', 'failed')),
    tag_attempts INTEGER NOT NULL DEFAULT 0,
    tag_error    TEXT,
    next_tag_at  INTEGER NOT NULL DEFAULT 0,
    tagged_at    INTEGER,
    tagger_model TEXT
  );
  CREATE INDEX images_added ON images (added_at DESC, id DESC);
  CREATE INDEX images_tag_queue ON images (tag_status, next_tag_at);

  CREATE TABLE files (
    id         INTEGER PRIMARY KEY,
    path       TEXT NOT NULL UNIQUE,
    image_id   INTEGER NOT NULL REFERENCES images (id) ON DELETE CASCADE,
    group_id   INTEGER NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
    size_bytes INTEGER NOT NULL,
    mtime_ms   INTEGER NOT NULL,
    seen_scan  INTEGER NOT NULL
  );
  CREATE INDEX files_image ON files (image_id);
  CREATE INDEX files_group ON files (group_id, image_id);

  CREATE TABLE tags (
    id       INTEGER PRIMARY KEY,
    name     TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL
  );

  -- source = 'removed' remembers a tag the user deleted so re-tagging never brings it back.
  CREATE TABLE image_tags (
    image_id   INTEGER NOT NULL REFERENCES images (id) ON DELETE CASCADE,
    tag_id     INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
    source     TEXT NOT NULL CHECK (source IN ('auto', 'manual', 'removed')),
    confidence REAL,
    PRIMARY KEY (image_id, tag_id)
  ) WITHOUT ROWID;
  CREATE INDEX image_tags_tag ON image_tags (tag_id, image_id);

  CREATE TABLE favorites (
    image_id   INTEGER PRIMARY KEY REFERENCES images (id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE saved_searches (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    query      TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];
