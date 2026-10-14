export const TAG_CATEGORIES = ['general', 'character', 'copyright', 'artist', 'meta'] as const;
export type TagCategory = (typeof TAG_CATEGORIES)[number];

export function isTagCategory(value: unknown): value is TagCategory {
  return typeof value === 'string' && (TAG_CATEGORIES as readonly string[]).includes(value);
}

/** Booru-style canonical name: lowercase, underscores instead of whitespace. */
export function normalizeTagName(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, '_');
}

/** Human-friendly label: underscores shown as spaces. */
export function displayTagName(name: string): string {
  return name.replace(/_/g, ' ');
}

export interface ParsedTagInput {
  name: string;
  category: TagCategory;
}

/** Parses user input such as "character:hatsune miku"; unknown prefixes stay part of the name. */
export function parseTagInput(input: string): ParsedTagInput | null {
  const match = /^\s*([a-z]+)\s*:(.+)$/i.exec(input);
  const prefix = match?.[1]?.toLowerCase();
  if (match && isTagCategory(prefix)) {
    const name = normalizeTagName(match[2] ?? '');
    return name ? { name, category: prefix } : null;
  }
  const name = normalizeTagName(input);
  return name ? { name, category: 'general' } : null;
}
