import { isTagCategory } from '@eikon/shared';

export interface TagInputParts {
  /** Typed with a leading "-" (exclude from a search). */
  exclude: boolean;
  /** A real category prefix such as "character:", kept when a suggestion is picked. */
  prefix: string;
  /** What to look up suggestions for. */
  term: string;
}

/**
 * Splits what the user typed into an exclusion marker, a category prefix and the search term.
 * Only known categories count as prefixes, so tags like "re:zero" stay whole.
 */
export function parseTagInput(text: string): TagInputParts {
  const exclude = text.startsWith('-');
  const rest = exclude ? text.slice(1) : text;
  const match = /^([a-z]+):(.*)$/i.exec(rest);
  if (match && isTagCategory(match[1]!.toLowerCase())) {
    return { exclude, prefix: `${match[1]}:`, term: match[2]! };
  }
  return { exclude, prefix: '', term: rest };
}

/** Text to submit when a suggestion is picked, keeping the typed exclusion or category. */
export function withTypedPrefix(text: string, suggestion: string): string {
  const { exclude, prefix } = parseTagInput(text);
  return `${exclude ? '-' : ''}${prefix}${suggestion}`;
}
