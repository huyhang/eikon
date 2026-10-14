import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import type { CurationExport } from '@eikon/shared';
import {
  isBackupDue,
  lastScheduledRun,
  msUntilNextRun,
  BackupScheduler,
} from '../src/backup/backupScheduler';
import { backupFileName, BackupService } from '../src/backup/backupService';
import { curationExportChunks } from '../src/db/exportRepository';
import { parseBulkEdit } from '../src/http/routes/curate';
import { silentLogger } from '../src/util/logger';
import { createTestRepos, seedImage, THRESHOLDS } from './support/fixtures';
import { FakeClock } from './support/fakes';

describe('rating overrides', () => {
  it('replace the tagger rating everywhere it counts, and can be undone', () => {
    const repos = createTestRepos();
    const id = seedImage(repos, { tags: ['sky'], rating: 'explicit' });
    const safe = () => repos.images.list({ maxRating: 'general' }, THRESHOLDS).tiles.map((t) => t.id);
    expect(safe()).toEqual([]);
    repos.curation.setRatingOverride(id, 'general');
    expect(safe()).toEqual([id]);
    expect(repos.images.list({}, THRESHOLDS).tiles[0]?.rating).toBe('general');
    repos.curation.setRatingOverride(id, null);
    expect(repos.images.list({}, THRESHOLDS).tiles[0]?.rating).toBe('explicit');
  });

  it('survive re-tagging', () => {
    const repos = createTestRepos();
    const id = seedImage(repos, { tags: ['sky'], rating: 'explicit' });
    repos.curation.setRatingOverride(id, 'sensitive');
    seedImage(repos); // unrelated
    repos.tagQueue.markTagged(
      id,
      { model: 'm', rating: { general: 0, sensitive: 0, questionable: 0, explicit: 1 }, tags: [] },
      5,
    );
    expect(repos.images.list({}, THRESHOLDS).tiles.find((t) => t.id === id)?.rating).toBe('sensitive');
  });
});

describe('review queue', () => {
  it('lists tagged, unreviewed images, most recently tagged first', () => {
    const repos = createTestRepos();
    const a = seedImage(repos, { tags: ['a'] });
    const b = seedImage(repos, { tags: ['b'] });
    seedImage(repos); // not tagged: not reviewable yet
    repos.db.run('UPDATE images SET tagged_at = id');
    expect(repos.curation.reviewQueue(10)).toEqual({ total: 2, ids: [b, a] });
    repos.curation.markReviewed(b, 100);
    expect(repos.curation.reviewQueue(10)).toEqual({ total: 1, ids: [a] });
    expect(repos.curation.markAllReviewed(200)).toBe(1);
    expect(repos.curation.reviewQueue(10).total).toBe(0);
  });

  it('respects safe mode', () => {
    const repos = createTestRepos();
    seedImage(repos, { tags: ['a'], rating: 'explicit' });
    expect(repos.curation.reviewQueue(10, 'general').total).toBe(0);
  });
});

describe('parseBulkEdit', () => {
  it.each([
    { body: { ids: [1, 2, 2], addTags: ['sky'] }, expected: { ids: [1, 2], addTags: ['sky'] } },
    {
      body: { ids: [3], removeTags: ['Blue Sky'], favorite: false },
      expected: { ids: [3], removeTags: ['blue_sky'], favorite: false },
    },
    { body: null, expected: 'expected a JSON object' },
    { body: { ids: [] }, expected: 'ids must list 1–5000 images' },
    { body: { ids: [1.5] }, expected: 'ids must be positive integers' },
    { body: { ids: [1], addTags: 'sky' }, expected: 'addTags must be a list of tags' },
    { body: { ids: [1], favorite: 'yes' }, expected: 'favorite must be true or false' },
    { body: { ids: [1], addTags: ['  '] }, expected: 'nothing to change' },
  ])('$body → $expected', ({ body, expected }) => {
    expect(parseBulkEdit(body)).toEqual(expected);
  });
});

// Local-time schedule; build the instants with the local Date constructor so the test is TZ-independent.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();

describe('backups', () => {
  it('names files by UTC time so they sort', () => {
    expect(backupFileName(Date.UTC(2026, 9, 14, 3, 4, 5))).toBe('eikon-20261014-030405.db');
  });

  it('writes a readable copy of the database and keeps only the newest few', () => {
    const repos = createTestRepos();
    seedImage(repos, { hash: 'precious' });
    const dir = mkdtempSync(path.join(tmpdir(), 'eikon-bk-'));
    const clock = new FakeClock(Date.UTC(2026, 0, 1));
    const service = new BackupService(repos.db, dir, 2, clock);
    for (let i = 0; i < 3; i++) {
      service.backupNow();
      clock.advance(24 * 60 * 60 * 1000);
    }
    expect(readdirSync(dir).toSorted()).toEqual(['eikon-20260102-000000.db', 'eikon-20260103-000000.db']);
    const copy = new DatabaseSync(path.join(dir, 'eikon-20260103-000000.db'));
    expect(copy.prepare('SELECT hash FROM images').all()).toEqual([{ hash: 'precious' }]);
    copy.close();
    expect(service.list().map((b) => b.name)).toEqual([
      'eikon-20260103-000000.db',
      'eikon-20260102-000000.db',
    ]);
  });

  it.each(['../eikon.db', 'eikon-20260101-000000.db/../../x', 'session.key', 'eikon-29991231-000000.db'])(
    'pathOf refuses %s',
    (name) => {
      const service = new BackupService(
        createTestRepos().db,
        mkdtempSync(path.join(tmpdir(), 'eikon-bk-')),
        2,
        new FakeClock(),
      );
      expect(service.pathOf(name)).toBeUndefined();
    },
  );

  it.each([
    { label: 'after today’s slot', now: at(14, 9), expected: at(14, 3) },
    { label: 'before today’s slot', now: at(14, 1), expected: at(13, 3) },
    { label: 'exactly at the slot', now: at(14, 3), expected: at(14, 3) },
  ])('lastScheduledRun $label', ({ now, expected }) => {
    expect(lastScheduledRun(now, 3)).toBe(expected);
  });

  it('waits until the next slot', () => {
    expect(msUntilNextRun(at(14, 2, 30), 3)).toBe(30 * 60 * 1000);
  });

  it.each([
    { label: 'no backup yet', latest: undefined, due: true },
    { label: 'last backup before the slot (NAS was off)', latest: at(13, 3), due: true },
    { label: 'backup since the slot', latest: at(14, 3, 1), due: false },
  ])('isBackupDue: $label → $due', ({ latest, due }) => {
    const info = latest === undefined ? undefined : { name: 'x', sizeBytes: 1, createdAt: latest };
    expect(isBackupDue(at(14, 9), 3, info)).toBe(due);
  });

  it.each([
    {
      label: 'backs up when due',
      latest: undefined,
      fails: false,
      backups: 1,
      delay: msUntilNextRun(at(14, 9), 3),
    },
    {
      label: 'skips when not due',
      latest: at(14, 4),
      fails: false,
      backups: 0,
      delay: msUntilNextRun(at(14, 9), 3),
    },
    {
      label: 'retries within the hour after a failure',
      latest: undefined,
      fails: true,
      backups: 1,
      delay: 60 * 60 * 1000,
    },
  ])('scheduler $label', ({ latest, fails, backups, delay }) => {
    const backupNow = vi.fn(() => {
      if (fails) throw new Error('disk full');
      return { name: 'b', sizeBytes: 1, createdAt: at(14, 9) };
    });
    const list = () => (latest === undefined ? [] : [{ name: 'a', sizeBytes: 1, createdAt: latest }]);
    const scheduler = new BackupScheduler(
      { backupNow, list },
      3,
      new FakeClock(at(14, 9)),
      async () => {},
      silentLogger,
    );
    expect(scheduler.runIfDue()).toBe(delay);
    expect(backupNow).toHaveBeenCalledTimes(backups);
  });
});

describe('curation export', () => {
  it('streams valid JSON with images, curated tags and saved searches', () => {
    const repos = createTestRepos();
    const id = seedImage(repos, { hash: 'abc', tags: ['sky', 'cat'], rating: 'sensitive' });
    repos.tags.addManual(id, 'mine', 'general');
    repos.tags.remove(id, 'cat');
    repos.favorites.add(id, 1);
    repos.curation.setRatingOverride(id, 'general');
    repos.tagAdmin.addImplication('sky', 'outdoors');
    repos.savedSearches.create('Skies', { tags: ['sky'], exclude: [] }, 1);

    const text = [
      ...curationExportChunks(
        {
          images: () => repos.exports.images(2),
          tags: () => repos.exports.tags(),
          savedSearches: () => repos.savedSearches.list(),
        },
        42,
      ),
    ].join('');
    const parsed = JSON.parse(text) as CurationExport;
    expect(parsed).toMatchObject({ format: 'eikon-curation', version: 1, exportedAt: 42 });
    expect(parsed.savedSearches.map((s) => s.name)).toEqual(['Skies']);
    expect(parsed.tags.find((t) => t.name === 'sky')).toMatchObject({ implies: ['outdoors'] });
    expect(parsed.images).toHaveLength(1);
    expect(parsed.images[0]).toMatchObject({
      sha256: 'abc',
      favorite: true,
      rating: 'sensitive',
      ratingOverride: 'general',
    });
    expect(parsed.images[0]!.tags.map((t) => `${t.name}:${t.source}`).toSorted()).toEqual([
      'cat:removed',
      'mine:manual',
      'sky:auto',
    ]);
  });

  it.each([{ images: 0 }, { images: 5 }])('pages through $images image(s)', ({ images }) => {
    const repos = createTestRepos();
    for (let i = 0; i < images; i++) seedImage(repos);
    expect([...repos.exports.images(2)]).toHaveLength(images);
  });
});
