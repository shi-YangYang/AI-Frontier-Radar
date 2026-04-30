import Fastify, { type FastifyInstance } from 'fastify';

import type { AppConfig } from '../shared/config/types';
import type { AppLogger } from '../lib/logger';
import { registerApiRoutes } from '../modules/api';
import { createStorageFromConfig, type StorageContext } from '../modules/storage';

export interface CreateAppOptions {
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
    config: options.config,
    storage,
  });

  return app;
}
