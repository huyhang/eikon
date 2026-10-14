import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { createFakeTaggerApp, type FakeTaggerOptions } from '../src/app';
import { colorTagsFor, colorThemeTag } from '../src/colorTags';
import { fakeConfidence, fakeRating, fakeTagResult, sample, seededRandom } from '../src/fakeTagging';

function app(overrides: Partial<FakeTaggerOptions> = {}) {
  return createFakeTaggerApp({
    latencyMs: 0,
    failureRate: 0,
    token: undefined,
    random: () => 0.5,
    sleep: async () => {},
    analyze: async () => [],
    maxBodyBytes: 1024,
    ...overrides,
  });
}

const tag = (a: ReturnType<typeof app>, headers: Record<string, string> = {}, payload = 'png-bytes') =>
  a.inject({ method: 'POST', url: '/v1/tag', headers: { 'content-type': 'image/png', ...headers }, payload });

describe('fakeTagResult', () => {
  it('is deterministic per image and differs between images', () => {
    const a = fakeTagResult(Buffer.from('a'));
    expect(fakeTagResult(Buffer.from('a'))).toEqual(a);
    expect(fakeTagResult(Buffer.from('b'))).not.toEqual(a);
  });

  it('produces plausible tags with unique names and valid confidences', () => {
    const { tags, rating, model } = fakeTagResult(Buffer.from('anything'));
    expect(model).toBe('fake-wd-tagger');
    expect(tags.length).toBeGreaterThanOrEqual(8);
    expect(new Set(tags.map((t) => t.name)).size).toBe(tags.length);
    tags.forEach((t) => {
      expect(t.confidence).toBeGreaterThan(0);
      expect(t.confidence).toBeLessThan(1);
    });
    expect(Object.keys(rating).sort()).toEqual(['explicit', 'general', 'questionable', 'sensitive']);
  });

  it('puts extra analysis tags first', () => {
    const extra = [{ name: 'blue_theme', category: 'general' as const, confidence: 0.9 }];
    expect(fakeTagResult(Buffer.from('x'), extra).tags[0]).toEqual(extra[0]);
  });
});

describe('helpers', () => {
  it.each([
    [0.1, 'general'],
    [0.8, 'sensitive'],
    [0.9, 'questionable'],
    [0.99, 'explicit'],
  ])('fakeRating with first roll %d picks %s', (roll, expected) => {
    let first = true;
    const scores = fakeRating(() => (first ? ((first = false), roll) : 0.5));
    const winner = Object.entries(scores).sort((x, y) => y[1] - x[1])[0]![0];
    expect(winner).toBe(expected);
  });

  it.each([
    [0, 0.89, 0.99],
    [5, 0.64, 0.74],
    [30, 0.15, 0.25],
  ])('fakeConfidence(rank %i) is within [%d, %d]', (rank, low, high) => {
    const value = fakeConfidence(rank, seededRandom(rank));
    expect(value).toBeGreaterThanOrEqual(low);
    expect(value).toBeLessThanOrEqual(high);
  });

  it('sample picks distinct items and stops at the pool size', () => {
    expect(new Set(sample([1, 2, 3], 3, seededRandom(1))).size).toBe(3);
    expect(sample([1, 2], 5, seededRandom(1))).toHaveLength(2);
  });

  it.each([
    [{ r: 10, g: 10, b: 20 }, 'dark'],
    [{ r: 240, g: 240, b: 235 }, 'white_theme'],
    [{ r: 120, g: 125, b: 130 }, 'greyscale'],
    [{ r: 220, g: 30, b: 30 }, 'red_theme'],
    [{ r: 230, g: 140, b: 20 }, 'orange_theme'],
    [{ r: 40, g: 180, b: 60 }, 'green_theme'],
    [{ r: 30, g: 80, b: 220 }, 'blue_theme'],
    [{ r: 140, g: 40, b: 220 }, 'purple_theme'],
    [{ r: 230, g: 60, b: 160 }, 'pink_theme'],
  ])('colorThemeTag(%j) → %s', (rgb, expected) => {
    expect(colorThemeTag(rgb)).toBe(expected);
  });

  it('colorTagsFor analyses a real image', async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#2050e0' } })
      .png()
      .toBuffer();
    expect((await colorTagsFor(png)).map((t) => t.name)).toEqual(['blue_theme']);
  });
});

describe('fake tagger HTTP', () => {
  it('reports health', async () => {
    expect((await app().inject('/health')).json()).toEqual({
      status: 'ok',
      model: 'fake-wd-tagger',
      device: 'fake-cpu',
    });
  });

  it('tags raw image bytes', async () => {
    const response = await tag(app());
    expect(response.statusCode).toBe(200);
    expect(response.json().tags.length).toBeGreaterThan(0);
  });

  it.each([
    ['missing token', 'secret', {}, 401],
    ['wrong token', 'secret', { authorization: 'Bearer nope' }, 401],
    ['right token', 'secret', { authorization: 'Bearer secret' }, 200],
    ['no token configured', undefined, {}, 200],
  ])('%s → %i', async (_, token, headers, status) => {
    expect((await tag(app({ token }), headers)).statusCode).toBe(status);
  });

  it('simulates failures and outages', async () => {
    expect((await tag(app({ failureRate: 1 }))).statusCode).toBe(400);
    const a = app();
    await a.inject({ method: 'POST', url: '/admin/offline' });
    expect((await a.inject('/health')).statusCode).toBe(503);
    await a.inject({ method: 'POST', url: '/admin/online' });
    expect((await a.inject('/health')).statusCode).toBe(200);
  });

  it('rejects oversized bodies', async () => {
    expect((await tag(app(), {}, 'x'.repeat(2048))).statusCode).toBe(413);
  });
});
