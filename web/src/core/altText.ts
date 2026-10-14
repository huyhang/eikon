import { displayTagName, type ImageDetail } from '@eikon/shared';
import { compareTags } from './tagGroups';

/**
 * A short description for screen readers, from what Eikon knows about the picture:
 * "Illustration by Wlop: cherry blossoms, night, 1girl".
 */
export function altTextFor(detail: Pick<ImageDetail, 'files' | 'tags'>, maxTags = 6): string {
  const artists = [
    ...new Set(detail.files.filter((f) => f.group.kind === 'illustrator').map((f) => f.group.name)),
  ];
  const subject = artists.length ? `Illustration by ${artists.join(' and ')}` : 'Illustration';
  const tags = detail.tags
    .filter((t) => t.category !== 'meta')
    .toSorted(compareTags)
    .slice(0, maxTags)
    .map((t) => displayTagName(t.name));
  return tags.length ? `${subject}: ${tags.join(', ')}` : subject;
}
