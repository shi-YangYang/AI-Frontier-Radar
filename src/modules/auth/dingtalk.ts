import { createHash, randomBytes } from 'node:crypto';

import type { AppLogger } from '../../lib/logger';
import type { StorageContext } from '../storage';
import { AuthValidationError } from './auth-service';
import type { LoginResult } from './auth-service';

export interface DingtalkSettings {
  appKey: string;
  appSecret: string;
  /** 可选；配置后走专属账号登录（仅本企业成员可扫码） */
  corpId: string;
  enabled: boolean;
}

export interface DingtalkAdminSettingsView {
  appKey: string;
  appSecretConfigured: boolean;
  appSecretPreview: string | null;
  corpId: string;
  callbackPath: string;
  enabled: boolean;
}

export interface SaveDingtalkSettingsInput {
  appKey?: string;
  /** undefined = 保持不变；空字符串 = 清除；非空 = 覆盖 */
  appSecret?: string;
  corpId?: string;
  enabled?: boolean;
}

export interface DingtalkUserProfile {
  nick: string;
  openId: string | null;
  unionId: string;
}

export interface DingtalkLoginServiceOptions {
  auth: { issueSessionForUser: (user: { id: string }) => Promise<LoginResult> };
  logger?: AppLogger;
  storage: StorageContext;
}

const SETTINGS_KEY = 'auth.dingtalk';
export const DINGTALK_STATE_COOKIE_NAME = 'afr_dingtalk_state';
const AUTHORIZE_URL = 'https://login.dingtalk.com/oauth2/auth';
const CALLBACK_PATH = '/auth/dingtalk/callback';
const TOKEN_URL = 'https://api.dingtalk.com/v1.0/oauth2/userAccessToken';
const USER_INFO_URL = 'https://api.dingtalk.com/v1.0/contact/users/me';
const DINGTALK_HTTP_TIMEOUT_MS = 10_000;
const USERNAME_ALLOCATE_ATTEMPTS = 5;

export class DingtalkLoginError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'DingtalkLoginError';
  }
}

export class DingtalkLoginService {
  private readonly auth: DingtalkLoginServiceOptions['auth'];
  private readonly logger?: AppLogger;
  private readonly storage: StorageContext;

  public constructor(options: DingtalkLoginServiceOptions) {
    this.auth = options.auth;
    this.logger = options.logger;
    this.storage = options.storage;
  }

  public async getStoredSettings(): Promise<DingtalkSettings> {
    const stored = await this.storage.appSettings.getJson<Partial<DingtalkSettings>>(SETTINGS_KEY);
    const appKey = normalizeString(stored?.appKey);
    const appSecret = normalizeString(stored?.appSecret);

    return {
      appKey,
      appSecret,
      corpId: normalizeString(stored?.corpId),
      enabled: stored?.enabled === true,
    };
  }

  public getCallbackPath(): string {
    return CALLBACK_PATH;
  }

  public async isUsable(): Promise<boolean> {
    const settings = await this.getStoredSettings();

    return settings.enabled && settings.appKey.length > 0 && settings.appSecret.length > 0;
  }

  public async getAdminSettings(): Promise<DingtalkAdminSettingsView> {
    const settings = await this.getStoredSettings();
    const configured = settings.appSecret.length > 0;

    return {
      appKey: settings.appKey,
      appSecretConfigured: configured,
      appSecretPreview: configured ? maskSecret(settings.appSecret) : null,
      corpId: settings.corpId,
      callbackPath: CALLBACK_PATH,
      enabled: settings.enabled,
    };
  }

  public async saveAdminSettings(
    input: SaveDingtalkSettingsInput,
  ): Promise<DingtalkAdminSettingsView> {
    const current = await this.getStoredSettings();
    const appKey = input.appKey === undefined ? current.appKey : input.appKey.trim();
    const appSecret = input.appSecret === undefined ? current.appSecret : input.appSecret.trim();
    const corpId = input.corpId === undefined ? current.corpId : input.corpId.trim();
    const enabled = input.enabled ?? current.enabled;

    if (enabled && (appKey.length === 0 || appSecret.length === 0)) {
      throw new AuthValidationError('启用钉钉登录前需填写 AppKey 与 AppSecret。');
    }

    await this.storage.appSettings.setJson(SETTINGS_KEY, {
      appKey,
      appSecret,
      corpId,
      enabled,
    } satisfies DingtalkSettings);

    this.logger?.info?.({ enabled }, '钉钉登录配置已保存');

    return this.getAdminSettings();
  }

  public async buildAuthorizeUrl(origin: string, state: string): Promise<string> {
    const settings = await this.getStoredSettings();
    assertConfigured(settings);

    const params = new URLSearchParams({
      client_id: settings.appKey,
      prompt: 'consent',
      redirect_uri: `${origin}${CALLBACK_PATH}`,
      response_type: 'code',
      scope: 'openid',
      state,
    });

    // 专属账号登录：限制仅本企业成员可扫码
    if (settings.corpId.length > 0) {
      params.set('exclusiveLogin', 'true');
      params.set('exclusiveCorpId', settings.corpId);
    }

    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  public createAuthorizeState(): string {
    return randomBytes(24).toString('base64url');
  }

  public verifyAuthorizeState(cookieState: string | undefined, queryState: string | undefined): void {
    if (
      cookieState === undefined ||
      cookieState.length === 0 ||
      queryState === undefined ||
      queryState.length === 0 ||
      cookieState !== queryState
    ) {
      throw new DingtalkLoginError('钉钉登录状态校验失败，请重新发起登录。');
    }
  }

  public async exchangeUserProfile(authCode: string): Promise<DingtalkUserProfile> {
    const settings = await this.getStoredSettings();
    assertConfigured(settings);

    const tokenResponse = await requestJson<{ accessToken?: string; errmsg?: string }>(TOKEN_URL, {
      clientId: settings.appKey,
      clientSecret: settings.appSecret,
      code: authCode,
      grantType: 'authorization_code',
    });

    const accessToken = normalizeString(tokenResponse.accessToken);

    if (accessToken.length === 0) {
      throw new DingtalkLoginError(
        `钉钉授权码换取凭证失败：${normalizeString(tokenResponse.errmsg) || '未返回 accessToken'}`,
      );
    }

    const profile = await requestJson<{
      nick?: string;
      openId?: string;
      unionId?: string;
    }>(USER_INFO_URL, undefined, { 'x-acs-dingtalk-access-token': accessToken });

    const unionId = normalizeString(profile.unionId);

    if (unionId.length === 0) {
      throw new DingtalkLoginError('钉钉未返回用户标识（unionId）。');
    }

    return {
      nick: normalizeString(profile.nick),
      openId: normalizeString(profile.openId) || null,
      unionId,
    };
  }

  public async loginWithProfile(profile: DingtalkUserProfile): Promise<LoginResult> {
    const existing = await this.storage.users.findByDingtalkUnionId(profile.unionId);

    if (existing !== null) {
      // 昵称变化时同步刷新，保证用户列表可读
      if (profile.nick.length > 0 && profile.nick !== existing.nickname) {
        await this.storage.users.updateNickname(existing.id, profile.nick);
      }

      return this.auth.issueSessionForUser(existing);
    }

    const username = await this.allocateUsername(profile.nick, profile.unionId);
    const user = await this.storage.users.create({
      // 钉钉账号不持有可用密码；置为随机哈希避免可猜测的口令
      passwordHash: hashUnusablePassword(),
      role: 'user',
      username,
      dingtalkUnionId: profile.unionId,
      nickname: profile.nick.length > 0 ? profile.nick : null,
    });

    this.logger?.info?.({ username }, '钉钉登录已自动创建普通用户');

    return this.auth.issueSessionForUser(user);
  }

  private async allocateUsername(nick: string, unionId: string): Promise<string> {
    // 中文等非 ASCII 昵称清洗后为空，用 unionId 哈希保证可区分且稳定
    const base = sanitizeUsernameBase(nick) || createHash('sha256').update(unionId).digest('hex').slice(0, 8);

    for (let attempt = 0; attempt < USERNAME_ALLOCATE_ATTEMPTS; attempt += 1) {
      const candidate = attempt === 0 ? `ding_${base}` : `ding_${base}_${attempt + 1}`;

      if ((await this.storage.users.findByUsername(candidate)) === null) {
        return candidate;
      }
    }

    return `ding_${randomBytes(4).toString('hex')}`;
  }
}

export function createDingtalkLoginService(
  options: DingtalkLoginServiceOptions,
): DingtalkLoginService {
  return new DingtalkLoginService(options);
}

function assertConfigured(settings: DingtalkSettings): void {
  if (!settings.enabled) {
    throw new DingtalkLoginError('钉钉登录未启用。');
  }

  if (settings.appKey.length === 0 || settings.appSecret.length === 0) {
    throw new DingtalkLoginError('钉钉登录缺少 AppKey 或 AppSecret 配置。');
  }
}

async function requestJson<TResponse>(
  url: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<TResponse> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), DINGTALK_HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      method: body === undefined ? 'GET' : 'POST',
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: unknown = null;

    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      throw new DingtalkLoginError(
        `钉钉接口请求失败（HTTP ${response.status}）：${truncateSnippet(text)}`,
      );
    }

    if (parsed === null || typeof parsed !== 'object') {
      throw new DingtalkLoginError(`钉钉接口响应无法解析：${truncateSnippet(text)}`);
    }

    return parsed as TResponse;
  } catch (error) {
    if (error instanceof DingtalkLoginError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new DingtalkLoginError('钉钉接口请求超时。');
    }

    throw new DingtalkLoginError(
      `钉钉接口请求失败：${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function maskSecret(secret: string): string {
  if (secret.length <= 8) {
    return '[REDACTED]';
  }

  return `***${secret.slice(-4)}`;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeUsernameBase(nick: string): string {
  return nick
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .slice(0, 20);
}

function truncateSnippet(value: string): string {
  return value.length > 200 ? `${value.slice(0, 200)}…` : value;
}

function hashUnusablePassword(): string {
  return createHash('sha256').update(randomBytes(32)).digest('hex');
}
