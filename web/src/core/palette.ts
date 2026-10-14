export interface PaletteItem {
  id: string;
  label: string;
  /** Shown dimmed after the label ("Illustrator", "Tag · 120"). */
  hint: string;
  /** Where choosing it goes. */
  to: string;
  /** Extra words that should match (e.g. aliases). */
  keywords?: string[];
}

const normalize = (s: string) => s.toLowerCase().replace(/_/g, ' ').trim();

/** 3: the label starts with the query, 2: a word does, 1: it appears anywhere, 0: no match. */
export function matchScore(item: PaletteItem, query: string): number {
  const q = normalize(query);
  if (!q) return 1;
  const texts = [item.label, ...(item.keywords ?? [])].map(normalize);
  if (texts.some((t) => t.startsWith(q))) return 3;
  if (texts.some((t) => t.split(/\s+/).some((w) => w.startsWith(q)))) return 2;
  return texts.some((t) => t.includes(q)) ? 1 : 0;
}

/** Best matches first; ties keep their original order (pages before illustrators, and so on). */
export function rankPalette(items: readonly PaletteItem[], query: string, limit: number): PaletteItem[] {
  return items
    .map((item, index) => ({ item, index, score: matchScore(item, query) }))
    .filter((r) => r.score > 0)
    .toSorted((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((r) => r.item);
}

/** Arrow-key movement through `count` results, wrapping at both ends. */
export function moveHighlight(current: number, key: 'ArrowDown' | 'ArrowUp', count: number): number {
  if (count === 0) return 0;
  return key === 'ArrowDown' ? (current + 1) % count : (current - 1 + count) % count;
}
