import type { TagCount } from '@eikon/shared';
import { TagPill } from './TagPill';
import styles from './TagCloud.module.css';

/** Font scale for a tag, from its share of the most popular tag's count (sqrt-damped). */
export function cloudScale(count: number, max: number): number {
  if (max <= 0) return 1;
  return 0.85 + 0.6 * Math.sqrt(Math.max(0, count) / max);
}

export function TagCloud({ tags, onPick }: { tags: TagCount[]; onPick: (tag: string) => void }) {
  const max = Math.max(0, ...tags.map((t) => t.count));
  return (
    <ul className={styles.cloud}>
      {tags.map((tag, i) => (
        <li
          key={tag.name}
          style={{ fontSize: `${cloudScale(tag.count, max)}em`, animationDelay: `${Math.min(i, 30) * 14}ms` }}
        >
          <button type="button" onClick={() => onPick(tag.name)}>
            <TagPill
              name={tag.name}
              category={tag.category}
              count={tag.count}
              size="sm"
              className={styles.pill}
            />
          </button>
        </li>
      ))}
    </ul>
  );
}
