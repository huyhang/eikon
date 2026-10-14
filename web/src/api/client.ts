import type {
  AuthStatus,
  BackupInfo,
  BulkEditRequest,
  CreateSavedSearchRequest,
  DuplicateCluster,
  FailedImage,
  GroupDetailResponse,
  GroupKind,
  GroupSort,
  GroupSummary,
  HomeResponse,
  ImageDetail,
  ImageQuery,
  ImageTile,
  LoginRequest,
  Rating,
  SavedSearch,
  Settings,
  ReviewResponse,
  StatusResponse,
  TagCount,
  TagInfo,
  TagInfoListResponse,
  UpdateTagRequest,
} from '@eikon/shared';

export interface ImageList {
  total: number;
  tiles: ImageTile[];
}

export type LoginResult = { ok: true } | { ok: false; error: string; retryAfterSeconds?: number };

/** Everything the UI needs from the Eikon server. Implemented over HTTP; faked in tests. */
export interface ApiClient {
  authStatus(): Promise<AuthStatus>;
  login(request: LoginRequest): Promise<LoginResult>;
  logout(): Promise<void>;
  mosaic(): Promise<string[]>;

  home(maxRating?: Rating): Promise<HomeResponse>;
  groups(kind: GroupKind, sort: GroupSort, maxRating?: Rating): Promise<GroupSummary[]>;
  group(id: number, maxRating?: Rating): Promise<GroupDetailResponse>;
  images(query: ImageQuery): Promise<ImageList>;
  image(id: number): Promise<ImageDetail>;

  setFavorite(id: number, favorite: boolean): Promise<void>;
  addTag(id: number, tag: string): Promise<ImageDetail>;
  removeTag(id: number, name: string): Promise<ImageDetail>;

  suggestTags(q: string, limit: number, maxRating?: Rating): Promise<TagCount[]>;
  relatedTags(query: ImageQuery, limit: number): Promise<TagCount[]>;
  topTags(limit: number, maxRating?: Rating): Promise<TagCount[]>;

  savedSearches(): Promise<SavedSearch[]>;
  createSavedSearch(request: CreateSavedSearchRequest): Promise<SavedSearch>;
  deleteSavedSearch(id: number): Promise<void>;

  status(): Promise<StatusResponse>;
  scan(): Promise<void>;
  failedImages(): Promise<FailedImage[]>;
  retryFailed(): Promise<void>;
  retagAll(): Promise<void>;
  settings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;

  signOutEverywhere(): Promise<void>;
  duplicates(): Promise<DuplicateCluster[]>;
  setRating(id: number, rating: Rating | null): Promise<ImageDetail>;
  markReviewed(id: number): Promise<void>;
  reviewQueue(limit: number, maxRating?: Rating): Promise<ReviewResponse>;
  markAllReviewed(): Promise<number>;
  bulkEdit(request: BulkEditRequest): Promise<number>;

  manageTags(query: string, limit: number, offset: number): Promise<TagInfoListResponse>;
  tagInfo(name: string): Promise<TagInfo>;
  updateTag(name: string, patch: UpdateTagRequest): Promise<TagInfo>;
  addAlias(name: string, alias: string): Promise<TagInfo>;
  removeAlias(name: string, alias: string): Promise<TagInfo>;
  addImplication(name: string, implies: string): Promise<TagInfo>;
  removeImplication(name: string, implied: string): Promise<TagInfo>;

  backups(): Promise<BackupInfo[]>;
  createBackup(): Promise<BackupInfo>;
}

/** Plain links (downloads go through the browser, not fetch). */
export const EXPORT_URL = '/api/export';
export const backupDownloadUrl = (name: string) => `/api/backups/${encodeURIComponent(name)}`;

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}
