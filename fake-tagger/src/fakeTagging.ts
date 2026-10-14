import { createHash } from 'node:crypto';
import { RATINGS, type Rating, type TaggerResult, type TaggerTag } from '@eikon/shared';
import { CHARACTER_TAGS, GENERAL_TAGS } from './vocabulary';

export const FAKE_MODEL = 'fake-wd-tagger';

export type Random = () => number;

/** Small deterministic PRNG (mulberry32): same image bytes → same tags, every time. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromBytes(bytes: Buffer): number {
  return createHash('sha256').update(bytes).digest().readUInt32LE(0);
}

/** Picks `count` distinct items. */
export function sample<T>(items: readonly T[], count: number, random: Random): T[] {
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) {
    picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0] as T);
  }
  return picked;
}

/** Mostly safe ratings, like a typical illustration library. */
export function fakeRating(random: Random): Record<Rating, number> {
  const roll = random();
  const winner: Rating =
    roll < 0.7 ? 'general' : roll < 0.88 ? 'sensitive' : roll < 0.96 ? 'questionable' : 'explicit';
  const scores = Object.fromEntries(RATINGS.map((r) => [r, Number((random() * 0.2).toFixed(3))])) as Record<
    Rating,
    number
  >;
  scores[winner] = Number((0.6 + random() * 0.39).toFixed(3));
  return scores;
}

/** Confidence spread mimicking WD output: a few sure tags, a tail of hesitant ones. */
export function fakeConfidence(rank: number, random: Random): number {
  const ceiling = Math.max(0.25, 0.99 - rank * 0.05);
  return Number((ceiling - random() * 0.1).toFixed(3));
}

export function fakeTagResult(bytes: Buffer, extraTags: TaggerTag[] = []): TaggerResult {
  const random = seededRandom(seedFromBytes(bytes));
  const general = sample(GENERAL_TAGS, 8 + Math.floor(random() * 12), random).map(
    (name, rank): TaggerTag => ({ name, category: 'general', confidence: fakeConfidence(rank, random) }),
  );
  const characters =
    random() < 0.35
      ? sample(CHARACTER_TAGS, 1, random).map((name): TaggerTag => ({
          name,
          category: 'character',
          confidence: Number((0.7 + random() * 0.29).toFixed(3)),
        }))
      : [];
  return { model: FAKE_MODEL, rating: fakeRating(random), tags: [...extraTags, ...characters, ...general] };
}
