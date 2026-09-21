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

  const auth =
    options.auth ??
    createAuthService({
      adminPassword: process.env.ADMIN_PASSWORD,
      adminUsername: process.env.ADMIN_USERNAME,
      logger: options.logger,
      storage,
    });

  const wechatBindCoordinator = options.wechatBindCoordinator ?? new WechatBindCoordinator();
  let bindSync: Promise<void> | null = null;
  // Finalize ownership even if the user closes the page after confirming on their phone.
  const bindSyncTimer = setInterval(() => {
    if (bindSync === null && options.wechatBridge?.isRunning() && wechatBindCoordinator.hasPendingBindings()) {
      bindSync = wechatBindCoordinator.sync(options.wechatBridge, storage)
        .then(() => undefined)
        .catch((error) => { options.logger.warn({ err: error }, '同步微信扫码绑定失败'); })
        .finally(() => { bindSync = null; });
    }
  }, 3_000);
  bindSyncTimer.unref();
  app.addHook('onClose', async () => {
    clearInterval(bindSyncTimer);
    await bindSync;
    if (ownsStorage) await storage.close();
  });

  registerApiRoutes(app, {
    adminActions: options.adminActions,
    auth,
    config: options.config,
    runtimeSettings: options.runtimeSettings,
    storage,
    wechatBindCoordinator,
    ...(options.wechatBridge === undefined ? {} : { wechatBridge: options.wechatBridge }),
  });

  return app;
}
