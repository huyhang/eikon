import { normalizeTagName, type ImageQuery, type ImageSort, type SavedQuery } from '@eikon/shared';

export type ChipMode = 'include' | 'exclude';

export interface SearchState {
  include: string[];
  exclude: string[];
  group?: number;
  sort: ImageSort;
  /** Fixes the order of a shuffle, so paging back and forth keeps the same arrangement. */
  seed?: number;
  /** Describe-in-words: rank images by how well they match this text (needs embeddings). */
  text?: string;
  /** More like this: rank images by similarity to this image (needs embeddings). */
  like?: number;
}

export type SearchAction =
  | { type: 'add'; tag: string; mode?: ChipMode }
  | { type: 'remove'; tag: string }
  | { type: 'toggle'; tag: string }
  | { type: 'removeLast' }
  | { type: 'setGroup'; group: number | undefined }
  | { type: 'setSort'; sort: ImageSort; seed?: number }
  | { type: 'setText'; text: string }
  | { type: 'setLike'; like: number | undefined }
  | { type: 'clear' };

export const EMPTY_SEARCH: SearchState = { include: [], exclude: [], sort: 'newest' };

const without = (list: string[], tag: string) => list.filter((t) => t !== tag);

function addTag(state: SearchState, rawTag: string, mode: ChipMode): SearchState {
  const tag = normalizeTagName(rawTag.replace(/^-/, ''));
  if (!tag) return state;
  const include = without(state.include, tag);
  const exclude = without(state.exclude, tag);
  return mode === 'include'
    ? { ...state, include: [...include, tag], exclude }
    : { ...state, include, exclude: [...exclude, tag] };
}

function toggleTag(state: SearchState, tag: string): SearchState {
  if (state.include.includes(tag)) return addTag(state, tag, 'exclude');
  if (state.exclude.includes(tag)) return addTag(state, tag, 'include');
  return state;
}

function removeLast(state: SearchState): SearchState {
  const last = chipsOf(state).at(-1);
  return last
    ? { ...state, include: without(state.include, last.tag), exclude: without(state.exclude, last.tag) }
    : state;
}

export function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case 'add':
      return addTag(state, action.tag, action.mode ?? (action.tag.startsWith('-') ? 'exclude' : 'include'));
    case 'remove':
      return {
        ...state,
        include: without(state.include, action.tag),
        exclude: without(state.exclude, action.tag),
      };
    case 'toggle':
      return toggleTag(state, action.tag);
    case 'removeLast':
      return removeLast(state);
    case 'setGroup':
      return action.group === undefined ? withoutGroup(state) : { ...state, group: action.group };
    case 'setSort':
      return withSort(state, action.sort, action.seed);
    case 'setText':
      return withRanking(state, action.text.trim() ? { text: action.text.trim() } : {});
    case 'setLike':
      return withRanking(state, action.like === undefined ? {} : { like: action.like });
    case 'clear':
      return { ...EMPTY_SEARCH, sort: state.sort };
  }
}

function withSort(state: SearchState, sort: ImageSort, seed: number | undefined): SearchState {
  const { seed: _previous, ...rest } = state;
  return sort === 'random' && seed !== undefined ? { ...rest, sort, seed } : { ...rest, sort };
}

/** Text and image ranking are alternatives: setting one clears the other. */
function withRanking(state: SearchState, ranking: Pick<SearchState, 'text' | 'like'>): SearchState {
  const { text: _text, like: _like, ...rest } = state;
  return { ...rest, ...ranking };
}

function withoutGroup(state: SearchState): SearchState {
  const { group: _ignored, ...rest } = state;
  return rest;
}

export interface Chip {
  tag: string;
  mode: ChipMode;
}

export function chipsOf(state: SearchState): Chip[] {
  return [
    ...state.include.map((tag) => ({ tag, mode: 'include' as const })),
    ...state.exclude.map((tag) => ({ tag, mode: 'exclude' as const })),
  ];
}

export function hasCriteria(state: SearchState): boolean {
  return state.include.length > 0 || state.exclude.length > 0 || state.group !== undefined || isRanked(state);
}

/** Ranked by text or similarity rather than sorted. */
export function isRanked(state: SearchState): boolean {
  return state.text !== undefined || state.like !== undefined;
}

const SORTS: ReadonlySet<string> = new Set<ImageSort>(['newest', 'oldest', 'random']);

const isSort = (value: unknown): value is ImageSort => typeof value === 'string' && SORTS.has(value);
const uniqueTags = (values: string[]) => [...new Set(values.map(normalizeTagName).filter(Boolean))];
const isPositiveInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

/** URL form used by the Search and Favorites pages: ?t=a&t=b&x=c&in=12&sort=random&seed=42 */
export function searchToParams(state: SearchState): URLSearchParams {
  const params = new URLSearchParams();
  state.include.forEach((t) => params.append('t', t));
  state.exclude.forEach((t) => params.append('x', t));
  if (state.group !== undefined) params.set('in', String(state.group));
  if (state.sort !== 'newest') params.set('sort', state.sort);
  if (state.sort === 'random' && state.seed !== undefined) params.set('seed', String(state.seed));
  if (state.text !== undefined) params.set('q', state.text);
  if (state.like !== undefined) params.set('like', String(state.like));
  return params;
}

export function searchFromParams(params: URLSearchParams): SearchState {
  const include = uniqueTags(params.getAll('t'));
  const exclude = uniqueTags(params.getAll('x')).filter((t) => !include.includes(t));
  const group = Number(params.get('in'));
  const seed = Number(params.get('seed'));
  const sortParam = params.get('sort');
  const state: SearchState = { include, exclude, sort: isSort(sortParam) ? sortParam : 'newest' };
  if (isPositiveInt(group)) state.group = group;
  if (state.sort === 'random' && params.has('seed') && Number.isInteger(seed) && seed >= 0) state.seed = seed;
  const text = params.get('q')?.trim();
  const like = Number(params.get('like'));
  if (text) state.text = text;
  else if (isPositiveInt(like)) state.like = like;
  return state;
}

const isTagList = (list: unknown) => Array.isArray(list) && list.every((t) => typeof t === 'string');
const showTags = (tags: string[]) => tags.map((t) => t.replace(/_/g, ' ')).join(', ');

/** Type guard for searches read back from storage, which may be stale or corrupted. */
export function isSearchState(value: unknown): value is SearchState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    isTagList(v.include) &&
    isTagList(v.exclude) &&
    isSort(v.sort) &&
    (v.group === undefined || isPositiveInt(v.group)) &&
    (v.text === undefined || typeof v.text === 'string') &&
    (v.like === undefined || isPositiveInt(v.like))
  );
}

export function searchToImageQuery(state: SearchState): ImageQuery {
  const query: ImageQuery = { sort: state.sort };
  if (state.include.length) query.tags = state.include;
  if (state.exclude.length) query.exclude = state.exclude;
  if (state.group !== undefined) query.group = state.group;
  if (state.sort === 'random' && state.seed !== undefined) query.seed = state.seed;
  if (state.text !== undefined) query.text = state.text;
  if (state.like !== undefined) query.like = state.like;
  return query;
}

export function searchToSavedQuery(state: SearchState): SavedQuery {
  const query: SavedQuery = { tags: state.include, exclude: state.exclude };
  if (state.group !== undefined) query.group = state.group;
  return query;
}

export function savedQueryToSearch(query: SavedQuery): SearchState {
  const state: SearchState = { include: query.tags, exclude: query.exclude, sort: 'newest' };
  if (query.group !== undefined) state.group = query.group;
  return state;
}

/** Stable identity for deduping recent searches; ignores sort order. */
export function searchKey(state: SearchState): string {
  return searchToParams(withSort(state, 'newest', undefined)).toString();
}

/** Explains an empty result in terms of what the user asked for. */
export function emptyResultMessage(
  state: SearchState,
  scope: { groupName?: string; noun?: string } = {},
): string {
  const noun = scope.noun ?? 'images';
  const where = scope.groupName ? ` in ${scope.groupName}` : '';
  if (state.include.length && state.exclude.length)
    return `No ${noun}${where} have ${showTags(state.include)} without ${showTags(state.exclude)}. Try removing a tag.`;
  if (state.exclude.length) {
    const each = `Every ${noun.replace(/s$/, '')}${where}`;
    return state.exclude.length === 1
      ? `${each} is tagged ${showTags(state.exclude)}. Try removing the exclusion.`
      : `${each} has at least one of ${showTags(state.exclude)}. Try removing an exclusion.`;
  }
  if (state.include.length > 1)
    return `No ${noun}${where} have all of ${showTags(state.include)}. Try removing one.`;
  if (state.include.length === 1) return `No ${noun}${where} are tagged ${showTags(state.include)}.`;
  return `No ${noun}${where} yet.`;
}

export function describeSearch(state: SearchState, groupName?: string): string {
  const tags = [...state.include, ...state.exclude.map((t) => `−${t}`)].map((t) => t.replace(/_/g, ' '));
  const ranking =
    state.text !== undefined ? [`“${state.text}”`] : state.like !== undefined ? [`Like #${state.like}`] : [];
  const label = [...ranking, ...tags].join(' · ') || 'Everything';
  return groupName ? `${label} in ${groupName}` : label;
}
