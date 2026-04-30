import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../../../shared/config/types';
import { getHealth, getReadiness } from '../controllers/health-controller';
import { healthResponseSchema, readyErrorResponseSchema, readySuccessResponseSchema } from '../schemas/health';

interface RegisterHealthRoutesOptions {
  config: AppConfig;
}

export function registerHealthRoutes(app: FastifyInstance, options: RegisterHealthRoutesOptions): void {
  app.get(
    '/health',
    {
      schema: {
        response: {
          200: healthResponseSchema,
        },
      },
    },
    async () => getHealth(options.config),
  );

  app.get(
    '/ready',
    {
      schema: {
        response: {
          200: readySuccessResponseSchema,
          503: readyErrorResponseSchema,
        },
      },
    },
    async (_, reply) => {
      const readiness = await getReadiness(options.config);

      if (!readiness.ok) {
        reply.code(503);
      }

      return readiness;
    },
  );
}
