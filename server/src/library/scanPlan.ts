import type { KnownFile } from '../db/fileRepository';
import type { LibraryEntry } from './librarySource';

export interface ScanPlan {
  /** Paths whose size and mtime match what we already know. */
  unchanged: string[];
  /** New or modified files that must be read and hashed. */
  changed: LibraryEntry[];
}

export function fileSignature(entry: { sizeBytes: number; mtimeMs: number }): string {
  return `${entry.sizeBytes}:${entry.mtimeMs}`;
}

export function planScan(entries: LibraryEntry[], known: Map<string, KnownFile>): ScanPlan {
  const plan: ScanPlan = { unchanged: [], changed: [] };
  for (const entry of entries) {
    const existing = known.get(entry.relPath);
    if (existing && fileSignature(existing) === fileSignature(entry)) plan.unchanged.push(entry.relPath);
    else plan.changed.push(entry);
  }
  return plan;
}
