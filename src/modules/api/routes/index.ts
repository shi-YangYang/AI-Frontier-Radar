import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../../../shared/config/types';
import type { RuntimeSettingsService, StorageContext } from '../../storage';
import type { AdminActions } from '../controllers/admin-controller';
import type { WechatBridgeService } from '../../wechat';
import { registerAdminRoutes } from './admin-routes';
import { registerConfigRoutes } from './config-routes';
import { registerFeedRoutes } from './feed-routes';
import { registerHealthRoutes } from './health-routes';

export interface RegisterApiRoutesOptions {
  adminActions?: AdminActions;
  wechatBridge?: WechatBridgeService;
  config: AppConfig;
  runtimeSettings?: RuntimeSettingsService;
  storage: StorageContext;
}

export function registerApiRoutes(app: FastifyInstance, options: RegisterApiRoutesOptions): void {
  registerAdminRoutes(app, {
    actions: options.adminActions,
    ...(options.wechatBridge === undefined ? {} : { wechatBridge: options.wechatBridge }),
    config: options.config,
    runtimeSettings: options.runtimeSettings,
    storage: options.storage,
  });
  registerHealthRoutes(app, {
    config: options.config,
  });
  registerConfigRoutes(app, {
    config: options.config,
    storage: options.storage,
  });
  registerFeedRoutes(app, {
    storage: options.storage,
  });
}
