import { ratingLevel, type ImageQuery, type ImageSort, type Settings } from '@eikon/shared';
import { sql, whereAll, type SqlFragment } from '../db/sql';

export type Thresholds = Pick<Settings, 'generalThreshold' | 'characterThreshold'>;

/**
 * Whether an image_tags row (alias `it`, joined to tags `t`) counts as a visible tag:
 * hand-added tags always do, automatic ones only above the category's confidence threshold.
 */
export function visibleTag(thresholds: Thresholds): SqlFragment {
  return sql(
    `it.source = 'manual' OR (it.source = 'auto' AND it.confidence >= ` +
      `CASE t.category WHEN 'character' THEN ? ELSE ? END)`,
    thresholds.characterThreshold,
    thresholds.generalThreshold,
  );
}

function hasTag(name: string, thresholds: Thresholds): SqlFragment {
  const visible = visibleTag(thresholds);
  return {
    text:
      'EXISTS (SELECT 1 FROM image_tags it JOIN tags t ON t.id = it.tag_id ' +
      `WHERE it.image_id = i.id AND t.name = ? AND (${visible.text}))`,
    params: [name, ...visible.params],
  };
}

function negate(fragment: SqlFragment): SqlFragment {
  return { text: `NOT ${fragment.text}`, params: fragment.params };
}

/** Safe-mode restriction on images alias `i`. Unrated images are hidden too. */
export function ratingCondition(maxRating: ImageQuery['maxRating']): SqlFragment[] {
  return maxRating ? [sql('i.rating IS NOT NULL AND i.rating <= ?', ratingLevel(maxRating))] : [];
}

/** All WHERE conditions for an image query against images alias `i`. */
export function imageConditions(query: ImageQuery, thresholds: Thresholds): SqlFragment[] {
  return [
    ...ratingCondition(query.maxRating),
    ...(query.group !== undefined
      ? [sql('EXISTS (SELECT 1 FROM files f WHERE f.image_id = i.id AND f.group_id = ?)', query.group)]
      : []),
    ...(query.favorites ? [sql('EXISTS (SELECT 1 FROM favorites fv WHERE fv.image_id = i.id)')] : []),
    ...(query.tags ?? []).map((name) => hasTag(name, thresholds)),
    ...(query.exclude ?? []).map((name) => negate(hasTag(name, thresholds))),
  ];
}

export function imageWhere(query: ImageQuery, thresholds: Thresholds): SqlFragment {
  return whereAll(imageConditions(query, thresholds));
}

/** Multiplicative hash of (id + seed): a stable shuffle that changes with the seed. */
export function imageOrder(sort: ImageSort = 'newest', seed = 0): SqlFragment {
  switch (sort) {
    case 'oldest':
      return sql('i.added_at ASC, i.id ASC');
    case 'random':
      return sql('((i.id + ?) * 2654435761) % 4294967291, i.id', seed);
    case 'newest':
      return sql('i.added_at DESC, i.id DESC');
  }
}
