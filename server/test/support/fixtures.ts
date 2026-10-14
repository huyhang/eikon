import type { GroupKind, Rating, TaggerTag } from '@eikon/shared';
import { Database } from '../../src/db/database';
import { createRepositories, type Repositories } from '../../src/db/repositories';

export function createTestRepos(): Repositories {
  return createRepositories(Database.inMemory());
}

export interface SeedImage {
  hash?: string;
  group?: { kind: GroupKind; name: string };
  extraGroups?: { kind: GroupKind; name: string }[];
  addedAt?: number;
  width?: number;
  height?: number;
  tags?: (string | (Partial<TaggerTag> & { name: string }))[];
  rating?: Rating;
}

let counter = 0;

/** Inserts an image with one file per group and, when tags or a rating are given, a completed tagging. */
export function seedImage(repos: Repositories, seed: SeedImage = {}): number {
  counter += 1;
  const hash = seed.hash ?? `hash-${counter}`;
  const id = repos.images.insert({
    hash,
    width: seed.width ?? 800,
    height: seed.height ?? 600,
    format: 'jpeg',
    animated: false,
    sizeBytes: 1000,
    placeholder: 'AAAA',
    addedAt: seed.addedAt ?? counter,
  });
  const groups = [
    seed.group ?? { kind: 'illustrator' as const, name: 'Default' },
    ...(seed.extraGroups ?? []),
  ];
  groups.forEach((g, i) =>
    repos.files.upsert({
      path: `${g.kind}/${g.name}/${hash}-${i}.jpg`,
      imageId: id,
      groupId: repos.groups.upsert(g.kind, g.name),
      sizeBytes: 1000,
      mtimeMs: 1,
      scanId: 1,
    }),
  );
  if (seed.tags || seed.rating) {
    const rating = { general: 0, sensitive: 0, questionable: 0, explicit: 0, [seed.rating ?? 'general']: 1 };
    const tags = (seed.tags ?? []).map((t) =>
      typeof t === 'string'
        ? { name: t, category: 'general' as const, confidence: 0.9 }
        : { category: 'general' as const, confidence: 0.9, ...t },
    );
    repos.tagQueue.markTagged(id, { model: 'test', rating, tags }, 0);
  }
  return id;
}

export const THRESHOLDS = { generalThreshold: 0.35, characterThreshold: 0.85 };
