import type { AppConfig, XBrowserSourceConfig, XSourceMode } from '../../shared/config/types';
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
  xBrowserProxyConfigured: boolean;
  xBrowserProxyPreview: string | null;
  xBrowserProxySource: RuntimeSettingSource;
  xBrowserUserDataDir: string;
}

export interface RuntimeXSourceSettings {
  browser: {
    baseUrl: string;
    headless: boolean;
    navigationTimeoutMs: number;
    postLoadTimeoutMs: number;
    proxyConfigured: boolean;
    proxyPreview: string | null;
    proxySource: RuntimeSettingSource;
    userDataDir: string;
  };
  mode: XSourceMode;
}

export interface RuntimeSettingsSummary {
  feishu: RuntimeFeishuSettings;
  polling: RuntimePollingSettings;
  readonly: RuntimeReadonlySettings;
}

export interface SaveXBrowserSettingsInput {
  proxyUrl: string;
}

export interface SavePollingSettingsInput {
  excludeReplies: boolean;
  excludeReposts: boolean;
  fetchLimitPerAccount: number;
  intervalSeconds: number;
}

interface RuntimeXBrowserEffectiveSettings extends XBrowserSourceConfig {
  proxySource: RuntimeSettingSource;
}

export interface RuntimeSettingsServiceOptions {
  config: AppConfig;
  storage: StorageContext;
}

const POLLING_INTERVAL_SECONDS_KEY = 'polling.intervalSeconds';
const POLLING_FETCH_LIMIT_PER_ACCOUNT_KEY = 'polling.fetchLimitPerAccount';
const POLLING_EXCLUDE_REPLIES_KEY = 'polling.excludeReplies';
const POLLING_EXCLUDE_REPOSTS_KEY = 'polling.excludeReposts';
const X_BROWSER_PROXY_URL_KEY = 'source.x.browser.proxyUrl';
const POLLING_SETTING_KEYS = [
  POLLING_INTERVAL_SECONDS_KEY,
  POLLING_FETCH_LIMIT_PER_ACCOUNT_KEY,
  POLLING_EXCLUDE_REPLIES_KEY,
  POLLING_EXCLUDE_REPOSTS_KEY,
];
const X_BROWSER_SETTING_KEYS = [X_BROWSER_PROXY_URL_KEY];
const X_BROWSER_PROXY_PROTOCOLS = ['http:', 'https:', 'socks5:'] as const;

export class RuntimeSettingsService {
  public constructor(private readonly options: RuntimeSettingsServiceOptions) {}

  public async getEffectiveAppConfig(): Promise<AppConfig> {
    const [polling, browser] = await Promise.all([
      this.getEffectivePollingSettings(),
      this.getEffectiveXBrowserSettings(),
    ]);

    return {
      ...this.options.config,
      polling: {
        excludeReplies: polling.excludeReplies,
        excludeReposts: polling.excludeReposts,
        fetchLimitPerAccount: polling.fetchLimitPerAccount,
        intervalSeconds: polling.intervalSeconds,
      },
      source: {
        ...this.options.config.source,
        x: {
          ...this.options.config.source.x,
          browser: toEffectiveBrowserConfig(browser),
        },
      },
    };
  }

  public async getEffectiveXBrowserSettings(): Promise<RuntimeXBrowserEffectiveSettings> {
    const values = await this.options.storage.appSettings.getManyJson(X_BROWSER_SETTING_KEYS);
    const baseBrowser = this.options.config.source.x.browser;
    const resolvedProxy = resolveProxyUrlSetting(values, X_BROWSER_PROXY_URL_KEY, baseBrowser.proxyUrl);

    return {
      ...baseBrowser,
      ...(resolvedProxy.proxyUrl === undefined ? {} : { proxyUrl: resolvedProxy.proxyUrl }),
      proxySource: resolvedProxy.source,
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
    const [polling, feishu, browser] = await Promise.all([
      this.getEffectivePollingSettings(),
      this.getFeishuSettings(),
      this.getEffectiveXBrowserSettings(),
    ]);

    return {
      feishu,
      polling,
      readonly: this.getReadonlySettings(browser),
    };
  }

  public async getXSourceSettingsSummary(): Promise<RuntimeXSourceSettings> {
    const browser = await this.getEffectiveXBrowserSettings();

    return {
      browser: {
        baseUrl: browser.baseUrl,
        headless: browser.headless,
        navigationTimeoutMs: browser.navigationTimeoutMs,
        postLoadTimeoutMs: browser.postLoadTimeoutMs,
        proxyConfigured: browser.proxyUrl !== undefined,
        proxyPreview: previewProxyUrl(browser.proxyUrl),
        proxySource: browser.proxySource,
        userDataDir: browser.userDataDir,
      },
      mode: this.options.config.source.mode,
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

  public async saveXBrowserSettings(
    input: SaveXBrowserSettingsInput,
  ): Promise<RuntimeXSourceSettings> {
    const proxyUrl = normalizeOptionalProxyUrl(input.proxyUrl);

    if (proxyUrl === undefined) {
      await this.options.storage.appSettings.deleteByKey(X_BROWSER_PROXY_URL_KEY);
    } else {
      await this.options.storage.appSettings.setJson(X_BROWSER_PROXY_URL_KEY, proxyUrl);
    }

    return this.getXSourceSettingsSummary();
  }

  public getDefaultTargetKey(): string {
    return this.options.config.delivery.feishu.targetKey;
  }

  public getReadonlySettings(
    effectiveBrowser: RuntimeXBrowserEffectiveSettings = {
      ...this.options.config.source.x.browser,
      proxySource: 'env_default',
    },
  ): RuntimeReadonlySettings {
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
      xBrowserProxyConfigured: effectiveBrowser.proxyUrl !== undefined,
      xBrowserProxyPreview: previewProxyUrl(effectiveBrowser.proxyUrl),
      xBrowserProxySource: effectiveBrowser.proxySource,
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

export function previewProxyUrl(rawUrl: string | undefined): string | null {
  if (rawUrl === undefined || rawUrl.trim().length === 0) {
    return null;
  }

  try {
    const url = new URL(rawUrl);
    const authPrefix = url.username.length > 0 || url.password.length > 0 ? '[REDACTED]@' : '';

    return `${url.protocol}//${authPrefix}${url.host}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '[INVALID_PROXY_URL]';
  }
}

function toEffectiveBrowserConfig(
  browser: RuntimeXBrowserEffectiveSettings,
): XBrowserSourceConfig {
  const { proxySource: _proxySource, ...browserConfig } = browser;

  if (browserConfig.proxyUrl === undefined) {
    const { proxyUrl: _proxyUrl, ...withoutProxyUrl } = browserConfig;
    return withoutProxyUrl;
  }

  return browserConfig;
}

function resolveProxyUrlSetting(
  values: Record<string, unknown>,
  key: string,
  defaultValue: string | undefined,
): { proxyUrl?: string; source: RuntimeSettingSource } {
  if (!hasSetting(values, key) || values[key] === null) {
    return defaultValue === undefined
      ? { source: 'env_default' }
      : { proxyUrl: defaultValue, source: 'env_default' };
  }

  const value = values[key];

  if (typeof value !== 'string') {
    throw new Error(`App setting "${key}" must be a string or null.`);
  }

  const proxyUrl = normalizeOptionalProxyUrl(value);

  if (proxyUrl === undefined) {
    return defaultValue === undefined
      ? { source: 'env_default' }
      : { proxyUrl: defaultValue, source: 'env_default' };
  }

  return {
    proxyUrl,
    source: 'database_override',
  };
}

function normalizeOptionalProxyUrl(rawValue: string): string | undefined {
  const value = rawValue.trim();

  if (value.length === 0) {
    return undefined;
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('Proxy URL must be a valid URL.');
  }

  if (!X_BROWSER_PROXY_PROTOCOLS.includes(url.protocol as typeof X_BROWSER_PROXY_PROTOCOLS[number])) {
    throw new Error(
      `Proxy URL must use one of these protocols: ${X_BROWSER_PROXY_PROTOCOLS.join(', ')}.`,
    );
  }

  return url.toString();
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
