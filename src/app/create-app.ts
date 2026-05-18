import Fastify, { type FastifyInstance } from 'fastify';

import type { AppConfig } from '../shared/config/types';
import type { AppLogger } from '../lib/logger';
import type { AdminActions } from '../modules/api/controllers/admin-controller';
import { registerApiRoutes } from '../modules/api';
import { createStorageFromConfig, type StorageContext } from '../modules/storage';

export interface CreateAppOptions {
  adminActions?: AdminActions;
  config: AppConfig;
  logger: AppLogger;
  storage?: StorageContext;
}

export function createApp(options: CreateAppOptions): FastifyInstance {
  const app = Fastify({
    disableRequestLogging: true,
    loggerInstance: options.logger,
  });
  const storage = options.storage ?? createStorageFromConfig(options.config);
  const ownsStorage = options.storage === undefined;

  app.addHook('onClose', async () => {
    if (ownsStorage) {
      await storage.close();
    }
  });

  registerApiRoutes(app, {
    adminActions: options.adminActions,
    config: options.config,
    storage,
  });

  return app;
}
