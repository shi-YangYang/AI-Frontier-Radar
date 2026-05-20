import type { AppConfig } from '../../shared/config/types';
import type { StorageContext } from './storage';

export type RuntimeSettingSource = 'database_override' | 'env_default';

export interface RuntimePollingSettings {
  excludeReplies: boolean;
  excludeReposts: boolean;
  fetchLimitPerAccount: number;
  intervalSeconds: number;
  sources: {
    excludeReplies: RuntimeSettingSource;
    excludeReposts: RuntimeSettingSource;
    fetchLimitPerAccount: RuntimeSettingSource;
    intervalSeconds: RuntimeSettingSource;
  };
}

export interface RuntimeFeishuSettings {
  configured: boolean;
  webhookPreview: string | null;
}

export interface RuntimeReadonlySettings {
  redisConfigured: boolean;
  redisUrlPreview: string | null;
  serviceEnv: string;
  serviceHost: string;
  servicePort: number;
  sourceMode: string;
  sqlitePath: string;
  xBrowserBaseUrl: string;
  xBrowserHeadless: boolean;
  xBrowserUserDataDir: string;
}

export interface RuntimeSettingsSummary {
  feishu: RuntimeFeishuSettings;
  polling: RuntimePollingSettings;
  readonly: RuntimeReadonlySettings;
}

export interface SavePollingSettingsInput {
  excludeReplies: boolean;
  excludeReposts: boolean;
  fetchLimitPerAccount: number;
  intervalSeconds: number;
}

export interface RuntimeSettingsServiceOptions {
  config: AppConfig;
  storage: StorageContext;
}

const POLLING_INTERVAL_SECONDS_KEY = 'polling.intervalSeconds';
const POLLING_FETCH_LIMIT_PER_ACCOUNT_KEY = 'polling.fetchLimitPerAccount';
const POLLING_EXCLUDE_REPLIES_KEY = 'polling.excludeReplies';
const POLLING_EXCLUDE_REPOSTS_KEY = 'polling.excludeReposts';
const POLLING_SETTING_KEYS = [
  POLLING_INTERVAL_SECONDS_KEY,
  POLLING_FETCH_LIMIT_PER_ACCOUNT_KEY,
  POLLING_EXCLUDE_REPLIES_KEY,
  POLLING_EXCLUDE_REPOSTS_KEY,
];

export class RuntimeSettingsService {
  public constructor(private readonly options: RuntimeSettingsServiceOptions) {}

  public async getEffectiveAppConfig(): Promise<AppConfig> {
    const polling = await this.getEffectivePollingSettings();

    return {
      ...this.options.config,
      polling: {
        excludeReplies: polling.excludeReplies,
        excludeReposts: polling.excludeReposts,
        fetchLimitPerAccount: polling.fetchLimitPerAccount,
        intervalSeconds: polling.intervalSeconds,
      },
    };
  }

  public async getEffectivePollingSettings(): Promise<RuntimePollingSettings> {
    const values = await this.options.storage.appSettings.getManyJson(POLLING_SETTING_KEYS);
    const basePolling = this.options.config.polling;

    return {
      excludeReplies: resolveBooleanSetting(
        values,
        POLLING_EXCLUDE_REPLIES_KEY,
        basePolling.excludeReplies,
      ),
      excludeReposts: resolveBooleanSetting(
        values,
        POLLING_EXCLUDE_REPOSTS_KEY,
        basePolling.excludeReposts,
      ),
      fetchLimitPerAccount: resolveIntegerSetting(
        values,
        POLLING_FETCH_LIMIT_PER_ACCOUNT_KEY,
        basePolling.fetchLimitPerAccount,
        1,
        100,
      ),
      intervalSeconds: resolveIntegerSetting(
        values,
        POLLING_INTERVAL_SECONDS_KEY,
        basePolling.intervalSeconds,
        10,
        3600,
      ),
      sources: {
        excludeReplies: resolveSettingSource(values, POLLING_EXCLUDE_REPLIES_KEY),
        excludeReposts: resolveSettingSource(values, POLLING_EXCLUDE_REPOSTS_KEY),
        fetchLimitPerAccount: resolveSettingSource(values, POLLING_FETCH_LIMIT_PER_ACCOUNT_KEY),
        intervalSeconds: resolveSettingSource(values, POLLING_INTERVAL_SECONDS_KEY),
      },
    };
  }

  public async getFeishuSettings(): Promise<RuntimeFeishuSettings> {
    const targets = await this.options.storage.deliveryTargets.listEnabled();
    const webhookUrl = targets[0]?.webhookUrl.trim() ?? '';

    return {
      configured: targets.some((target) => target.webhookUrl.trim().length > 0),
      webhookPreview: webhookUrl.length === 0 ? null : previewSecretUrl(webhookUrl),
    };
  }

  public async getSettingsSummary(): Promise<RuntimeSettingsSummary> {
    const [polling, feishu] = await Promise.all([
      this.getEffectivePollingSettings(),
      this.getFeishuSettings(),
    ]);

    return {
      feishu,
      polling,
      readonly: this.getReadonlySettings(),
    };
  }

  public async saveFeishuWebhook(webhookUrl: string): Promise<RuntimeFeishuSettings> {
    await this.options.storage.deliveryTargets.upsertByTargetKey({
      channelType: 'feishu_webhook',
      displayName: `Feishu Webhook (${this.getDefaultTargetKey()})`,
      enabled: true,
      targetKey: this.getDefaultTargetKey(),
      webhookUrl,
    });

    return this.getFeishuSettings();
  }

  public async savePollingSettings(input: SavePollingSettingsInput): Promise<RuntimePollingSettings> {
    await Promise.all([
      this.options.storage.appSettings.setJson(POLLING_INTERVAL_SECONDS_KEY, input.intervalSeconds),
      this.options.storage.appSettings.setJson(
        POLLING_FETCH_LIMIT_PER_ACCOUNT_KEY,
        input.fetchLimitPerAccount,
      ),
      this.options.storage.appSettings.setJson(POLLING_EXCLUDE_REPLIES_KEY, input.excludeReplies),
      this.options.storage.appSettings.setJson(POLLING_EXCLUDE_REPOSTS_KEY, input.excludeReposts),
    ]);

    return this.getEffectivePollingSettings();
  }

  public getDefaultTargetKey(): string {
    return this.options.config.delivery.feishu.targetKey;
  }

  public getReadonlySettings(): RuntimeReadonlySettings {
    const config = this.options.config;
    const redisUrlPreview = previewRedisUrl(config.queue.redis.url);

    return {
      redisConfigured: config.queue.redis.url.trim().length > 0,
      redisUrlPreview,
      serviceEnv: config.service.env,
      serviceHost: config.service.host,
      servicePort: config.service.port,
      sourceMode: config.source.mode,
      sqlitePath: config.storage.sqlite.path,
      xBrowserBaseUrl: config.source.x.browser.baseUrl,
      xBrowserHeadless: config.source.x.browser.headless,
      xBrowserUserDataDir: config.source.x.browser.userDataDir,
    };
  }
}

export function createRuntimeSettingsService(
  options: RuntimeSettingsServiceOptions,
): RuntimeSettingsService {
  return new RuntimeSettingsService(options);
}

export function previewSecretUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
    const lastSegment = segments.at(-1);

    if (lastSegment === undefined) {
      return url.origin;
    }

    const redactedLastSegment =
      lastSegment.length <= 8
        ? '[REDACTED]'
        : `${lastSegment.slice(0, 2)}***${lastSegment.slice(-4)}`;
    const redactedPath = [...segments.slice(0, -1), redactedLastSegment].join('/');

    return `${url.origin}/${redactedPath}`;
  } catch {
    return '[INVALID_URL]';
  }
}

function resolveBooleanSetting(
  values: Record<string, unknown>,
  key: string,
  defaultValue: boolean,
): boolean {
  if (!hasSetting(values, key)) {
    return defaultValue;
  }

  const value = values[key];

  if (typeof value !== 'boolean') {
    throw new Error(`App setting "${key}" must be a boolean.`);
  }

  return value;
}

function resolveIntegerSetting(
  values: Record<string, unknown>,
  key: string,
  defaultValue: number,
  min: number,
  max: number,
): number {
  if (!hasSetting(values, key)) {
    return defaultValue;
  }

  const value = values[key];

  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`App setting "${key}" must be an integer from ${min} to ${max}.`);
  }

  return value;
}

function resolveSettingSource(values: Record<string, unknown>, key: string): RuntimeSettingSource {
  return hasSetting(values, key) ? 'database_override' : 'env_default';
}

function hasSetting(values: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(values, key);
}

function previewRedisUrl(rawUrl: string): string | null {
  if (rawUrl.trim().length === 0) {
    return null;
  }

  try {
    const url = new URL(rawUrl);
    const authPrefix = url.username.length > 0 || url.password.length > 0 ? '[REDACTED]@' : '';
    return `${url.protocol}//${authPrefix}${url.host}${url.pathname}`;
  } catch {
    return '[INVALID_REDIS_URL]';
  }
}
