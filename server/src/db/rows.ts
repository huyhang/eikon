import { ratingFromLevel, type ImageTile } from '@eikon/shared';

export interface TileRow {
  id: number;
  width: number;
  height: number;
  placeholder: string;
  rating: number | null;
}

/** Columns needed to build a TileRow from images alias `i`. */
export const TILE_COLUMNS = 'i.id, i.width, i.height, i.placeholder, i.rating';

export function toTile(row: TileRow): ImageTile {
  return {
    id: row.id,
    width: row.width,
    height: row.height,
    placeholder: row.placeholder,
    rating: row.rating === null ? null : ratingFromLevel(row.rating),
  };
}
