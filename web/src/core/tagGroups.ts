import type { ImageTag, TagCategory } from '@eikon/shared';

export const CATEGORY_ORDER: TagCategory[] = ['artist', 'character', 'copyright', 'general', 'meta'];

export const CATEGORY_LABELS: Record<TagCategory, string> = {
  artist: 'Artist',
  character: 'Characters',
  copyright: 'Series',
  general: 'General',
  meta: 'Meta',
};

export interface TagGroup {
  category: TagCategory;
  label: string;
  tags: ImageTag[];
}

/** Manual tags first, then by confidence (automatic and implied mixed), then alphabetically. */
export function compareTags(a: ImageTag, b: ImageTag): number {
  const manualA = a.source === 'manual';
  if (manualA !== (b.source === 'manual')) return manualA ? -1 : 1;
  const byConfidence = (b.confidence ?? 1) - (a.confidence ?? 1);
  return byConfidence !== 0 ? byConfidence : a.name.localeCompare(b.name);
}

/** Below this, an automatic tag is shown dimmed: the tagger wasn't sure. */
export const FAINT_BELOW = 0.5;

export function isFaint(tag: ImageTag): boolean {
  return tag.confidence !== null && tag.confidence < FAINT_BELOW;
}

/** "92%" for automatic and implied tags; null for hand-added ones. */
export function confidencePercent(tag: ImageTag): string | null {
  return tag.confidence === null ? null : `${Math.round(tag.confidence * 100)}%`;
}

/** Tooltip / accessible description of where a tag came from. */
export function tagOrigin(tag: ImageTag): string {
  const percent = confidencePercent(tag);
  if (tag.source === 'manual') return 'added by you';
  if (tag.source === 'implied')
    return percent ? `implied by another tag (${percent})` : 'implied by a tag you added';
  return `${percent} confidence`;
}

export function groupTagsByCategory(tags: readonly ImageTag[]): TagGroup[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    tags: tags.filter((t) => t.category === category).toSorted(compareTags),
  })).filter((group) => group.tags.length > 0);
}
