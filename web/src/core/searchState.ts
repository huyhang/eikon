import { normalizeTagName, type ImageQuery, type ImageSort, type SavedQuery } from '@eikon/shared';

export type ChipMode = 'include' | 'exclude';

export interface SearchState {
  include: string[];
  exclude: string[];
  group?: number;
  sort: ImageSort;
}

export type SearchAction =
  | { type: 'add'; tag: string; mode?: ChipMode }
  | { type: 'remove'; tag: string }
  | { type: 'toggle'; tag: string }
  | { type: 'removeLast' }
  | { type: 'setGroup'; group: number | undefined }
  | { type: 'setSort'; sort: ImageSort }
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
      return { ...state, sort: action.sort };
    case 'clear':
      return { ...EMPTY_SEARCH, sort: state.sort };
  }
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
  return state.include.length > 0 || state.exclude.length > 0 || state.group !== undefined;
}

const SORTS: readonly ImageSort[] = ['newest', 'oldest', 'random'];

/** URL form used by the Search and Favorites pages: ?t=a&t=b&x=c&in=12&sort=oldest */
export function searchToParams(state: SearchState): URLSearchParams {
  const params = new URLSearchParams();
  state.include.forEach((t) => params.append('t', t));
  state.exclude.forEach((t) => params.append('x', t));
  if (state.group !== undefined) params.set('in', String(state.group));
  if (state.sort !== 'newest') params.set('sort', state.sort);
  return params;
}

export function searchFromParams(params: URLSearchParams): SearchState {
  const unique = (values: string[]) => [...new Set(values.map(normalizeTagName).filter(Boolean))];
  const include = unique(params.getAll('t'));
  const exclude = unique(params.getAll('x')).filter((t) => !include.includes(t));
  const group = Number(params.get('in'));
  const sortParam = params.get('sort') as ImageSort | null;
  const state: SearchState = {
    include,
    exclude,
    sort: sortParam && SORTS.includes(sortParam) ? sortParam : 'newest',
  };
  if (Number.isInteger(group) && group > 0) state.group = group;
  return state;
}

export function searchToImageQuery(state: SearchState): ImageQuery {
  const query: ImageQuery = { sort: state.sort };
  if (state.include.length) query.tags = state.include;
  if (state.exclude.length) query.exclude = state.exclude;
  if (state.group !== undefined) query.group = state.group;
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

/** Stable identity for deduping recent searches. */
export function searchKey(state: SearchState): string {
  return searchToParams({ ...state, sort: 'newest' }).toString();
}

export function describeSearch(state: SearchState, groupName?: string): string {
  const parts = [...state.include, ...state.exclude.map((t) => `−${t}`)].map((t) => t.replace(/_/g, ' '));
  const label = parts.join(' · ') || 'Everything';
  return groupName ? `${label} in ${groupName}` : label;
}
