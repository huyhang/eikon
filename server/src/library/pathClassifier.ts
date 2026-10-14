import type { GroupKind } from '@eikon/shared';

export const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'] as const;

const TOP_LEVEL: Record<string, GroupKind> = { illustrators: 'illustrator', collections: 'collection' };

export interface ClassifiedPath {
  kind: GroupKind;
  groupName: string;
}

/** Synology metadata (@eaDir, #recycle), dot-files and similar never count as library content. */
export function isIgnoredSegment(segment: string): boolean {
  return segment.startsWith('.') || segment.startsWith('@') || segment.startsWith('#');
}

export function hasSupportedExtension(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return fileName.includes('.') && (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Maps a library-relative path like "Illustrators/Wlop/2024/a.jpg" to its group.
 * Files directly under the top-level folders, unsupported files and ignored segments yield null.
 */
export function classifyPath(relPath: string): ClassifiedPath | null {
  const segments = relPath.split('/').filter(Boolean);
  const [top, groupName, ...rest] = segments;
  const kind = top ? TOP_LEVEL[top.toLowerCase()] : undefined;
  const fileName = rest.at(-1);
  if (!kind || !groupName || !fileName) return null;
  if (segments.some(isIgnoredSegment) || !hasSupportedExtension(fileName)) return null;
  return { kind, groupName };
}

export function topLevelFolderFor(kind: GroupKind): string {
  return kind === 'illustrator' ? 'Illustrators' : 'Collections';
}
