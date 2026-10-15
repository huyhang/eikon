import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  decodeTile,
  encodeVector,
  normalize,
  type DuplicatesResponse,
  type ImageListResponse,
} from '@eikon/shared';
import { TaggerUnavailableError } from '../src/tagging/taggerClient';
import { requiresSession } from '../src/http/app';
import { mimeTypeFor } from '../src/http/routes/media';
import { sanitizeSavedQuery } from '../src/http/routes/tags';
import { seedImage } from './support/fixtures';
import { createTestApp } from './support/testApp';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
let current: TestApp | undefined;

async function setup(options?: Parameters<typeof createTestApp>[0]) {
  current = await createTestApp(options);
  return current;
}

afterEach(async () => {
  await current?.app.close();
  current = undefined;
});

describe('requiresSession', () => {
  it.each([
    ['/api/home', true],
    ['/api/images?tag=a', true],
    ['/media/thumb/1/sm', true],
    ['/api/auth/status', false],
    ['/api/auth/login', false],
    ['/', false],
    ['/illustrators/3', false],
    ['/assets/index.js', false],
  ])('%s → %s', (url, expected) => {
    expect(requiresSession(url)).toBe(expected);
  });
});

describe('auth flow', () => {
  it('blocks the API without a session and unlocks it with the passcode', async () => {
    const { app } = await setup({ passcode: '1234' });
    expect((await app.inject('/api/home')).statusCode).toBe(401);
    expect((await app.inject('/api/auth/status')).json()).toEqual({
      required: true,
      authenticated: false,
      passcode: true,
      numeric: true,
      method: null,
      user: null,
    });

    const wrong = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { passcode: '0000' } });
    expect(wrong.statusCode).toBe(401);

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { passcode: '1234', remember: true },
    });
    expect(login.statusCode).toBe(204);
    const cookie = login.cookies.find((c) => c.name === 'eikon_session')!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
    expect(cookie.maxAge).toBe(400 * 24 * 60 * 60);

    const home = await app.inject({ url: '/api/home', cookies: { eikon_session: cookie.value } });
    expect(home.statusCode).toBe(200);
  });

  it('signs out every device', async () => {
    const { app } = await setup({ passcode: '1234' });
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { passcode: '1234' } });
    const cookies = { eikon_session: login.cookies.find((c) => c.name === 'eikon_session')!.value };
    expect((await app.inject({ method: 'POST', url: '/api/auth/sign-out-everywhere' })).statusCode).toBe(401);
    const out = await app.inject({ method: 'POST', url: '/api/auth/sign-out-everywhere', cookies });
    expect(out.statusCode).toBe(204);
    expect((await app.inject({ url: '/api/home', cookies })).statusCode).toBe(401);
  });

  it.each([
    { label: 'from the trusted proxy', remoteAddress: '127.0.0.1', status: 200 },
    { label: 'forged by another peer', remoteAddress: '100.64.0.9', status: 401 },
  ])('accepts tailnet identity headers only $label', async ({ remoteAddress, status }) => {
    const { app } = await setup({ tailscaleUsers: ['me@example.com'] });
    const headers = { 'tailscale-user-login': 'me@example.com', 'tailscale-user-name': 'Me' };
    expect((await app.inject({ url: '/api/home', headers, remoteAddress })).statusCode).toBe(status);
  });

  it('reports the tailnet user in the auth status', async () => {
    const { app } = await setup({ tailscaleUsers: ['*'] });
    const status = await app.inject({
      url: '/api/auth/status',
      headers: { 'tailscale-user-login': 'me@github' },
    });
    expect(status.json()).toMatchObject({
      authenticated: true,
      method: 'tailscale',
      user: { login: 'me@github' },
    });
  });

  it('answers 429 with retryAfterSeconds once locked out', async () => {
    const { app } = await setup({ passcode: '1234' });
    for (let i = 0; i < 4; i++)
      await app.inject({ method: 'POST', url: '/api/auth/login', payload: { passcode: 'x' } });
    const locked = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { passcode: 'x' } });
    expect(locked.statusCode).toBe(429);
    expect(locked.json()).toMatchObject({ retryAfterSeconds: 30 });
  });

  it('serves the lock-screen mosaic without a session', async () => {
    const { app, repos } = await setup({ passcode: '1234' });
    seedImage(repos);
    expect((await app.inject('/api/auth/mosaic')).json()).toEqual({ placeholders: ['AAAA'] });
  });
});

describe('browse', () => {
  it('home lists recent images, groups and totals, honouring safe mode', async () => {
    const { app, repos } = await setup();
    seedImage(repos, { rating: 'general', group: { kind: 'illustrator', name: 'Ana' } });
    seedImage(repos, { rating: 'explicit', group: { kind: 'collection', name: 'Mood' } });
    const all = (await app.inject('/api/home')).json();
    expect(all.recent).toHaveLength(2);
    expect(all.totals).toEqual({ images: 2, illustrators: 1, collections: 1 });
    const safe = (await app.inject('/api/home?maxRating=sensitive')).json();
    expect(safe.recent).toHaveLength(1);
    expect(safe.collections).toEqual([]);
    expect(safe.totals).toEqual({ images: 1, illustrators: 1, collections: 0 });
  });

  it('lists images as compact tuples filtered by tags', async () => {
    const { app, repos } = await setup();
    const sky = seedImage(repos, { tags: ['sky'], width: 300, height: 200 });
    seedImage(repos, { tags: ['sea'] });
    const body = (await app.inject('/api/images?tag=sky')).json() as ImageListResponse;
    expect(body.total).toBe(1);
    expect(decodeTile(body.tiles[0]!)).toMatchObject({ id: sky, width: 300, height: 200, rating: 'general' });
  });

  it('groups endpoints list and detail with top tags; unknown ids 404', async () => {
    const { app, repos } = await setup();
    seedImage(repos, { group: { kind: 'collection', name: 'Mood' }, tags: ['sky'] });
    const { groups } = (await app.inject('/api/groups?kind=collection&sort=count')).json();
    expect(groups.map((g: { name: string }) => g.name)).toEqual(['Mood']);
    const detail = (await app.inject(`/api/groups/${groups[0].id}`)).json();
    expect(detail.topTags).toEqual([{ name: 'sky', category: 'general', count: 1 }]);
    expect((await app.inject('/api/groups/999')).statusCode).toBe(404);
    expect((await app.inject('/api/groups/abc')).statusCode).toBe(404);
  });

  it('image detail includes files, tags and favourite state', async () => {
    const { app, repos } = await setup();
    const id = seedImage(repos, { tags: ['sky'], group: { kind: 'illustrator', name: 'Ana' } });
    const detail = (await app.inject(`/api/images/${id}`)).json();
    expect(detail).toMatchObject({
      id,
      favorite: false,
      tagStatus: 'done',
      animated: false,
      tags: [{ name: 'sky', source: 'auto' }],
      files: [{ group: { kind: 'illustrator', name: 'Ana' } }],
    });
  });
});

describe('curate', () => {
  it('favourites and unfavourites', async () => {
    const { app, repos } = await setup();
    const id = seedImage(repos);
    expect((await app.inject({ method: 'PUT', url: `/api/images/${id}/favorite` })).statusCode).toBe(204);
    expect((await app.inject('/api/images?favorites=1')).json().total).toBe(1);
    await app.inject({ method: 'DELETE', url: `/api/images/${id}/favorite` });
    expect((await app.inject('/api/images?favorites=1')).json().total).toBe(0);
    expect((await app.inject({ method: 'PUT', url: '/api/images/999/favorite' })).statusCode).toBe(404);
  });

  it('adds and removes tags, returning the updated detail', async () => {
    const { app, repos } = await setup();
    const id = seedImage(repos, { tags: ['sky'] });
    const added = await app.inject({
      method: 'POST',
      url: `/api/images/${id}/tags`,
      payload: { tag: 'Character: Hatsune Miku' },
    });
    expect(added.json().tags).toContainEqual({
      name: 'hatsune_miku',
      category: 'character',
      confidence: null,
      source: 'manual',
    });
    const removed = await app.inject({ method: 'DELETE', url: `/api/images/${id}/tags/sky` });
    expect(removed.json().tags.map((t: { name: string }) => t.name)).toEqual(['hatsune_miku']);
    const empty = await app.inject({ method: 'POST', url: `/api/images/${id}/tags`, payload: { tag: '  ' } });
    expect(empty.statusCode).toBe(400);
  });
});

describe('tags and saved searches', () => {
  it('suggests, ranks and relates tags', async () => {
    const { app, repos } = await setup();
    seedImage(repos, { tags: ['blue_sky', 'city'] });
    seedImage(repos, { tags: ['sky', 'city'] });
    expect(
      (await app.inject('/api/tags/suggest?q=Sky')).json().tags.map((t: { name: string }) => t.name),
    ).toEqual(['sky', 'blue_sky']);
    expect((await app.inject('/api/tags/top?limit=1')).json().tags[0].name).toBe('city');
    expect(
      (await app.inject('/api/tags/related?tag=sky')).json().tags.map((t: { name: string }) => t.name),
    ).toEqual(['city']);
  });

  it('creates, lists and deletes saved searches', async () => {
    const { app } = await setup();
    const created = await app.inject({
      method: 'POST',
      url: '/api/saved-searches',
      payload: { name: 'Cities', query: { tags: ['City'], exclude: [] } },
    });
    expect(created.json()).toMatchObject({ name: 'Cities', query: { tags: ['city'], exclude: [] } });
    expect((await app.inject('/api/saved-searches')).json().searches).toHaveLength(1);
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/saved-searches/${created.json().id}` })).statusCode,
    ).toBe(204);
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/saved-searches',
      payload: { name: 'x', query: {} },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it.each([
    [null, null],
    [{}, null],
    [
      { tags: ['A b'], exclude: [3] },
      { tags: ['a_b'], exclude: [] },
    ],
    [
      { tags: [], exclude: [], group: 2 },
      { tags: [], exclude: [], group: 2 },
    ],
    [{ tags: [], exclude: [], group: -1 }, null],
  ])('sanitizeSavedQuery(%j)', (input, expected) => {
    expect(sanitizeSavedQuery(input)).toEqual(expected);
  });
});

describe('system', () => {
  it('reports status, requests scans and manages the queue', async () => {
    const { app, repos, scheduler, worker } = await setup();
    const failed = seedImage(repos);
    repos.tagQueue.markFailed(failed, 'nope', () => 0, 1);
    expect((await app.inject('/api/status')).json().tagging).toMatchObject({ failed: 1, taggerOnline: true });
    expect((await app.inject({ method: 'POST', url: '/api/scan' })).statusCode).toBe(202);
    expect(scheduler.requestScan).toHaveBeenCalled();
    expect((await app.inject('/api/tagging/failed')).json().images).toHaveLength(1);
    await app.inject({ method: 'POST', url: '/api/tagging/retry-failed' });
    expect(repos.tagQueue.counts().failed).toBe(0);
    await app.inject({ method: 'POST', url: '/api/tagging/retag-all' });
    expect(worker.wake).toHaveBeenCalledTimes(2);
  });

  it('reads and validates settings updates', async () => {
    const { app } = await setup();
    const updated = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { generalThreshold: 0.5, characterThreshold: 7, hideDuplicates: false },
    });
    expect(updated.json()).toEqual({
      generalThreshold: 0.5,
      characterThreshold: 0.85,
      hideDuplicates: false,
    });
  });
});

const clipVector = (...v: number[]) => ({ model: 'clip', vector: encodeVector(normalize(v)) });

async function seeded() {
  const ctx = await setup();
  const { repos, similarity } = ctx;
  const ids = {
    sea: seedImage(repos, { tags: ['sea'] }),
    wave: seedImage(repos, { tags: ['wave'] }),
    city: seedImage(repos, { tags: ['city'] }),
    plain: seedImage(repos, { tags: ['plain'] }),
  };
  similarity.save(ids.sea, clipVector(1, 0));
  similarity.save(ids.wave, clipVector(0.8, 0.4));
  similarity.save(ids.city, clipVector(0, 1));
  return { ...ctx, ids };
}

const idsOf = (body: ImageListResponse) => body.tiles.map((t) => decodeTile(t).id);

describe('similar and describe search', () => {
  it('ranks images like another one', async () => {
    const { app, ids } = await seeded();
    const res = await app.inject(`/api/images?like=${ids.sea}`);
    expect(idsOf(res.json())).toEqual([ids.wave, ids.city]);
  });

  it('ranks images by description, filtered by tags', async () => {
    const { app, ids, embedText } = await seeded();
    const res = await app.inject('/api/images?q=stormy%20sea&tag=wave');
    expect(embedText).toHaveBeenCalledWith('stormy sea');
    expect(idsOf(res.json())).toEqual([ids.wave]);
  });

  it.each([
    {
      label: 'an image without an embedding',
      url: (ids: Record<string, number>) => `/api/images?like=${ids.plain}`,
      status: 409,
    },
    { label: 'a missing image', url: () => '/api/images?like=99999', status: 404 },
  ])('explains $label with $status', async ({ url, status }) => {
    const { app, ids } = await seeded();
    const res = await app.inject(url(ids));
    expect(res.statusCode).toBe(status);
    expect(res.json().error).toBeTruthy();
  });

  it('answers 503 when gpubox cannot embed the description', async () => {
    const { app, embedText } = await seeded();
    embedText.mockRejectedValueOnce(new TaggerUnavailableError('down'));
    expect((await app.inject('/api/images?q=sea')).statusCode).toBe(503);
  });

  it('lists duplicate clusters', async () => {
    const { app, repos } = await setup();
    const big = seedImage(repos, { width: 3000, height: 3000 });
    const small = seedImage(repos, { width: 300, height: 300 });
    repos.images.setDuplicates(new Map([[small, big]]));
    const body: DuplicatesResponse = (await app.inject('/api/duplicates')).json();
    expect(body.clusters.map((c) => [c.best.id, c.copies.map((x) => x.id)])).toEqual([[big, [small]]]);
  });
});

describe('media', () => {
  it('serves thumbnails and originals with immutable caching; missing ones 404', async () => {
    const { app, repos, thumbnails, library } = await setup();
    const id = seedImage(repos, { hash: 'abc', group: { kind: 'illustrator', name: 'Ana' } });
    await thumbnails.write('abc', {
      sm: Buffer.from('small'),
      md: Buffer.from('medium'),
      lg: Buffer.from('large'),
    });
    library.put('illustrator/Ana/abc-0.jpg', 'ORIGINAL');

    const thumb = await app.inject(`/media/thumb/${id}/sm`);
    expect(thumb.statusCode).toBe(200);
    expect(thumb.headers['content-type']).toBe('image/webp');
    expect(thumb.headers['cache-control']).toContain('immutable');
    expect(thumb.body).toBe('small');
    expect((await app.inject(`/media/thumb/${id}/md?v=2`)).body).toBe('medium');

    const original = await app.inject(`/media/original/${id}`);
    expect(original.headers['content-type']).toBe('image/jpeg');
    expect(original.body).toBe('ORIGINAL');

    expect((await app.inject(`/media/thumb/${id}/xl`)).statusCode).toBe(404);
    expect((await app.inject('/media/thumb/999/sm')).statusCode).toBe(404);
    library.files.clear();
    expect((await app.inject(`/media/original/${id}`)).statusCode).toBe(404);
  });

  it.each([
    ['a.JPG', 'image/jpeg'],
    ['a.avif', 'image/avif'],
    ['a.bin', 'application/octet-stream'],
  ])('mimeTypeFor(%s) → %s', (file, expected) => {
    expect(mimeTypeFor(file)).toBe(expected);
  });
});

describe('web app', () => {
  it('serves index.html for client routes and 404 JSON for unknown API paths', async () => {
    const dist = mkdtempSync(path.join(tmpdir(), 'eikon-web-'));
    writeFileSync(path.join(dist, 'index.html'), '<html>eikon</html>');
    mkdirSync(path.join(dist, 'assets'));
    writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log(1)');
    const { app } = await setup({ webDistDir: dist });
    const page = await app.inject('/illustrators/4');
    expect(page.body).toContain('eikon');
    expect(page.headers['cache-control']).toBe('no-cache');
    expect((await app.inject('/assets/app.js')).headers['cache-control']).toContain('immutable');
    expect((await app.inject('/api/nope')).statusCode).toBe(404);
  });
});

describe('curation routes', () => {
  it('overrides and resets a rating', async () => {
    const { app, repos } = await setup();
    const id = seedImage(repos, { tags: ['sky'], rating: 'explicit' });
    const set = await app.inject({
      method: 'PUT',
      url: `/api/images/${id}/rating`,
      payload: { rating: 'general' },
    });
    expect(set.json()).toMatchObject({ rating: 'general', ratingOverridden: true });
    const reset = await app.inject({
      method: 'PUT',
      url: `/api/images/${id}/rating`,
      payload: { rating: null },
    });
    expect(reset.json()).toMatchObject({ rating: 'explicit', ratingOverridden: false });
    const bad = await app.inject({
      method: 'PUT',
      url: `/api/images/${id}/rating`,
      payload: { rating: 'spicy' },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('serves the review queue and marks images reviewed', async () => {
    const { app, repos } = await setup();
    const id = seedImage(repos, { tags: ['sky'] });
    expect((await app.inject('/api/review')).json()).toMatchObject({
      total: 1,
      images: [{ id, reviewedAt: null }],
    });
    expect((await app.inject({ method: 'POST', url: `/api/images/${id}/reviewed` })).statusCode).toBe(204);
    expect((await app.inject('/api/review')).json()).toMatchObject({ total: 0, images: [] });
    seedImage(repos, { tags: ['more'] });
    expect((await app.inject({ method: 'POST', url: '/api/review/mark-all' })).json()).toEqual({ marked: 1 });
  });

  it('applies bulk edits to existing images only', async () => {
    const { app, repos } = await setup();
    const a = seedImage(repos, { tags: ['sky'] });
    const b = seedImage(repos, { tags: ['sky'] });
    const res = await app.inject({
      method: 'POST',
      url: '/api/images/bulk',
      payload: { ids: [a, b, 99999], addTags: ['character:miku'], removeTags: ['sky'], favorite: true },
    });
    expect(res.json()).toEqual({ updated: 2 });
    const detail = (await app.inject(`/api/images/${b}`)).json();
    expect(detail.favorite).toBe(true);
    expect(detail.tags.map((t: { name: string }) => t.name)).toEqual(['miku']);
    expect(
      (await app.inject({ method: 'POST', url: '/api/images/bulk', payload: { ids: [a] } })).statusCode,
    ).toBe(400);
  });
});

describe('tag manager routes', () => {
  it('lists, renames, aliases and implies tags', async () => {
    const { app, repos } = await setup();
    seedImage(repos, { tags: ['cat', 'kitten'] });
    const list = (await app.inject('/api/tags/manage?q=cat')).json();
    expect(list.tags.map((t: { name: string }) => t.name)).toEqual(['cat']);

    const renamed = await app.inject({
      method: 'PATCH',
      url: '/api/tags/manage/kitten',
      payload: { name: 'cat' },
    });
    expect(renamed.json()).toMatchObject({ name: 'cat', aliases: ['kitten'] });

    const implied = await app.inject({
      method: 'POST',
      url: '/api/tags/manage/cat/implications',
      payload: { implies: 'animal' },
    });
    expect(implied.json()).toMatchObject({ implies: ['animal'] });
    const loop = await app.inject({
      method: 'POST',
      url: '/api/tags/manage/animal/implications',
      payload: { implies: 'cat' },
    });
    expect(loop.statusCode).toBe(409);

    const aliased = await app.inject({
      method: 'POST',
      url: '/api/tags/manage/cat/aliases',
      payload: { alias: 'neko' },
    });
    expect(aliased.json().aliases).toEqual(['kitten', 'neko']);
    const unaliased = await app.inject({ method: 'DELETE', url: '/api/tags/manage/cat/aliases/neko' });
    expect(unaliased.json().aliases).toEqual(['kitten']);
    const unimplied = await app.inject({ method: 'DELETE', url: '/api/tags/manage/cat/implications/animal' });
    expect(unimplied.json().implies).toEqual([]);
  });

  it.each([
    {
      label: 'an unknown tag',
      method: 'GET' as const,
      url: '/api/tags/manage/nope',
      payload: undefined,
      status: 404,
    },
    {
      label: 'an empty new name',
      method: 'PATCH' as const,
      url: '/api/tags/manage/cat',
      payload: { name: ' ' },
      status: 400,
    },
    {
      label: 'an unknown category',
      method: 'PATCH' as const,
      url: '/api/tags/manage/cat',
      payload: { category: 'mood' },
      status: 400,
    },
    {
      label: 'an empty alias',
      method: 'POST' as const,
      url: '/api/tags/manage/cat/aliases',
      payload: { alias: '' },
      status: 400,
    },
  ])('rejects $label with $status', async ({ method, url, payload, status }) => {
    const { app, repos } = await setup();
    seedImage(repos, { tags: ['cat'] });
    expect((await app.inject({ method, url, payload })).statusCode).toBe(status);
  });
});

describe('backup and export routes', () => {
  it('creates, lists and downloads backups', async () => {
    const { app, repos } = await setup();
    seedImage(repos);
    const created = await app.inject({ method: 'POST', url: '/api/backups' });
    expect(created.statusCode).toBe(201);
    const { name } = created.json();
    expect((await app.inject('/api/backups')).json().backups.map((b: { name: string }) => b.name)).toEqual([
      name,
    ]);
    const download = await app.inject(`/api/backups/${name}`);
    expect(download.headers['content-disposition']).toContain(name);
    expect(download.rawPayload.subarray(0, 15).toString()).toBe('SQLite format 3');
    expect((await app.inject('/api/backups/..%2Feikon.db')).statusCode).toBe(404);
  });

  it('exports curation as a JSON attachment', async () => {
    const { app, repos } = await setup();
    seedImage(repos, { hash: 'abc', tags: ['sky'] });
    const res = await app.inject('/api/export');
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="eikon-curation-\d{4}-\d{2}-\d{2}\.json"/,
    );
    expect(res.json()).toMatchObject({ format: 'eikon-curation', images: [{ sha256: 'abc' }] });
  });
});
