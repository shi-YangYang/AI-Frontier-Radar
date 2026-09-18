import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { AuthService } from '../../auth';
import type { User } from '../../storage';
import { toAdminApiErrorPayload } from '../controllers/admin-controller';
import {
  cancelUserWechatBind,
  getUserWechatBinding,
  startUserWechatBind,
  submitUserWechatLoginCode,
  unbindUserWechatAccount,
  type UserControllerOptions,
} from '../controllers/user-controller';
import { resolveRequestUser } from './auth-routes';

export interface RegisterUserRoutesOptions {
  auth: AuthService;
  userControllerOptions: UserControllerOptions;
}

export function registerUserRoutes(app: FastifyInstance, options: RegisterUserRoutesOptions): void {
  app.get('/user/api/wechat', async (request, reply) => {
    const user = await requireSession(request, reply, options.auth);

    if (user === null) {
      return reply;
    }

    return sendUserResponse(reply, () => getUserWechatBinding(user, options.userControllerOptions));
  });

  app.post('/user/api/wechat/bind', async (request, reply) => {
    const user = await requireSession(request, reply, options.auth);

    if (user === null) {
      return reply;
    }

    return sendUserResponse(reply, () => startUserWechatBind(user, options.userControllerOptions));
  });

  app.post('/user/api/wechat/bind/code', async (request, reply) => {
    const user = await requireSession(request, reply, options.auth);

    if (user === null) {
      return reply;
    }

    return sendUserResponse(reply, () =>
      submitUserWechatLoginCode(user, request.body, options.userControllerOptions),
    );
  });

  app.post('/user/api/wechat/bind/cancel', async (request, reply) => {
    const user = await requireSession(request, reply, options.auth);

    if (user === null) {
      return reply;
    }

    return sendUserResponse(reply, () => cancelUserWechatBind(user, options.userControllerOptions));
  });

  app.delete('/user/api/wechat/accounts/:accountId', async (request, reply) => {
    const user = await requireSession(request, reply, options.auth);

    if (user === null) {
      return reply;
    }

    return sendUserResponse(reply, () =>
      unbindUserWechatAccount(user, request.params, options.userControllerOptions),
    );
  });
}

async function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: AuthService,
): Promise<User | null> {
  const user = await resolveRequestUser(request, auth);

  if (user === null) {
    reply.code(401);

    await reply.send({
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '请先登录。',
      },
    });

    return null;
  }

  return user;
}

async function sendUserResponse(
  reply: FastifyReply,
  action: () => Promise<{ ok: true; data: unknown }>,
): Promise<FastifyReply> {
  try {
    const result = await action();

    return reply.send(result);
  } catch (error) {
    const { payload, statusCode } = toAdminApiErrorPayload(error);

    reply.code(statusCode);

    return reply.send(payload);
  }
}
