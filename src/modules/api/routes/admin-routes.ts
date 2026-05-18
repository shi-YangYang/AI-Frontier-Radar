import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { AppConfig } from '../../../shared/config/types';
import type { AdminActions } from '../controllers/admin-controller';
import {
  createAdminWatchAccount,
  deleteAdminDeliveryEvent,
  deleteAdminPollRun,
  deleteAdminWatchAccount,
  getAdminSummary,
  listAdminDeliveryEvents,
  listAdminPollRuns,
  listAdminWatchAccounts,
  renderAdminPage,
  runAdminDeliveryNow,
  runAdminPollingNow,
  toAdminApiErrorPayload,
} from '../controllers/admin-controller';
import { adminJsonResponseSchema } from '../schemas/admin';
import type { StorageContext } from '../../storage';

interface RegisterAdminRoutesOptions {
  actions?: AdminActions;
  config: AppConfig;
  storage: StorageContext;
}

export function registerAdminRoutes(app: FastifyInstance, options: RegisterAdminRoutesOptions): void {
  app.addHook('onRequest', async (request, reply) => {
    if (!isAdminPath(request.url) || isLocalRequest(request)) {
      return;
    }

    reply.code(403);

    if (isAdminApiPath(request.url)) {
      await reply.send({
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: '管理页只允许从本机访问。',
        },
      });
      return;
    }

    await reply.type('text/plain; charset=utf-8').send('管理页只允许从本机访问。');
  });

  app.get('/admin', async (_, reply) => {
    return reply.type('text/html; charset=utf-8').send(renderAdminPage());
  });

  app.get(
    '/admin/api/summary',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (_, reply) => sendAdminResponse(reply, () => getAdminSummary(options)),
  );

  app.get(
    '/admin/api/watch-accounts',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (_, reply) => sendAdminResponse(reply, () => listAdminWatchAccounts(options)),
  );

  app.post(
    '/admin/api/watch-accounts',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) => sendAdminResponse(reply, () => createAdminWatchAccount(request.body, options)),
  );

  app.delete(
    '/admin/api/watch-accounts/:id',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () => deleteAdminWatchAccount(request.params, options)),
  );

  app.get(
    '/admin/api/poll-runs',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) => sendAdminResponse(reply, () => listAdminPollRuns(request.query, options)),
  );

  app.delete(
    '/admin/api/poll-runs/:id',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) => sendAdminResponse(reply, () => deleteAdminPollRun(request.params, options)),
  );

  app.get(
    '/admin/api/delivery-events',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) => sendAdminResponse(reply, () => listAdminDeliveryEvents(request.query, options)),
  );

  app.delete(
    '/admin/api/delivery-events/:id',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) => sendAdminResponse(reply, () => deleteAdminDeliveryEvent(request.params, options)),
  );

  app.post(
    '/admin/api/actions/poll-now',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (_, reply) => sendAdminResponse(reply, () => runAdminPollingNow(options)),
  );

  app.post(
    '/admin/api/actions/delivery-now',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (_, reply) => sendAdminResponse(reply, () => runAdminDeliveryNow(options)),
  );
}

async function sendAdminResponse<T>(
  reply: FastifyReply,
  handler: () => Promise<T>,
): Promise<T | { ok: false; error: { code: string; message: string } }> {
  try {
    return await handler();
  } catch (error) {
    const { payload, statusCode } = toAdminApiErrorPayload(error);
    reply.code(statusCode);
    return payload;
  }
}

function isAdminPath(url: string): boolean {
  return url === '/admin' || url.startsWith('/admin?') || url.startsWith('/admin/');
}

function isAdminApiPath(url: string): boolean {
  return url === '/admin/api' || url.startsWith('/admin/api?') || url.startsWith('/admin/api/');
}

function isLocalRequest(request: FastifyRequest): boolean {
  return isLocalAddress(request.ip) || isLocalAddress(request.socket.remoteAddress);
}

function isLocalAddress(address: string | undefined): boolean {
  if (address === undefined) {
    return false;
  }

  const normalizedAddress = address.trim().toLowerCase();

  return (
    normalizedAddress === '127.0.0.1' ||
    normalizedAddress === '::1' ||
    normalizedAddress === '::ffff:127.0.0.1'
  );
}
