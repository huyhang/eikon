import { CurationRepository } from './curationRepository';
import type { Database } from './database';
import { EmbeddingRepository } from './embeddingRepository';
import { FavoriteRepository } from './favoriteRepository';
import { ExportRepository } from './exportRepository';
import { FileRepository } from './fileRepository';
import { ImpliedTags } from './impliedTags';
import { GroupRepository } from './groupRepository';
import { ImageRepository } from './imageRepository';
import { SavedSearchRepository } from './savedSearchRepository';
import { TagAdminRepository } from './tagAdminRepository';
import { SettingsRepository } from './settingsRepository';
import { TagQueueRepository } from './tagQueueRepository';
import { TagRepository } from './tagRepository';

export interface Repositories {
  db: Database;
  images: ImageRepository;
  embeddings: EmbeddingRepository;
  files: FileRepository;
  groups: GroupRepository;
  tags: TagRepository;
  tagAdmin: TagAdminRepository;
  tagQueue: TagQueueRepository;
  favorites: FavoriteRepository;
  curation: CurationRepository;
  savedSearches: SavedSearchRepository;
  settings: SettingsRepository;
  exports: ExportRepository;
}

export function createRepositories(db: Database): Repositories {
  const implied = new ImpliedTags(db);
  const tags = new TagRepository(db, implied);
  return {
    db,
    images: new ImageRepository(db),
    embeddings: new EmbeddingRepository(db),
    files: new FileRepository(db),
    groups: new GroupRepository(db),
    tags,
    tagAdmin: new TagAdminRepository(db, tags, implied),
    tagQueue: new TagQueueRepository(db, tags),
    favorites: new FavoriteRepository(db),
    curation: new CurationRepository(db),
    savedSearches: new SavedSearchRepository(db),
    settings: new SettingsRepository(db),
    exports: new ExportRepository(db),
  };
}
