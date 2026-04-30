import { type FastifyInstance } from 'fastify';

import { checkAppReadiness, toAppConfigSummary } from '../../shared/config';
import type { AppConfig } from '../../shared/config/types';

interface RegisterHealthRoutesOptions {
  config: AppConfig;
}

export function registerHealthRoutes(
  app: FastifyInstance,
  options: RegisterHealthRoutesOptions,
): void {
  app.get('/health', async () => {
    return {
      ok: true,
      data: {
        service: options.config.service.name,
        status: 'ok',
        time: new Date().toISOString(),
      },
    };
  });

  app.get('/ready', async (_, reply) => {
    const readiness = await checkAppReadiness(options.config);

    if (!readiness.ready) {
      const message = readiness.database.message ?? readiness.queue.message ?? 'service dependencies are not ready';

      reply.code(503);
      return {
        ok: false,
        error: {
          code: 'DEPENDENCY_UNREADY',
          message,
        },
      };
    }

    return {
      ok: true,
      data: {
        config: readiness.config,
        database: readiness.database.status,
        queue: readiness.queue.status,
        status: 'ready',
      },
    };
  });

  app.get('/config/summary', async () => {
    return {
      ok: true,
      data: toAppConfigSummary(options.config),
    };
  });
}
