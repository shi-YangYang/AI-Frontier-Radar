import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../../../shared/config/types';
import type { StorageContext } from '../../storage';
import type { AdminActions } from '../controllers/admin-controller';
import { registerAdminRoutes } from './admin-routes';
import { registerConfigRoutes } from './config-routes';
import { registerHealthRoutes } from './health-routes';

export interface RegisterApiRoutesOptions {
  adminActions?: AdminActions;
  config: AppConfig;
  storage: StorageContext;
}

export function registerApiRoutes(app: FastifyInstance, options: RegisterApiRoutesOptions): void {
  registerAdminRoutes(app, {
    actions: options.adminActions,
    config: options.config,
    storage: options.storage,
  });
  registerHealthRoutes(app, {
    config: options.config,
  });
  registerConfigRoutes(app, {
    config: options.config,
    storage: options.storage,
  });
}
