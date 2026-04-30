import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../../../shared/config/types';
import type { StorageContext } from '../../storage';
import { registerConfigRoutes } from './config-routes';
import { registerHealthRoutes } from './health-routes';

export interface RegisterApiRoutesOptions {
  config: AppConfig;
  storage: StorageContext;
}

export function registerApiRoutes(app: FastifyInstance, options: RegisterApiRoutesOptions): void {
  registerHealthRoutes(app, {
    config: options.config,
  });
  registerConfigRoutes(app, {
    config: options.config,
    storage: options.storage,
  });
}
