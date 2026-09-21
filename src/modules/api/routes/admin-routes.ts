import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { AppConfig } from '../../../shared/config/types';
import type { AuthService } from '../../auth';
import type { DingtalkLoginService } from '../../auth';
import type { AdminActions } from '../controllers/admin-controller';
import {
  batchDeleteAdminDeliveryEvents,
  batchDeleteAdminPollRuns,
  clearAdminDeliveryEventsHistory,
  clearAdminPollRunsHistory,
  createAdminBackup,
  createAdminDeliveryTarget,
  createAdminWatchAccount,
  deleteAdminBackup,
  deleteAdminDeliveryTarget,
  deleteAdminDeliveryEvent,
  deleteAdminPollRun,
  deleteAdminWatchAccount,
  applyAdminSourceGroup,
  clearAdminPostsHistory,
  deleteAllAdminWatchAccounts,
  deleteAdminWechatAccount,
  downloadAdminBackup,
  exportAdminPosts,
  getAdminDataSettings,
  getAdminDingtalkSettings,
  getAdminRssSettings,
  getAdminWechatStatus,
  getAdminSettings,
  getAdminSourceGroups,
  getAdminSubscriptionRules,
  getAdminSummary,
  getAdminXSourceSettings,
  listAdminDeliveryEvents,
  listAdminDeliveryTargets,
  listAdminBackups,
  listAdminLogs,
  listAdminPollRuns,
  listAdminPosts,
  listAdminWatchAccounts,
  resolveAdminYoutubeChannel,
  runAdminDeliveryNow,
  runAdminPollingNow,
  runAdminRetentionCleanup,
  startAdminWechatLogin,
  submitAdminWechatLoginCode,
  testAdminWechat,
  updateAdminWechatAccountPush,
  testAdminDeliveryTarget,
  testAdminFeishuSettings,
  testAdminXSourceAnonymous,
  toAdminApiErrorPayload,
  updateAdminDataSettings,
  updateAdminDeliveryTarget,
  updateAdminDeliveryTargetEnabled,
  updateAdminDingtalkSettings,
  updateAdminFeishuSettings,
  updateAdminRssSettings,
  updateAdminSubscriptionRules,
  updateAdminXBrowserSettings,
  updateAdminPollingSettings,
} from '../controllers/admin-controller';
import {
  createAdminUser,
  deleteAdminUser,
  listAdminUsers,
  resetAdminUserPassword,
} from '../controllers/user-controller';
import { adminJsonResponseSchema } from '../schemas/admin';
import { resolveRequestUser } from './auth-routes';
import type { WechatBindCoordinator, WechatBridgeService } from '../../wechat';
import type { RuntimeSettingsService, StorageContext } from '../../storage';

interface RegisterAdminRoutesOptions {
  actions?: AdminActions;
  auth: AuthService;
  config: AppConfig;
  dingtalkLogin: DingtalkLoginService;
  runtimeSettings?: RuntimeSettingsService;
  storage: StorageContext;
  wechatBindCoordinator?: WechatBindCoordinator;
  wechatBridge?: WechatBridgeService;
}

export function registerAdminRoutes(app: FastifyInstance, options: RegisterAdminRoutesOptions): void {
  const adminWebRoot = path.join(process.cwd(), 'dist-web', 'admin');
  const adminIndexHtmlPath = path.join(adminWebRoot, 'index.html');

  app.addHook('onRequest', async (request, reply) => {
    if (!isAdminApiPath(request.url)) {
      return;
    }

    const user = await resolveRequestUser(request, options.auth);

    if (user === null) {
      reply.code(401);

      await reply.send({
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '请先登录。',
        },
      });
      return;
    }

    if (user.role !== 'admin') {
      reply.code(403);

      await reply.send({
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: '需要管理员权限。',
        },
      });
      return;
    }
  });

  if (existsSync(adminWebRoot)) {
    app.register(fastifyStatic, {
      decorateReply: false,
      prefix: '/admin-assets/',
      root: adminWebRoot,
    });
  }

  for (const pageRoute of [
    '/',
    '/login',
    '/portal',
    '/accounts',
    '/poll-runs',
    '/posts',
    '/delivery-events',
    '/settings',
    '/logs',
  ]) {
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

  app.get(
    '/admin/api/settings/x-source',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (_, reply) => sendAdminResponse(reply, () => getAdminXSourceSettings(options)),
  );

  app.put(
    '/admin/api/settings/x-source/browser',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () => updateAdminXBrowserSettings(request.body, options)),
  );

  app.get(
    '/admin/api/settings/rss',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (_, reply) => sendAdminResponse(reply, () => getAdminRssSettings(options)),
  );

  app.put(
    '/admin/api/settings/rss',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () => updateAdminRssSettings(request.body, options)),
  );

  app.get(
    '/admin/api/settings/dingtalk',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (_, reply) => sendAdminResponse(reply, () => getAdminDingtalkSettings(options)),
  );

  app.put(
    '/admin/api/settings/dingtalk',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () => updateAdminDingtalkSettings(request.body, options)),
  );

  app.post(
    '/admin/api/posts/clear-all',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (_, reply) => sendAdminResponse(reply, () => clearAdminPostsHistory(options)),
  );

  app.get(
    '/admin/api/source-groups',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (_, reply) => sendAdminResponse(reply, () => getAdminSourceGroups(options)),
  );

  app.post(
    '/admin/api/source-groups/:id/apply',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () => applyAdminSourceGroup(request.params, options)),
  );

  app.get(
    '/admin/api/subscription-rules',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (_, reply) => sendAdminResponse(reply, () => getAdminSubscriptionRules(options)),
  );

  app.put(
    '/admin/api/subscription-rules',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () => updateAdminSubscriptionRules(request.body, options)),
  );

  app.post(
    '/admin/api/source-presets/youtube/resolve',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () => resolveAdminYoutubeChannel(request.body, options)),
  );

  app.post(
    '/admin/api/settings/x-source/test-anonymous',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () => testAdminXSourceAnonymous(request.body, options)),
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
    '/admin/api/settings/delivery-targets',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () => listAdminDeliveryTargets(request.query, options)),
  );

  app.post(
    '/admin/api/settings/delivery-targets',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () => createAdminDeliveryTarget(request.body, options)),
  );

  app.put(
    '/admin/api/settings/delivery-targets/:id',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () =>
        updateAdminDeliveryTarget(request.params, request.body, options),
      ),
  );

  app.patch(
    '/admin/api/settings/delivery-targets/:id/enabled',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () =>
        updateAdminDeliveryTargetEnabled(request.params, request.body, options),
      ),
  );

  app.delete(
    '/admin/api/settings/delivery-targets/:id',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () => deleteAdminDeliveryTarget(request.params, options)),
  );

  app.post(
    '/admin/api/settings/delivery-targets/:id/test',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () => testAdminDeliveryTarget(request.params, options)),
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
    async (request, reply) =>
      sendAdminResponse(reply, () => listAdminWatchAccounts(request.query, options)),
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

  app.post(
    '/admin/api/poll-runs/batch-delete',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () => batchDeleteAdminPollRuns(request.body, options)),
  );

  app.post(
    '/admin/api/poll-runs/clear-history',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (_, reply) => sendAdminResponse(reply, () => clearAdminPollRunsHistory(options)),
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

  app.get(
    '/admin/api/posts',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) => sendAdminResponse(reply, () => listAdminPosts(request.query, options)),
  );

  app.post(
    '/admin/api/delivery-events/batch-delete',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () => batchDeleteAdminDeliveryEvents(request.body, options)),
  );

  app.post(
    '/admin/api/delivery-events/clear-history',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (_, reply) =>
      sendAdminResponse(reply, () => clearAdminDeliveryEventsHistory(options)),
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

  app.get(
    '/admin/api/settings/data',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (_, reply) => sendAdminResponse(reply, () => getAdminDataSettings(options)),
  );

  app.put(
    '/admin/api/settings/data',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () => updateAdminDataSettings(request.body, options)),
  );

  app.post(
    '/admin/api/actions/cleanup-now',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (_, reply) => sendAdminResponse(reply, () => runAdminRetentionCleanup(options)),
  );

  app.post(
    '/admin/api/watch-accounts/delete-all',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (_, reply) => sendAdminResponse(reply, () => deleteAllAdminWatchAccounts(options)),
  );

  app.get(
    '/admin/api/users',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (_, reply) => sendAdminResponse(reply, () => listAdminUsers(options)),
  );

  app.post(
    '/admin/api/users',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () => createAdminUser(request.body, options)),
  );

  app.delete(
    '/admin/api/users/:id',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, async () => {
        const currentUser = await resolveRequestUser(request, options.auth);

        return deleteAdminUser(request.params, options, currentUser?.id ?? '');
      }),
  );

  app.put(
    '/admin/api/users/:id/password',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () => resetAdminUserPassword(request.params, request.body, options)),
  );

  app.get(
    '/admin/api/wechat/status',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (_, reply) => sendAdminResponse(reply, () => getAdminWechatStatus(options)),
  );

  app.delete(
    '/admin/api/wechat/accounts/:accountId',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () => deleteAdminWechatAccount(request.params, options)),
  );

  app.post(
    '/admin/api/wechat/login',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, async () => {
        const user = await resolveRequestUser(request, options.auth);

        if (user !== null) {
          options.wechatBindCoordinator?.begin(user.id);
        }

        return startAdminWechatLogin(request.body, options);
      }),
  );

  app.post(
    '/admin/api/wechat/login/code',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () => submitAdminWechatLoginCode(request.body, options)),
  );

  app.patch(
    '/admin/api/wechat/accounts/:accountId/push',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () =>
        updateAdminWechatAccountPush(request.params, request.body, options),
      ),
  );

  app.post(
    '/admin/api/wechat/test',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (_, reply) => sendAdminResponse(reply, () => testAdminWechat(options)),
  );

  app.get(
    '/admin/api/backups',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (_, reply) => sendAdminResponse(reply, () => listAdminBackups(options)),
  );

  app.post(
    '/admin/api/actions/backup',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (_, reply) => sendAdminResponse(reply, () => createAdminBackup(options)),
  );

  app.get(
    '/admin/api/backups/:name/download',
    async (request, reply) => {
      try {
        const { content, fileName } = await downloadAdminBackup(request.params, options);

        return reply
          .header('Content-Disposition', `attachment; filename="${fileName}"`)
          .type('application/octet-stream')
          .send(content);
      } catch (error) {
        const { payload, statusCode } = toAdminApiErrorPayload(error);
        reply.code(statusCode);
        return payload;
      }
    },
  );

  app.delete(
    '/admin/api/backups/:name',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) =>
      sendAdminResponse(reply, () => deleteAdminBackup(request.params, options)),
  );

  app.get(
    '/admin/api/logs',
    {
      schema: {
        response: adminJsonResponseSchema,
      },
    },
    async (request, reply) => sendAdminResponse(reply, async () => listAdminLogs(request.query)),
  );

  app.get('/admin/api/posts/export', async (request, reply) => {
    try {
      const { body, contentType, fileName } = await exportAdminPosts(request.query, options);

      return reply
        .header('Content-Disposition', `attachment; filename="${fileName}"`)
        .type(contentType)
        .send(body);
    } catch (error) {
      const { payload, statusCode } = toAdminApiErrorPayload(error);
      reply.code(statusCode);
      return payload;
    }
  });

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
    return reply
      .header('cache-control', 'no-cache')
      .type('text/html; charset=utf-8')
      .send(html);
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

function isAdminApiPath(url: string): boolean {
  return url === '/admin/api' || url.startsWith('/admin/api?') || url.startsWith('/admin/api/');
}
