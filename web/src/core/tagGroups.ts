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

/** Manual tags first, then by confidence, then alphabetically. */
export function compareTags(a: ImageTag, b: ImageTag): number {
  if (a.source !== b.source) return a.source === 'manual' ? -1 : 1;
  const byConfidence = (b.confidence ?? 1) - (a.confidence ?? 1);
  return byConfidence !== 0 ? byConfidence : a.name.localeCompare(b.name);
}

export function groupTagsByCategory(tags: readonly ImageTag[]): TagGroup[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    tags: tags.filter((t) => t.category === category).sort(compareTags),
  })).filter((group) => group.tags.length > 0);
}
