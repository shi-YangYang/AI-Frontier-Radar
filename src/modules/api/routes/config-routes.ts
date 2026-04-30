import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../../../shared/config/types';
import type { StorageContext } from '../../storage';
import { getConfigSummary } from '../controllers/config-summary-controller';
import { configSummaryResponseSchema } from '../schemas/config-summary';

interface RegisterConfigRoutesOptions {
  config: AppConfig;
  storage: StorageContext;
}

export function registerConfigRoutes(app: FastifyInstance, options: RegisterConfigRoutesOptions): void {
  app.get(
    '/config/summary',
    {
      schema: {
        response: {
          200: configSummaryResponseSchema,
        },
      },
    },
    async () => getConfigSummary(options.config, options.storage),
  );
}
