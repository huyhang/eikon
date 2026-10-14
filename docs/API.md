# Eikon HTTP API

All types live in `shared/src` (`@eikon/shared`). JSON everywhere unless noted.
Everything except `/api/auth/*` requires the session cookie and answers `401 {"error":"unauthorized"}` without it.

`maxRating` (safe mode) may be added to any listing endpoint: images rated above it, or not yet rated, are excluded.

## Auth
| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET  | `/api/auth/status` | | `AuthStatus` |
| POST | `/api/auth/login`  | `LoginRequest` | `204` · `401 LoginErrorResponse` · `429 LoginErrorResponse` |
| POST | `/api/auth/logout` | | `204` |
| GET  | `/api/auth/mosaic` | | `MosaicResponse` (colour placeholders for the lock screen) |

## Browse
| Method | Path | Query | Response |
|---|---|---|---|
| GET | `/api/home` | `maxRating` | `HomeResponse` |
| GET | `/api/groups` | `kind=illustrator\|collection`, `sort=name\|count\|recent`, `maxRating` | `GroupListResponse` |
| GET | `/api/groups/:id` | `maxRating` | `GroupDetailResponse` · `404` |
| GET | `/api/images` | `ImageQuery` (see `imageQueryToSearchParams`) | `ImageListResponse` (compact `TileTuple`s, decode with `decodeTile`) |
| GET | `/api/images/:id` | | `ImageDetail` · `404` |

## Curate
| Method | Path | Body | Response |
|---|---|---|---|
| PUT    | `/api/images/:id/favorite` | | `204` |
| DELETE | `/api/images/:id/favorite` | | `204` |
| POST   | `/api/images/:id/tags` | `AddTagRequest` | `ImageDetail` |
| DELETE | `/api/images/:id/tags/:name` | | `ImageDetail` |

Manual edits are permanent: a removed tag is never re-added by re-tagging, an added tag is never dropped.

## Tags & saved searches
| Method | Path | Query / Body | Response |
|---|---|---|---|
| GET    | `/api/tags/suggest` | `q`, `limit`, `maxRating` | `TagListResponse` (prefix matches first, by count) |
| GET    | `/api/tags/related` | `ImageQuery`, `limit` | `TagListResponse` (most common tags in the result set, minus the query's own tags) |
| GET    | `/api/tags/top` | `limit`, `maxRating` | `TagListResponse` |
| GET    | `/api/saved-searches` | | `SavedSearchListResponse` |
| POST   | `/api/saved-searches` | `CreateSavedSearchRequest` | `SavedSearch` |
| DELETE | `/api/saved-searches/:id` | | `204` |

## System
| Method | Path | Body | Response |
|---|---|---|---|
| GET  | `/api/status` | | `StatusResponse` |
| POST | `/api/scan` | | `202` |
| GET  | `/api/tagging/failed` | | `FailedImagesResponse` |
| POST | `/api/tagging/retry-failed` | | `202` |
| POST | `/api/tagging/retag-all` | | `202` |
| GET  | `/api/settings` | | `Settings` |
| PUT  | `/api/settings` | `Partial<Settings>` | `Settings` |

## Media (cookie-protected, immutable, long-cached)
| Path | Content |
|---|---|
| `/media/thumb/:id/sm` | WebP, 480 px tall (grid) |
| `/media/thumb/:id/lg` | WebP, fits 2048×2048 (viewer, tagger input) |
| `/media/original/:id` | The original file |

## Tagger protocol (Eikon → gpubox)
See `shared/src/tagger.ts`: `GET /health`, `POST /v1/tag` with raw image bytes.
