import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../../../shared/config/types';
import { createAuthService, type AuthService } from '../../auth';
import { createDingtalkLoginService, type DingtalkLoginService } from '../../auth/dingtalk';
import type { RuntimeSettingsService, StorageContext } from '../../storage';
import type { AdminActions } from '../controllers/admin-controller';
import { WechatBindCoordinator, type WechatBridgeService } from '../../wechat';
import { registerAdminRoutes } from './admin-routes';
import { registerConfigRoutes } from './config-routes';
import { registerFeedRoutes } from './feed-routes';
import { registerAuthRoutes } from './auth-routes';
import { registerHealthRoutes } from './health-routes';
import { registerUserRoutes } from './user-routes';

export interface RegisterApiRoutesOptions {
  adminActions?: AdminActions;
  auth?: AuthService;
  config: AppConfig;
  runtimeSettings?: RuntimeSettingsService;
  storage: StorageContext;
  wechatBindCoordinator?: WechatBindCoordinator;
  wechatBridge?: WechatBridgeService;
}

export function registerApiRoutes(app: FastifyInstance, options: RegisterApiRoutesOptions): void {
  const auth =
    options.auth ??
    createAuthService({
      adminPassword: process.env.ADMIN_PASSWORD,
      adminUsername: process.env.ADMIN_USERNAME,
      storage: options.storage,
    });
  const wechatBindCoordinator = options.wechatBindCoordinator ?? new WechatBindCoordinator();
  const authInstance =
    options.auth ??
    createAuthService({
      adminPassword: process.env.ADMIN_PASSWORD,
      adminUsername: process.env.ADMIN_USERNAME,
      storage: options.storage,
    });
  const dingtalkLogin = createDingtalkLoginService({
    auth: authInstance,
    storage: options.storage,
  });
  const userControllerOptions = {
    auth,
    storage: options.storage,
    ...(options.wechatBridge === undefined ? {} : { wechatBridge: options.wechatBridge }),
  };

  registerAuthRoutes(app, {
    auth,
    dingtalkLogin,
    sessionTtlSeconds: 30 * 24 * 60 * 60,
  });
  registerUserRoutes(app, {
    auth,
    userControllerOptions: {
      ...userControllerOptions,
      wechatBindCoordinator,
    },
  });
  registerAdminRoutes(app, {
    actions: options.adminActions,
    auth,
    dingtalkLogin,
    ...(options.wechatBridge === undefined ? {} : { wechatBridge: options.wechatBridge }),
    config: options.config,
    runtimeSettings: options.runtimeSettings,
    storage: options.storage,
    wechatBindCoordinator: options.wechatBindCoordinator ?? wechatBindCoordinator,
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
