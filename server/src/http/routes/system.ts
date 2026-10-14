import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import type {
  BackupInfo,
  BackupListResponse,
  FailedImagesResponse,
  Settings,
  StatusResponse,
} from '@eikon/shared';
import { curationExportChunks } from '../../db/exportRepository';
import { sanitizeSettings } from '../../db/settingsRepository';
import type { AppDeps } from '../deps';

export function registerSystemRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { repos } = deps;

  app.get('/api/status', async (): Promise<StatusResponse> => ({
    scan: deps.scanner.status(),
    tagging: deps.worker.status(),
    review: { pending: repos.curation.reviewQueue(0).total },
  }));

  app.post('/api/scan', async (_request, reply) => {
    deps.scheduler.requestScan();
    return reply.code(202).send();
  });

  app.get('/api/tagging/failed', async (): Promise<FailedImagesResponse> => ({
    images: repos.tagQueue.listFailed(200),
  }));

  app.post('/api/tagging/retry-failed', async (_request, reply) => {
    repos.tagQueue.retryFailed();
    deps.worker.wake();
    return reply.code(202).send();
  });

  app.post('/api/tagging/retag-all', async (_request, reply) => {
    repos.tagQueue.retagAll();
    deps.worker.wake();
    return reply.code(202).send();
  });

  app.get('/api/settings', async (): Promise<Settings> => repos.settings.get());

  app.put<{ Body: unknown }>('/api/settings', async (request): Promise<Settings> =>
    repos.settings.update(sanitizeSettings(request.body)),
  );

  app.get('/api/backups', async (): Promise<BackupListResponse> => ({ backups: deps.backups.list() }));

  app.post('/api/backups', async (_request, reply) => {
    const backup: BackupInfo = deps.backups.backupNow();
    return reply.code(201).send(backup);
  });

  app.get<{ Params: { name: string } }>('/api/backups/:name', async (request, reply) => {
    const file = deps.backups.pathOf(request.params.name);
    if (!file) return reply.code(404).send({ error: 'not found' });
    return reply
      .header('content-disposition', `attachment; filename="${request.params.name}"`)
      .type('application/vnd.sqlite3')
      .send(createReadStream(file));
  });

  app.get('/api/export', async (_request, reply) => {
    const now = deps.clock.now();
    const chunks = curationExportChunks(
      {
        images: () => repos.exports.images(),
        tags: () => repos.exports.tags(),
        savedSearches: () => repos.savedSearches.list(),
      },
      now,
    );
    const day = new Date(now).toISOString().slice(0, 10);
    return reply
      .header('content-disposition', `attachment; filename="eikon-curation-${day}.json"`)
      .type('application/json; charset=utf-8')
      .send(Readable.from(chunks));
  });
}
