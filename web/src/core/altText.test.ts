import { describe, expect, it } from 'vitest';
import type { ImageDetail, ImageFileRef, ImageTag } from '@eikon/shared';
import { altTextFor } from './altText';

const file = (kind: 'illustrator' | 'collection', name: string): ImageFileRef => ({
  path: `${kind}/${name}/a.png`,
  group: { id: name.length, kind, name },
});
const tag = (name: string, partial: Partial<ImageTag> = {}): ImageTag => ({
  name,
  category: 'general',
  confidence: 0.8,
  source: 'auto',
  ...partial,
});

describe('altTextFor', () => {
  it.each<{ label: string; detail: Pick<ImageDetail, 'files' | 'tags'>; expected: string }>([
    {
      label: 'artist and strongest tags',
      detail: {
        files: [file('illustrator', 'Wlop'), file('collection', 'Favs')],
        tags: [
          tag('night', { confidence: 0.6 }),
          tag('cherry_blossoms', { confidence: 0.95 }),
          tag('highres', { category: 'meta' }),
        ],
      },
      expected: 'Illustration by Wlop: cherry blossoms, night',
    },
    {
      label: 'no artist, no tags',
      detail: { files: [file('collection', 'Favs')], tags: [] },
      expected: 'Illustration',
    },
    {
      label: 'the same artist twice is named once',
      detail: { files: [file('illustrator', 'Ana'), file('illustrator', 'Ana')], tags: [] },
      expected: 'Illustration by Ana',
    },
    {
      label: 'hand-added tags lead',
      detail: {
        files: [],
        tags: [tag('sky', { confidence: 0.99 }), tag('my_oc', { source: 'manual', confidence: null })],
      },
      expected: 'Illustration: my oc, sky',
    },
  ])('$label', ({ detail, expected }) => {
    expect(altTextFor(detail)).toBe(expected);
  });

  it('keeps it short', () => {
    const tags = Array.from({ length: 20 }, (_unused, i) => tag(`t${i}`, { confidence: 1 - i / 100 }));
    expect(altTextFor({ files: [], tags }, 3)).toBe('Illustration: t0, t1, t2');
  });
});
