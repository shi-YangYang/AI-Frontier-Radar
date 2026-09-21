import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { AuthService } from '../../auth';
import {
  parseSessionToken,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from '../../auth';
import {
  DingtalkLoginError,
  DINGTALK_STATE_COOKIE_NAME,
  type DingtalkLoginService,
} from '../../auth/dingtalk';
import type { User } from '../../storage';

export interface RegisterAuthRoutesOptions {
  auth: AuthService;
  dingtalkLogin: DingtalkLoginService;
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

  app.get('/auth/providers', async (_, reply) => {
    const dingtalkEnabled = await options.dingtalkLogin.isUsable();

    return {
      ok: true,
      data: {
        dingtalk: {
          enabled: dingtalkEnabled,
        },
      },
    };
  });

  app.get('/auth/dingtalk/start', async (request, reply) => {
    if (!(await options.dingtalkLogin.isUsable())) {
      return redirectToLoginError(reply, 'dingtalk_disabled');
    }

    const state = options.dingtalkLogin.createAuthorizeState();
    const authorizeUrl = await options.dingtalkLogin.buildAuthorizeUrl(
      resolveRequestOrigin(request),
      state,
    );

    reply.header(
      'Set-Cookie',
      serializeDingtalkStateCookie(state),
    );
    reply.redirect(authorizeUrl, 302);
  });

  app.get('/auth/dingtalk/callback', async (request, reply) => {
    const query = request.query;
    const queryState = isRecord(query) && typeof query.state === 'string' ? query.state : undefined;
    const authCode =
      isRecord(query) && typeof query.authCode === 'string' ? query.authCode : undefined;

    try {
      options.dingtalkLogin.verifyAuthorizeState(
        parseCookieValue(request.headers.cookie, DINGTALK_STATE_COOKIE_NAME),
        queryState,
      );

      if (authCode === undefined || authCode.trim().length === 0) {
        throw new DingtalkLoginError('钉钉未返回授权码。');
      }

      const profile = await options.dingtalkLogin.exchangeUserProfile(authCode.trim());
      const result = await options.dingtalkLogin.loginWithProfile(profile);

      reply.header('Set-Cookie', [
        serializeClearedStateCookie(),
        serializeSessionCookie(result.token, options.sessionTtlSeconds),
      ]);
      reply.redirect(result.user.role === 'admin' ? '/' : '/portal', 302);
    } catch {
      return redirectToLoginError(reply, 'dingtalk_error');
    }
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
    nickname: user.nickname,
    role: user.role,
    updatedAt: user.updatedAt,
    username: user.username,
  };
}

/** 依据转发头与请求头推导对外可见的 origin（用于钉钉 redirect_uri）。 */
function resolveRequestOrigin(request: FastifyRequest): string {
  const forwardedProto = request.headers['x-forwarded-proto'];
  const forwardedHost = request.headers['x-forwarded-host'];
  const proto =
    (typeof forwardedProto === 'string' ? forwardedProto.split(',')[0]?.trim() : undefined) ??
    request.protocol;
  const host =
    (typeof forwardedHost === 'string' ? forwardedHost.split(',')[0]?.trim() : undefined) ??
    request.headers.host ??
    '127.0.0.1:3000';

  return `${proto}://${host}`;
}

function serializeDingtalkStateCookie(state: string): string {
  return [
    `${DINGTALK_STATE_COOKIE_NAME}=${encodeURIComponent(state)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=600',
  ].join('; ');
}

function serializeClearedStateCookie(): string {
  return [`${DINGTALK_STATE_COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'].join(
    '; ',
  );
}

function parseCookieValue(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (cookieHeader === undefined || cookieHeader.length === 0) {
    return undefined;
  }

  for (const part of cookieHeader.split(';')) {
    const separatorIndex = part.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    if (part.slice(0, separatorIndex).trim() === name) {
      return decodeURIComponent(part.slice(separatorIndex + 1).trim());
    }
  }

  return undefined;
}

function redirectToLoginError(reply: FastifyReply, errorCode: string): void {
  reply.header('Set-Cookie', serializeClearedStateCookie());
  reply.redirect(`/login?error=${errorCode}`, 302);
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
