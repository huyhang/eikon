import type { TagCount } from '@eikon/shared';

export interface EnterContext {
  text: string;
  suggestions: TagCount[];
  highlight: number;
  /** False while the list still shows results for an earlier input. */
  fresh: boolean;
}

/** What Enter should add: the highlighted suggestion only if it belongs to the current text, else the text itself. */
export function enterChoice({ text, suggestions, highlight, fresh }: EnterContext): TagCount | string | null {
  if (!text.trim()) return null;
  const highlighted = fresh ? suggestions[highlight] : undefined;
  return highlighted ?? text;
}
