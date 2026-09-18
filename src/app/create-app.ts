import Fastify, { type FastifyInstance } from 'fastify';

import type { AppConfig } from '../shared/config/types';
import { createAuthService, type AuthService } from '../modules/auth';
import type { AppLogger } from '../lib/logger';
import type { AdminActions } from '../modules/api/controllers/admin-controller';
import { registerApiRoutes } from '../modules/api';
import {
  createStorageFromConfig,
  type RuntimeSettingsService,
  type StorageContext,
} from '../modules/storage';
import { WechatBindCoordinator, type WechatBridgeService } from '../modules/wechat';

export interface CreateAppOptions {
  adminActions?: AdminActions;
  auth?: AuthService;
  config: AppConfig;
  logger: AppLogger;
  runtimeSettings?: RuntimeSettingsService;
  storage?: StorageContext;
  wechatBindCoordinator?: WechatBindCoordinator;
  wechatBridge?: WechatBridgeService;
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

  const auth =
    options.auth ??
    createAuthService({
      adminPassword: process.env.ADMIN_PASSWORD,
      adminUsername: process.env.ADMIN_USERNAME,
      logger: options.logger,
      storage,
    });

  registerApiRoutes(app, {
    adminActions: options.adminActions,
    auth,
    config: options.config,
    runtimeSettings: options.runtimeSettings,
    storage,
    wechatBindCoordinator: options.wechatBindCoordinator ?? new WechatBindCoordinator(),
    ...(options.wechatBridge === undefined ? {} : { wechatBridge: options.wechatBridge }),
  });

  return app;
}
