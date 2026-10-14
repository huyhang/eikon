import type { FastifyInstance } from 'fastify';
import type { FailedImagesResponse, Settings, StatusResponse } from '@eikon/shared';
import { sanitizeSettings } from '../../db/settingsRepository';
import type { AppDeps } from '../deps';

export function registerSystemRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { repos } = deps;

  app.get('/api/status', async (): Promise<StatusResponse> => ({
    scan: deps.scanner.status(),
    tagging: deps.worker.status(),
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
}
