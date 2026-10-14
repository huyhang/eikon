import { describe, expect, it } from 'vitest';
import type { KnownFile } from '../src/db/fileRepository';
import { planScan } from '../src/library/scanPlan';

const entry = (relPath: string, sizeBytes = 10, mtimeMs = 1) => ({
  relPath,
  sizeBytes,
  mtimeMs,
  kind: 'illustrator' as const,
  groupName: 'g',
});
const known = (path: string, sizeBytes = 10, mtimeMs = 1): [string, KnownFile] => [
  path,
  { path, imageId: 1, sizeBytes, mtimeMs },
];

describe('planScan', () => {
  it.each([
    ['new file', [entry('a')], [], [], ['a']],
    ['unchanged file', [entry('a')], [known('a')], ['a'], []],
    ['size changed', [entry('a', 11)], [known('a')], [], ['a']],
    ['mtime changed', [entry('a', 10, 2)], [known('a')], [], ['a']],
    ['deleted files are simply absent', [], [known('a')], [], []],
  ])('%s', (_, entries, knownFiles, unchanged, changed) => {
    const plan = planScan(entries, new Map(knownFiles));
    expect(plan.unchanged).toEqual(unchanged);
    expect(plan.changed.map((e) => e.relPath)).toEqual(changed);
  });
});
