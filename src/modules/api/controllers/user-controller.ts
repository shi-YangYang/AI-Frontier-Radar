import { AuthValidationError, type AuthService } from '../../auth';
import type { DeliveryTarget, StorageContext, User, UserRole } from '../../storage';
import {
  type WechatAccount,
  type WechatBindCoordinator,
  type WechatBridgeService,
  type WechatLoginState,
} from '../../wechat';
import { AdminApiError, type AdminControllerOptions } from './admin-controller';

export interface UserControllerOptions {
  auth: AuthService;
  storage: StorageContext;
  wechatBindCoordinator?: WechatBindCoordinator;
  wechatBridge?: WechatBridgeService;
}

const ACTIVE_LOGIN_STATUSES: ReadonlySet<string> = new Set(['need-code', 'pending', 'scanned']);

export async function listAdminUsers(options: AdminControllerOptions & UserControllerOptions): Promise<{
  ok: true;
  data: { users: Array<Omit<User, 'passwordHash'>> };
}> {
  const users = await options.auth.listUsers();

  return { ok: true, data: { users } };
}

export async function createAdminUser(
  body: unknown,
  options: UserControllerOptions,
): Promise<{ ok: true; data: { user: User } }> {
  if (
    !isRecord(body) ||
    typeof body.username !== 'string' ||
    typeof body.password !== 'string' ||
    (body.role !== 'admin' && body.role !== 'user')
  ) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '用户名、密码和角色不能为空。');
  }

  try {
    const user = await options.auth.createUser({
      password: body.password,
      role: body.role as UserRole,
      username: body.username,
    });

    return { ok: true, data: { user } };
  } catch (error) {
    throw mapUserError(error, '创建用户失败。');
  }
}

export async function deleteAdminUser(
  params: unknown,
  options: UserControllerOptions,
  currentUserId: string,
): Promise<{ ok: true; data: { deleted: boolean } }> {
  const userId = readIdParam(params);

  if (userId === currentUserId) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '不能删除当前登录账号。');
  }

  try {
    const deleted = await options.auth.deleteUser(userId);

    return { ok: true, data: { deleted } };
  } catch (error) {
    throw mapUserError(error, '删除用户失败。');
  }
}

export async function resetAdminUserPassword(
  params: unknown,
  body: unknown,
  options: UserControllerOptions,
): Promise<{ ok: true; data: { updated: boolean } }> {
  const userId = readIdParam(params);

  if (!isRecord(body) || typeof body.password !== 'string') {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'password 不能为空。');
  }

  try {
    const updated = await options.auth.resetPassword(userId, body.password);

    return { ok: true, data: { updated } };
  } catch (error) {
    throw mapUserError(error, '重置密码失败。');
  }
}

export async function getUserWechatBinding(
  user: User,
  options: UserControllerOptions,
): Promise<{
  ok: true;
  data: {
    accounts: Array<{
      accountId: string;
      displayName: string;
      enabled: boolean;
      quietHours: { enabled: boolean; endHour: number; startHour: number } | null;
      sendCount: number;
      sendLimit: number;
      sessionActive: boolean;
      sourceIds: string[];
      userId?: string;
    }>;
    login: {
      loggedIn: boolean;
      message?: string;
      qrcodeDataUrl?: string;
      qrcodeUrl?: string;
      status: string;
    };
    sources: Array<{
      displayName: string;
      id: string;
      sourceType: string;
      sourceUrl: string | null;
      xUsername: string | null;
    }>;
  };
}> {
  const state = await readSyncedWechatState(options, user.id);
  const ownTargets = state.wechatTargets.filter((target) => target.ownerUserId === user.id);
  const watchAccounts = await options.storage.watchAccounts.listAll();
  const accountById = new Map(state.accounts.map((account) => [account.accountId, account]));

  return {
    ok: true,
    data: {
      accounts: ownTargets.map((target) => ({
        accountId: target.config.accountId ?? '',
        displayName: target.displayName,
        enabled: target.enabled,
        quietHours: target.config.quietHours ?? null,
        sendCount: accountById.get(target.config.accountId ?? '')?.sendCount ?? 0,
        sendLimit: accountById.get(target.config.accountId ?? '')?.sendLimit ?? 10,
        sessionActive:
          accountById.get(target.config.accountId ?? '')?.hasContextToken === true,
        sourceIds: target.config.sourceIds ?? [],
        ...(target.config.target === undefined ? {} : { userId: target.config.target }),
      })),
      login: {
        loggedIn: ownTargets.length > 0,
        ...(state.loginState.message === undefined ? {} : { message: state.loginState.message }),
        ...(state.loginState.qrcodeDataUrl === undefined ? {} : { qrcodeDataUrl: state.loginState.qrcodeDataUrl }),
        ...(state.loginState.qrcodeUrl === undefined ? {} : { qrcodeUrl: state.loginState.qrcodeUrl }),
        status: state.loginState.status,
      },
      sources: watchAccounts.map((account) => ({
        displayName: account.displayName ?? account.sourceUrl ?? account.xUsername ?? account.id,
        id: account.id,
        sourceType: account.sourceType,
        sourceUrl: account.sourceUrl,
        xUsername: account.xUsername,
      })),
    },
  };
}

export async function updateUserWechatSources(
  user: User,
  params: unknown,
  body: unknown,
  options: UserControllerOptions,
): Promise<{ ok: true; data: { sourceIds: string[] } }> {
  if (!isRecord(params) || typeof params.accountId !== 'string' || params.accountId.trim().length === 0) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'accountId 无效。');
  }

  if (!isRecord(body) || !Array.isArray(body.sourceIds)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'sourceIds 必须是数组。');
  }

  const accountId = params.accountId.trim();
  const target = await findOwnWechatTarget(options.storage, user, accountId);

  if (target === null) {
    throw new AdminApiError(404, 'NOT_FOUND', '未找到属于你的微信绑定。');
  }

  const watchAccounts = await options.storage.watchAccounts.listAll();
  const knownSourceIds = new Set(watchAccounts.map((account) => account.id));
  const sourceIds = [
    ...new Set(
      body.sourceIds
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0 && knownSourceIds.has(entry)),
    ),
  ];
  const nextConfig = { ...target.config };

  if (sourceIds.length === 0) {
    delete nextConfig.sourceIds;
  } else {
    nextConfig.sourceIds = sourceIds;
  }

  await options.storage.deliveryTargets.update(target.id, { config: nextConfig });

  return { ok: true, data: { sourceIds } };
}

export async function startUserWechatBind(
  user: User,
  options: UserControllerOptions,
): Promise<{ ok: true; data: { qrcodeDataUrl?: string; qrcodeUrl?: string; status: string } }> {
  const service = requireWechatBridge(options);
  const coordinator = requireWechatBindCoordinator(options);
  return coordinator.runForUser(user.id, async () => {
    const synced = await coordinator.sync(service, options.storage);
    if (synced.wechatTargets.some((target) => target.ownerUserId === user.id)) {
      throw new AdminApiError(409, 'BINDING_LIMIT', '每个账号只能绑定一个微信号，请先解绑当前微信。');
    }
    const current = synced.states.get(user.id);
    if (current !== undefined && ACTIVE_LOGIN_STATUSES.has(current.status)) {
      return { ok: true, data: current };
    }
    const previousSessionId = coordinator.getSessionId(user.id);
    if (previousSessionId !== undefined) await service.cancelLogin(previousSessionId);
    const sessionId = coordinator.begin(user.id);
    try {
      const state = await service.startLogin(true, sessionId);
      return {
        ok: true,
        data: {
          ...(state.qrcodeDataUrl === undefined ? {} : { qrcodeDataUrl: state.qrcodeDataUrl }),
          ...(state.qrcodeUrl === undefined ? {} : { qrcodeUrl: state.qrcodeUrl }),
          status: state.status,
        },
      };
    } catch (error) {
      // Stop timed-out QR creation too; its late result must not remain bindable.
      await service.cancelLogin(sessionId).catch(() => undefined);
      coordinator.clear(user.id, sessionId);
      throw new AdminApiError(502, 'WECHAT_BRIDGE_FAILED', error instanceof Error ? error.message : '发起扫码绑定失败。');
    }
  });
}

export async function submitUserWechatLoginCode(
  user: User,
  body: unknown,
  options: UserControllerOptions,
): Promise<{ ok: true; data: { submitted: true } }> {
  const service = requireWechatBridge(options);

  const sessionId = requireWechatBindCoordinator(options).getSessionId(user.id);

  if (sessionId === undefined) {
    throw new AdminApiError(409, 'NO_ACTIVE_BIND', '当前没有你的扫码流程。');
  }

  if (!isRecord(body) || typeof body.code !== 'string' || body.code.trim().length === 0) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'code 不能为空。');
  }

  try {
    await service.submitLoginCode(body.code, sessionId);
  } catch (error) {
    throw new AdminApiError(
      502,
      'WECHAT_BRIDGE_FAILED',
      error instanceof Error ? error.message : '提交验证码失败。',
    );
  }

  return { ok: true, data: { submitted: true } };
}

export async function cancelUserWechatBind(
  user: User,
  options: UserControllerOptions,
): Promise<{ ok: true; data: { cancelled: boolean } }> {
  const service = requireWechatBridge(options);
  const coordinator = requireWechatBindCoordinator(options);
  return coordinator.runForUser(user.id, async () => {
    // Save an already-confirmed binding before discarding its session.
    await coordinator.sync(service, options.storage);
    const sessionId = coordinator.getSessionId(user.id);
    if (sessionId === undefined) return { ok: true, data: { cancelled: false } };
    if (!await service.cancelLogin(sessionId)) await coordinator.sync(service, options.storage);
    coordinator.clear(user.id, sessionId);
    return { ok: true, data: { cancelled: true } };
  });
}

export async function updateUserWechatQuietHours(
  user: User,
  params: unknown,
  body: unknown,
  options: UserControllerOptions,
): Promise<{
  ok: true;
  data: { quietHours: { enabled: boolean; endHour: number; startHour: number } | null };
}> {
  if (!isRecord(params) || typeof params.accountId !== 'string' || params.accountId.trim().length === 0) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'accountId 无效。');
  }

  if (!isRecord(body) || typeof body.enabled !== 'boolean') {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'enabled 必须是布尔值。');
  }

  const accountId = params.accountId.trim();
  const target = await findOwnWechatTarget(options.storage, user, accountId);

  if (target === null) {
    throw new AdminApiError(404, 'NOT_FOUND', '未找到属于你的微信绑定。');
  }

  const nextConfig = { ...target.config };

  if (body.enabled) {
    const startHour = readHour(body.startHour, 23);
    const endHour = readHour(body.endHour, 8);

    if (startHour === endHour) {
      throw new AdminApiError(400, 'INVALID_REQUEST', '静默开始与结束时间不能相同。');
    }

    nextConfig.quietHours = { enabled: true, endHour, startHour };
  } else {
    delete nextConfig.quietHours;
  }

  await options.storage.deliveryTargets.update(target.id, { config: nextConfig });

  return { ok: true, data: { quietHours: nextConfig.quietHours ?? null } };
}

export async function unbindUserWechatAccount(
  user: User,
  params: unknown,
  options: UserControllerOptions,
): Promise<{ ok: true; data: { deleted: boolean } }> {
  const service = requireWechatBridge(options);

  if (!isRecord(params) || typeof params.accountId !== 'string' || params.accountId.trim().length === 0) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'accountId 无效。');
  }

  const accountId = params.accountId.trim();
  const target = await findOwnWechatTarget(options.storage, user, accountId);

  if (target === null) {
    throw new AdminApiError(404, 'NOT_FOUND', '未找到属于你的微信绑定。');
  }

  try {
    const deleted = await service.removeAccount(accountId);

    if (deleted) {
      await options.storage.deliveryTargets.delete(target.id);
    }

    return { ok: true, data: { deleted } };
  } catch (error) {
    throw new AdminApiError(
      502,
      'WECHAT_BRIDGE_FAILED',
      error instanceof Error ? error.message : '解绑微信失败。',
    );
  }
}

async function readSyncedWechatState(options: UserControllerOptions, userId: string): Promise<{
  accounts: WechatAccount[];
  loginState: WechatLoginState;
  wechatTargets: DeliveryTarget[];
}> {
  const service = options.wechatBridge;
  if (service?.isRunning()) {
    try {
      const state = await requireWechatBindCoordinator(options).sync(service, options.storage);
      return { ...state, loginState: state.states.get(userId) ?? { loggedIn: false, status: 'idle' } };
    } catch {
      // Keep existing bindings visible while the bridge is unavailable.
    }
  }
  return {
    accounts: [],
    loginState: { loggedIn: false, status: 'unavailable' },
    wechatTargets: (await options.storage.deliveryTargets.listAll()).filter((target) => target.channelType === 'wechat_clawbot'),
  };
}

function requireWechatBindCoordinator(options: UserControllerOptions): WechatBindCoordinator {
  if (options.wechatBindCoordinator === undefined) throw new AdminApiError(503, 'WECHAT_UNAVAILABLE', '微信绑定服务未初始化。');
  return options.wechatBindCoordinator;
}

async function findOwnWechatTarget(
  storage: StorageContext,
  user: User,
  accountId: string,
): Promise<DeliveryTarget | null> {
  const targets = await storage.deliveryTargets.listAll();
  const target = targets.find(
    (entry) =>
      entry.channelType === 'wechat_clawbot' &&
      entry.config.accountId === accountId &&
      entry.ownerUserId === user.id,
  );

  return target ?? null;
}

function requireWechatBridge(options: UserControllerOptions): WechatBridgeService {
  if (options.wechatBridge === undefined) {
    throw new AdminApiError(503, 'WECHAT_UNAVAILABLE', '微信桥服务未初始化。');
  }

  return options.wechatBridge;
}

function readIdParam(params: unknown): string {
  if (!isRecord(params) || typeof params.id !== 'string' || params.id.trim().length === 0) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'id 无效。');
  }

  return params.id.trim();
}

function mapUserError(error: unknown, fallback: string): Error {
  if (error instanceof AuthValidationError) {
    return new AdminApiError(400, 'INVALID_REQUEST', error.message);
  }

  return error instanceof Error ? error : new Error(fallback);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readHour(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 23) {
    return fallback;
  }

  return value;
}

export interface UserPostItem {
  authorDisplayName: string | null;
  authorUsername: string;
  detectedAt: string;
  id: string;
  isReply: boolean;
  isRepost: boolean;
  permalinkUrl: string;
  postedAt: string;
  sourceDisplayName: string | null;
  sourceType: string;
  textContent: string;
  title: string | null;
}

export async function listUserPosts(
  query: unknown,
  options: UserControllerOptions,
): Promise<{
  ok: true;
  data: {
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
    posts: UserPostItem[];
  };
}> {
  const record = isRecord(query) ? query : {};
  const page = readPositiveInt(record.page, 1);
  const pageSize = Math.min(readPositiveInt(record.pageSize, 20), 50);
  const searchQuery =
    typeof record.query === 'string' && record.query.trim().length > 0
      ? record.query.trim()
      : undefined;
  const filter = searchQuery === undefined ? {} : { query: searchQuery };
  const total = await options.storage.xPosts.countAll(filter);
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const resolvedPage = totalPages === 0 ? 1 : Math.min(page, totalPages);
  const [posts, watchAccounts] = await Promise.all([
    options.storage.xPosts.listPage({ page: resolvedPage, pageSize, ...filter }),
    options.storage.watchAccounts.listAll(),
  ]);
  const accountByAuthorUserId = new Map(
    watchAccounts.map((account) => [account.xUserId ?? '', account]),
  );

  return {
    ok: true,
    data: {
      pagination: { page: resolvedPage, pageSize, total, totalPages },
      posts: posts.map((post) => {
        const account = accountByAuthorUserId.get(post.authorUserId ?? '');

        return {
          authorDisplayName: account?.displayName ?? null,
          authorUsername: post.authorUsername,
          detectedAt: post.detectedAt,
          id: post.id,
          isReply: post.isReply,
          isRepost: post.isRepost,
          permalinkUrl: post.permalinkUrl,
          postedAt: post.postedAt,
          sourceDisplayName: account?.displayName ?? null,
          sourceType: account?.sourceType ?? 'x',
          textContent: post.textContent,
          title: post.title,
        };
      }),
    },
  };
}

function readPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return fallback;
  }

  return value;
}
