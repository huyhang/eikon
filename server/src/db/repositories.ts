import type { Database } from './database';
import { FavoriteRepository } from './favoriteRepository';
import { FileRepository } from './fileRepository';
import { GroupRepository } from './groupRepository';
import { ImageRepository } from './imageRepository';
import { SavedSearchRepository } from './savedSearchRepository';
import { SettingsRepository } from './settingsRepository';
import { TagQueueRepository } from './tagQueueRepository';
import { TagRepository } from './tagRepository';

export interface Repositories {
  db: Database;
  images: ImageRepository;
  files: FileRepository;
  groups: GroupRepository;
  tags: TagRepository;
  tagQueue: TagQueueRepository;
  favorites: FavoriteRepository;
  savedSearches: SavedSearchRepository;
  settings: SettingsRepository;
}

export function createRepositories(db: Database): Repositories {
  const tags = new TagRepository(db);
  return {
    db,
    images: new ImageRepository(db),
    files: new FileRepository(db),
    groups: new GroupRepository(db),
    tags,
    tagQueue: new TagQueueRepository(db, tags),
    favorites: new FavoriteRepository(db),
    savedSearches: new SavedSearchRepository(db),
    settings: new SettingsRepository(db),
  };
}
