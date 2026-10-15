import { mkdirSync } from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import { AuthService } from './auth/authService';
import { BackupScheduler } from './backup/backupScheduler';
import { BackupService } from './backup/backupService';
import { LoginThrottle } from './auth/loginThrottle';
import { FileSecretStore } from './auth/secretStore';
import { SessionSigner } from './auth/session';
import { parseConfig, type Config } from './config';
import { Database } from './db/database';
import { createRepositories, type Repositories } from './db/repositories';
import { buildApp } from './http/app';
import { DuplicateDetector } from './library/duplicateDetector';
import { sha256 } from './library/hasher';
import { FsLibrarySource } from './library/librarySource';
import { Scanner } from './library/scanner';
import { ScanScheduler } from './library/scanScheduler';
import { SharpImageProcessor } from './media/imageProcessor';
import { ThumbnailRefresher } from './media/thumbnailRefresher';
import { FsThumbnailStore } from './media/thumbnailStore';
import { SimilarityService } from './similarity/similarityService';
import { HttpTaggerClient } from './tagging/taggerClient';
import { TagWorker } from './tagging/tagWorker';
import { realSleep, systemClock } from './util/clock';
import type { Logger } from 'pino';

/** Shared services every builder may need. */
interface Core {
  config: Config;
  logger: Logger;
  repos: Repositories;
  thumbnails: FsThumbnailStore;
}

function buildTagWorker(
  { config, logger, repos, thumbnails }: Core,
  tagger: HttpTaggerClient,
  similarity: SimilarityService,
) {
  return new TagWorker({
    queue: repos.tagQueue,
    embeddings: {
      currentModel: () => similarity.model,
      setModel: (model) => similarity.setModel(model),
      save: (id, embedding) => similarity.save(id, embedding),
      missing: (model, limit) => repos.embeddings.missing(model, limit),
      countMissing: (model) => repos.embeddings.countMissing(model),
    },
    tagger,
    hashOf: (id) => repos.images.hashOf(id),
    thumbnails,
    clock: systemClock,
    sleep: realSleep,
    logger: logger.child({ component: 'tagger' }),
    options: {
      concurrency: config.tagConcurrency,
      batchSize: 32,
      maxAttempts: 5,
      retryBaseMs: 60_000,
      retryMaxMs: 30 * 60_000,
      offlineBaseMs: 5_000,
      offlineMaxMs: 60_000,
      idleMs: 30_000,
    },
  });
}

function buildScanner(
  { config, logger, repos, thumbnails }: Core,
  onImagesAdded: () => void,
  similarity: SimilarityService,
) {
  const processor = new SharpImageProcessor();
  return new Scanner({
    library: new FsLibrarySource(config.libraryDir),
    processor,
    thumbnails,
    hasher: sha256,
    repos,
    clock: systemClock,
    logger: logger.child({ component: 'scanner' }),
    concurrency: config.processConcurrency,
    onImagesAdded,
    onImagesRemoved: (ids) => similarity.forget(ids),
    duplicates: new DuplicateDetector({
      images: repos.images,
      processor,
      thumbnails,
      logger: logger.child({ component: 'duplicates' }),
    }),
  });
}

function buildThumbnailRefresher({ config, logger, repos, thumbnails }: Core, scanner: Scanner) {
  return new ThumbnailRefresher({
    images: repos.images,
    files: repos.files,
    library: new FsLibrarySource(config.libraryDir),
    processor: new SharpImageProcessor(),
    thumbnails,
    scanning: () => scanner.status().phase !== 'idle',
    sleep: realSleep,
    logger: logger.child({ component: 'thumbnails' }),
    concurrency: config.processConcurrency,
  });
}

function buildAuth({ config }: Core) {
  const secrets = new FileSecretStore(path.join(config.dataDir, 'session.key'));
  return new AuthService({
    passcode: config.passcode,
    tailscaleSignIn: config.tailscaleUsers.length > 0,
    signer: new SessionSigner(secrets.current(), config.passcode ?? ''),
    secrets,
    throttle: new LoginThrottle(systemClock),
    clock: systemClock,
  });
}

/** Composition root: the only place that knows concrete implementations. */
async function main(config: Config): Promise<void> {
  const logger = pino({
    level: config.logLevel,
    ...(config.prettyLogs ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
  });
  mkdirSync(config.dataDir, { recursive: true });
  const repos = createRepositories(Database.open(path.join(config.dataDir, 'eikon.db')));
  const core: Core = {
    config,
    logger,
    repos,
    thumbnails: new FsThumbnailStore(path.join(config.dataDir, 'thumbnails')),
  };

  const tagger = new HttpTaggerClient(config.taggerUrl, config.taggerToken, 60_000);
  const similarity = new SimilarityService(repos.embeddings, tagger);
  const worker = buildTagWorker(core, tagger, similarity);
  const scanner = buildScanner(core, () => worker.wake(), similarity);
  const scheduler = new ScanScheduler(() => scanner.scan(), config.scanIntervalMs, realSleep, logger);
  const refresher = buildThumbnailRefresher(core, scanner);
  const tailscale = { proxies: config.trustedProxies, users: config.tailscaleUsers };
  const backups = new BackupService(
    repos.db,
    path.join(config.dataDir, 'backups'),
    config.backupKeep,
    systemClock,
  );
  const backupScheduler = new BackupScheduler(
    backups,
    config.backupHour,
    systemClock,
    realSleep,
    logger.child({ component: 'backup' }),
  );

  const app = await buildApp(
    {
      repos,
      auth: buildAuth(core),
      tailscale,
      scanner,
      scheduler,
      worker,
      thumbnails: core.thumbnails,
      backups,
      similarity,
      library: new FsLibrarySource(config.libraryDir),
      clock: systemClock,
      cookieSecure: config.cookieSecure,
      webDistDir: config.webDistDir,
    },
    { loggerInstance: logger },
  );

  await app.listen({ host: config.host, port: config.port });
  logger.info(
    {
      library: config.libraryDir,
      tagger: config.taggerUrl,
      passcode: config.passcode ? 'on' : 'off',
      tailscaleSignIn: tailscale.users.length > 0 ? 'on' : 'off',
    },
    'Eikon is ready',
  );
  scheduler.start();
  worker.start();
  backupScheduler.start();
  refresher.start();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    scheduler.stop();
    worker.stop();
    backupScheduler.stop();
    refresher.stop();
    await app.close();
    repos.db.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main(parseConfig(process.env)).catch((error) => {
  console.error(error);
  process.exit(1);
});
