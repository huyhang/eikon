import { isRating, ratingFromLevel, ratingLevel, type Rating } from './rating';
import { MAX_EMBED_TEXT_LENGTH } from './tagger';
import { normalizeTagName, type TagCategory } from './tags';

export type GroupKind = 'illustrator' | 'collection';
export type TagStatus = 'pending' | 'done' | 'failed';
/** 'implied': added because another tag on the image implies it. */
export type TagSource = 'auto' | 'manual' | 'implied';

/** Everything the grid needs to lay out and paint a tile before its thumbnail loads. */
export interface ImageTile {
  id: number;
  width: number;
  height: number;
  /** base64 of a tiny 3x3 RGB bitmap (27 bytes); render blurred as a placeholder. */
  placeholder: string;
  rating: Rating | null;
  /** How the image's thumbnails were made (see THUMB_VERSION); decides their URLs and sizes. */
  thumbVersion: number;
}

/**
 * Compact wire form of an ImageTile used for large lists. rating is -1 when unknown. thumbVersion is
 * missing from lists saved before it existed, which means version 1.
 */
export type TileTuple = [
  id: number,
  width: number,
  height: number,
  placeholder: string,
  rating: number,
  thumbVersion?: number,
];

export function encodeTile(tile: ImageTile): TileTuple {
  return [
    tile.id,
    tile.width,
    tile.height,
    tile.placeholder,
    tile.rating ? ratingLevel(tile.rating) : -1,
    tile.thumbVersion,
  ];
}

export function decodeTile([id, width, height, placeholder, rating, thumbVersion = 1]: TileTuple): ImageTile {
  return { id, width, height, placeholder, rating: ratingFromLevel(rating), thumbVersion };
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
  /** Rank by similarity to this image ("more like this"); other criteria only filter. */
  like?: number;
  /** Rank by how well images match this description; other criteria only filter. */
  text?: string;
}

/** Whether a query ranks by similarity rather than sorting. */
export function isRankedQuery(query: ImageQuery): boolean {
  return query.like !== undefined || query.text !== undefined;
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
  if (query.like !== undefined) params.set('like', String(query.like));
  if (query.text !== undefined) params.set('q', query.text);
  return params;
}

type RawParams = Record<string, string | string[] | undefined>;

function asTagList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map(normalizeTagName).filter((v) => v.length > 0);
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
  const tags = asTagList(raw.tag);
  if (tags.length) query.tags = tags;
  const exclude = asTagList(raw.not);
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
  const like = asPositiveInt(raw.like);
  if (like) query.like = like;
  const text = first(raw.q)?.trim();
  if (text) query.text = text.slice(0, MAX_EMBED_TEXT_LENGTH);
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
  /** True when `rating` was set by hand rather than by the tagger. */
  ratingOverridden: boolean;
  /** When the user last confirmed this image's tags in the review queue (epoch ms). */
  reviewedAt: number | null;
}

export interface SetRatingRequest {
  /** null goes back to the tagger's rating. */
  rating: Rating | null;
}

/** Recently tagged images whose tags the user hasn't confirmed yet. */
export interface ReviewResponse {
  total: number;
  images: ImageDetail[];
}

/** Applies the same change to many images at once. */
export interface BulkEditRequest {
  ids: number[];
  addTags?: string[];
  removeTags?: string[];
  favorite?: boolean;
}

export interface BulkEditResponse {
  updated: number;
}

/** GET /api/export: everything curated in Eikon, keyed by file content so it outlives the database. */
export interface CurationExport {
  format: 'eikon-curation';
  version: 1;
  exportedAt: number;
  tags: { name: string; category: TagCategory; aliases: string[]; implies: string[] }[];
  savedSearches: SavedSearch[];
  images: ExportedImage[];
}

export interface ExportedImage {
  /** SHA-256 of the original file. */
  sha256: string;
  width: number;
  height: number;
  format: string;
  addedAt: number;
  files: ImageFileRef[];
  favorite: boolean;
  /** The tagger's rating; ratingOverride is the user's, when set. */
  rating: Rating | null;
  ratingOverride: Rating | null;
  reviewedAt: number | null;
  /** 'removed' records a tag the user took off; implied tags are derived and not exported. */
  tags: {
    name: string;
    category: TagCategory;
    source: 'auto' | 'manual' | 'removed';
    confidence: number | null;
  }[];
}

export interface BackupInfo {
  name: string;
  sizeBytes: number;
  createdAt: number;
}

export interface BackupListResponse {
  backups: BackupInfo[];
}

export interface TagListResponse {
  tags: TagCount[];
}

/** A tag with everything the tag manager shows and edits. */
export interface TagInfo extends TagCount {
  aliases: string[];
  /** Tags this tag implies directly. */
  implies: string[];
  /** Tags that directly imply this one. */
  impliedBy: string[];
}

export interface TagInfoListResponse {
  total: number;
  tags: TagInfo[];
}

/** Rename (merging into an existing tag of that name) and/or recategorise a tag. */
export interface UpdateTagRequest {
  name?: string;
  category?: TagCategory;
}

export interface AddAliasRequest {
  alias: string;
}

export interface AddImplicationRequest {
  implies: string;
}

/** A picture with near-identical copies: the copy kept in grids, then the smaller ones. */
export interface DuplicateCluster {
  best: ImageTile;
  copies: ImageTile[];
}

export interface DuplicatesResponse {
  clusters: DuplicateCluster[];
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
  /** The embedding model behind similar-image search (works from stored vectors even while gpubox is off). */
  embedModel: string | null;
  /** Tagged images still waiting for an embedding. */
  embeddingsPending: number;
  /** Describe-in-words search needs gpubox online with an embedding model. */
  describeAvailable: boolean;
}

export interface StatusResponse {
  scan: ScanStatus;
  tagging: TaggingStatus;
  /** Tagged images whose tags the user hasn't confirmed yet. */
  review: { pending: number };
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
  /** Hide a smaller copy of a picture when its best copy is in the same grid. */
  hideDuplicates: boolean;
}

/** How a request is signed in: nothing configured, a passcode session, or a tailnet identity. */
export type AuthMethod = 'open' | 'session' | 'tailscale';

export interface TailnetUser {
  login: string;
  name: string | null;
}

export interface AuthStatus {
  /** False when Eikon is open to anyone who can reach it. */
  required: boolean;
  authenticated: boolean;
  /** Whether signing in with a passcode is possible. */
  passcode: boolean;
  /** True when the passcode is digits only, so the UI can show a keypad. */
  numeric: boolean;
  /** How this request is signed in (null when it isn't). */
  method: AuthMethod | null;
  /** The tailnet user, when signed in through Tailscale. */
  user: TailnetUser | null;
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
