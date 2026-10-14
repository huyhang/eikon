import { mkdirSync } from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import { AuthService } from './auth/authService';
import { LoginThrottle } from './auth/loginThrottle';
import { FileSecretStore } from './auth/secretStore';
import { SessionSigner } from './auth/session';
import { parseConfig, type Config } from './config';
import { Database } from './db/database';
import { createRepositories } from './db/repositories';
import { buildApp } from './http/app';
import { sha256 } from './library/hasher';
import { FsLibrarySource } from './library/librarySource';
import { Scanner } from './library/scanner';
import { ScanScheduler } from './library/scanScheduler';
import { SharpImageProcessor } from './media/imageProcessor';
import { FsThumbnailStore } from './media/thumbnailStore';
import { HttpTaggerClient } from './tagging/taggerClient';
import { TagWorker } from './tagging/tagWorker';
import { realSleep, systemClock } from './util/clock';

/** Composition root: the only place that knows concrete implementations. */
async function main(config: Config): Promise<void> {
  const logger = pino({
    level: config.logLevel,
    ...(config.prettyLogs ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
  });
  mkdirSync(config.dataDir, { recursive: true });

  const repos = createRepositories(Database.open(path.join(config.dataDir, 'eikon.db')));
  const thumbnails = new FsThumbnailStore(path.join(config.dataDir, 'thumbnails'));
  const library = new FsLibrarySource(config.libraryDir);

  const worker = new TagWorker({
    queue: repos.tagQueue,
    tagger: new HttpTaggerClient(config.taggerUrl, config.taggerToken, 60_000),
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

  const scanner = new Scanner({
    library,
    processor: new SharpImageProcessor(),
    thumbnails,
    hasher: sha256,
    repos,
    clock: systemClock,
    logger: logger.child({ component: 'scanner' }),
    concurrency: config.processConcurrency,
    onImagesAdded: () => worker.wake(),
  });
  const scheduler = new ScanScheduler(() => scanner.scan(), config.scanIntervalMs, realSleep, logger);

  const secrets = new FileSecretStore(path.join(config.dataDir, 'session.key'));
  const auth = new AuthService({
    passcode: config.passcode,
    tailscaleSignIn: config.tailscaleUsers.length > 0,
    signer: new SessionSigner(secrets.current(), config.passcode ?? ''),
    secrets,
    throttle: new LoginThrottle(systemClock),
    clock: systemClock,
  });
  const tailscale = { proxies: config.trustedProxies, users: config.tailscaleUsers };

  const app = await buildApp(
    {
      repos,
      auth,
      tailscale,
      scanner,
      scheduler,
      worker,
      thumbnails,
      library,
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

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    scheduler.stop();
    worker.stop();
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
