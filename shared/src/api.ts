import { isRating, ratingFromLevel, ratingLevel, type Rating } from './rating';
import type { TagCategory } from './tags';

export type GroupKind = 'illustrator' | 'collection';
export type TagStatus = 'pending' | 'done' | 'failed';
export type TagSource = 'auto' | 'manual';

/** Everything the grid needs to lay out and paint a tile before its thumbnail loads. */
export interface ImageTile {
  id: number;
  width: number;
  height: number;
  /** base64 of a tiny 3x3 RGB bitmap (27 bytes); render blurred as a placeholder. */
  placeholder: string;
  rating: Rating | null;
}

/** Compact wire form of an ImageTile used for large lists. rating is -1 when unknown. */
export type TileTuple = [id: number, width: number, height: number, placeholder: string, rating: number];

export function encodeTile(tile: ImageTile): TileTuple {
  return [tile.id, tile.width, tile.height, tile.placeholder, tile.rating ? ratingLevel(tile.rating) : -1];
}

export function decodeTile([id, width, height, placeholder, rating]: TileTuple): ImageTile {
  return { id, width, height, placeholder, rating: ratingFromLevel(rating) };
}

export interface ImageListResponse {
  total: number;
  tiles: TileTuple[];
}

export type ImageSort = 'newest' | 'oldest' | 'random';
const IMAGE_SORTS: readonly ImageSort[] = ['newest', 'oldest', 'random'];

export interface ImageQuery {
  group?: number;
  /** Images must carry every one of these tags. */
  tags?: string[];
  /** Images must carry none of these tags. */
  exclude?: string[];
  favorites?: boolean;
  sort?: ImageSort;
  /** Seed for a stable random order. */
  seed?: number;
  limit?: number;
  /** Safe mode: hide images rated above this level (and images not yet rated). */
  maxRating?: Rating;
}

export function imageQueryToSearchParams(query: ImageQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.group !== undefined) params.set('group', String(query.group));
  for (const tag of query.tags ?? []) params.append('tag', tag);
  for (const tag of query.exclude ?? []) params.append('not', tag);
  if (query.favorites) params.set('favorites', '1');
  if (query.sort) params.set('sort', query.sort);
  if (query.seed !== undefined) params.set('seed', String(query.seed));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.maxRating) params.set('maxRating', query.maxRating);
  return params;
}

type RawParams = Record<string, string | string[] | undefined>;

function asList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).filter((v) => v.length > 0);
}

function asPositiveInt(value: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Inverse of imageQueryToSearchParams; ignores anything malformed. */
export function parseImageQuery(raw: RawParams): ImageQuery {
  const query: ImageQuery = {};
  const group = asPositiveInt(raw.group);
  if (group !== undefined) query.group = group;
  const tags = asList(raw.tag);
  if (tags.length) query.tags = tags;
  const exclude = asList(raw.not);
  if (exclude.length) query.exclude = exclude;
  if (first(raw.favorites) === '1') query.favorites = true;
  const sort = first(raw.sort);
  if (sort && (IMAGE_SORTS as readonly string[]).includes(sort)) query.sort = sort as ImageSort;
  const seed = asPositiveInt(raw.seed);
  if (seed !== undefined) query.seed = seed;
  const limit = asPositiveInt(raw.limit);
  if (limit !== undefined) query.limit = limit;
  const maxRating = first(raw.maxRating);
  if (isRating(maxRating)) query.maxRating = maxRating;
  return query;
}

export interface GroupRef {
  id: number;
  kind: GroupKind;
  name: string;
}

export interface GroupSummary extends GroupRef {
  imageCount: number;
  /** Up to four tiles used for the card mosaic. */
  covers: ImageTile[];
  /** Newest addedAt among the group's images (epoch ms). */
  latestAt: number;
}

export type GroupSort = 'name' | 'count' | 'recent';

export interface GroupListResponse {
  groups: GroupSummary[];
}

export interface TagCount {
  name: string;
  category: TagCategory;
  count: number;
}

export interface GroupDetailResponse {
  group: GroupSummary;
  topTags: TagCount[];
}

export interface HomeResponse {
  recent: ImageTile[];
  illustrators: GroupSummary[];
  collections: GroupSummary[];
  rediscover: ImageTile[];
  totals: { images: number; illustrators: number; collections: number };
}

export interface ImageTag {
  name: string;
  category: TagCategory;
  /** null for tags added by hand. */
  confidence: number | null;
  source: TagSource;
}

export interface ImageFileRef {
  path: string;
  group: GroupRef;
}

export interface ImageDetail extends ImageTile {
  format: string;
  animated: boolean;
  sizeBytes: number;
  addedAt: number;
  files: ImageFileRef[];
  tags: ImageTag[];
  favorite: boolean;
  tagStatus: TagStatus;
}

export interface TagListResponse {
  tags: TagCount[];
}

export interface AddTagRequest {
  /** Accepts "name" or "category:name". */
  tag: string;
}

export interface SavedQuery {
  tags: string[];
  exclude: string[];
  group?: number;
}

export interface SavedSearch {
  id: number;
  name: string;
  query: SavedQuery;
  createdAt: number;
}

export interface CreateSavedSearchRequest {
  name: string;
  query: SavedQuery;
}

export type ScanPhase = 'idle' | 'walking' | 'processing' | 'cleaning';

export interface ScanStatus {
  phase: ScanPhase;
  processed: number;
  total: number;
  lastScanAt: number | null;
  lastError: string | null;
}

export interface TaggingStatus {
  pending: number;
  done: number;
  failed: number;
  total: number;
  taggerOnline: boolean;
  taggerModel: string | null;
}

export interface StatusResponse {
  scan: ScanStatus;
  tagging: TaggingStatus;
}

export interface FailedImage {
  tile: ImageTile;
  error: string;
  attempts: number;
}

export interface FailedImagesResponse {
  images: FailedImage[];
}

export interface Settings {
  /** Minimum confidence for automatically assigned general tags to be shown (0..1). */
  generalThreshold: number;
  /** Minimum confidence for automatically assigned character tags to be shown (0..1). */
  characterThreshold: number;
}

export interface AuthStatus {
  required: boolean;
  authenticated: boolean;
  /** True when the passcode is digits only, so the UI can show a keypad. */
  numeric: boolean;
}

export interface LoginRequest {
  passcode: string;
  remember: boolean;
}

export interface MosaicResponse {
  /** Placeholder bitmaps only — colours, no recognisable imagery. */
  placeholders: string[];
}

export interface ApiError {
  error: string;
}

export interface SavedSearchListResponse {
  searches: SavedSearch[];
}

export interface LoginErrorResponse extends ApiError {
  /** Present when too many wrong attempts were made. */
  retryAfterSeconds?: number;
}
