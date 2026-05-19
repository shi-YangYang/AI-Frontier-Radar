import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { AppConfig } from '../../../shared/config/types';
import type { AdminActions } from '../controllers/admin-controller';
import {
  createAdminWatchAccount,
  deleteAdminDeliveryEvent,
  deleteAdminPollRun,
  deleteAdminWatchAccount,
  getAdminSettings,
  getAdminSummary,
  listAdminDeliveryEvents,
  listAdminPollRuns,
  listAdminWatchAccounts,
  runAdminDeliveryNow,
  runAdminPollingNow,
  testAdminFeishuSettings,
  toAdminApiErrorPayload,
  updateAdminFeishuSettings,
  updateAdminPollingSettings,
} from '../controllers/admin-controller';
import { adminJsonResponseSchema } from '../schemas/admin';
import type { RuntimeSettingsService, StorageContext } from '../../storage';

interface RegisterAdminRoutesOptions {
  actions?: AdminActions;
  config: AppConfig;
  runtimeSettings?: RuntimeSettingsService;
  storage: StorageContext;
}

export function registerAdminRoutes(app: FastifyInstance, options: RegisterAdminRoutesOptions): void {
  const adminWebRoot = path.join(process.cwd(), 'dist-web', 'admin');
  const adminIndexHtmlPath = path.join(adminWebRoot, 'index.html');

  app.addHook('onRequest', async (request, reply) => {
    if (!isProtectedAdminPath(request.url) || isLocalRequest(request)) {
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

  if (existsSync(adminWebRoot)) {
    app.register(fastifyStatic, {
      decorateReply: false,
      prefix: '/admin-assets/',
      root: adminWebRoot,
    });
  }

  for (const pageRoute of ['/', '/accounts', '/poll-runs', '/delivery-events', '/settings']) {
    app.get(pageRoute, async (_, reply) => sendAdminIndexHtml(reply, adminIndexHtmlPath));
  }

  app.get(
    '/admin/api/settings',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (_, reply) => sendAdminResponse(reply, () => getAdminSettings(options)),
  );

  app.put(
    '/admin/api/settings/polling',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () => updateAdminPollingSettings(request.body, options)),
  );

  app.put(
    '/admin/api/settings/feishu',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () => updateAdminFeishuSettings(request.body, options)),
  );

  app.post(
    '/admin/api/settings/feishu/test',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (_, reply) => sendAdminResponse(reply, () => testAdminFeishuSettings(options)),
  );

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

async function sendAdminIndexHtml(reply: FastifyReply, adminIndexHtmlPath: string): Promise<FastifyReply> {
  try {
    const html = await readFile(adminIndexHtmlPath, 'utf8');
    return reply.type('text/html; charset=utf-8').send(html);
  } catch {
    reply.code(503);
    return reply.type('text/plain; charset=utf-8').send('管理前端尚未构建。请先运行 npm run build。');
  }
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

function isProtectedAdminPath(url: string): boolean {
  return (
    url === '/' ||
    url.startsWith('/?') ||
    url === '/accounts' ||
    url.startsWith('/accounts?') ||
    url === '/poll-runs' ||
    url.startsWith('/poll-runs?') ||
    url === '/delivery-events' ||
    url.startsWith('/delivery-events?') ||
    url === '/settings' ||
    url.startsWith('/settings?') ||
    url === '/admin' ||
    url.startsWith('/admin?') ||
    url.startsWith('/admin/') ||
    url === '/admin-assets' ||
    url.startsWith('/admin-assets?') ||
    url.startsWith('/admin-assets/')
  );
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
