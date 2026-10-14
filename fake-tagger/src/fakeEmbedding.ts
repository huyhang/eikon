import { createHash } from 'node:crypto';
import { encodeVector, normalize, type Embedding, type TaggerTag } from '@eikon/shared';
import { seededRandom } from './fakeTagging';

export const FAKE_EMBED_MODEL = 'fake-clip';
export const FAKE_EMBED_DIMS = 64;

interface WeightedWord {
  word: string;
  weight: number;
}

/** Crude English singular, applied to tags and queries alike ("mountains" → "mountain"). */
export function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('sses')) return word.slice(0, -2);
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1)
    .map(singular);
}

/** A fixed pseudo-random direction per word. */
export function wordVector(word: string): Float32Array {
  const random = seededRandom(createHash('sha256').update(word).digest().readUInt32LE(0));
  return Float32Array.from({ length: FAKE_EMBED_DIMS }, () => random() * 2 - 1);
}

/** Weighted sum of word directions, normalised: shared words mean high cosine similarity. */
export function embedWords(words: WeightedWord[]): Float32Array {
  const sum = new Float32Array(FAKE_EMBED_DIMS);
  for (const { word, weight } of words) {
    const v = wordVector(word);
    for (let i = 0; i < sum.length; i++) sum[i]! += v[i]! * weight;
  }
  return normalize(sum);
}

/** Stands in for CLIP: an image "looks like" the words of its tags. */
export function fakeImageEmbedding(tags: TaggerTag[]): Embedding {
  const words = tags.flatMap((t) => wordsOf(t.name).map((word) => ({ word, weight: t.confidence })));
  return { model: FAKE_EMBED_MODEL, vector: encodeVector(embedWords(words)) };
}

export function fakeTextEmbedding(text: string): Embedding {
  const words = wordsOf(text).map((word) => ({ word, weight: 1 }));
  return { model: FAKE_EMBED_MODEL, vector: encodeVector(embedWords(words)) };
}
