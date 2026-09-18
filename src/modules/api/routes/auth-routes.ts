import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { AuthService } from '../../auth';
import {
  parseSessionToken,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from '../../auth';
import type { User } from '../../storage';

export interface RegisterAuthRoutesOptions {
  auth: AuthService;
  sessionTtlSeconds: number;
}

const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_ATTEMPTS = 10;

interface LoginAttemptState {
  count: number;
  windowStartedAt: number;
}

const loginAttempts = new Map<string, LoginAttemptState>();

export function registerAuthRoutes(app: FastifyInstance, options: RegisterAuthRoutesOptions): void {
  app.post('/auth/login', async (request, reply) => {
    if (isRateLimited(request)) {
      reply.code(429);

      return {
        ok: false,
        error: {
          code: 'RATE_LIMITED',
          message: '尝试过于频繁，请稍后再试。',
        },
      };
    }

    const body = request.body;

    if (!isRecord(body) || typeof body.username !== 'string' || typeof body.password !== 'string') {
      reply.code(400);

      return {
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: '用户名和密码不能为空。',
        },
      };
    }

    const result = await options.auth.login(body.username, body.password);

    if (result === null) {
      reply.code(401);

      return {
        ok: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: '用户名或密码错误。',
        },
      };
    }

    reply.header('Set-Cookie', serializeSessionCookie(result.token, options.sessionTtlSeconds));

    return {
      ok: true,
      data: {
        user: toPublicUser(result.user),
      },
    };
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = parseSessionToken(request.headers.cookie);

    if (token !== undefined) {
      await options.auth.logout(token);
    }

    reply.header('Set-Cookie', serializeClearedSessionCookie());

    return { ok: true, data: { loggedOut: true } };
  });

  app.get('/auth/me', async (request, reply) => {
    const user = await resolveRequestUser(request, options.auth);

    if (user === null) {
      reply.code(401);

      return {
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '未登录。',
        },
      };
    }

    return {
      ok: true,
      data: {
        user: toPublicUser(user),
      },
    };
  });
}

export async function resolveRequestUser(
  request: FastifyRequest,
  auth: AuthService,
): Promise<User | null> {
  const token = parseSessionToken(request.headers.cookie);

  if (token === undefined) {
    return null;
  }

  return auth.resolveSession(token);
}

function toPublicUser(user: User): User {
  return {
    createdAt: user.createdAt,
    id: user.id,
    role: user.role,
    updatedAt: user.updatedAt,
    username: user.username,
  };
}

function isRateLimited(request: FastifyRequest): boolean {
  const key = request.ip;
  const now = Date.now();
  const state = loginAttempts.get(key);

  if (state === undefined || now - state.windowStartedAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, windowStartedAt: now });

    return false;
  }

  state.count += 1;

  return state.count > LOGIN_MAX_ATTEMPTS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
