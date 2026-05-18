import { resolve } from 'node:path';

import { toPrismaSqliteDatabaseUrl } from '../shared/config';
import type { AppConfig, AppLogLevel, RuntimeEnvironment } from '../shared/config/types';
import { ConfigValidationError } from '../shared/env/config-validation-error';
import { EnvReader, type EnvSource } from '../shared/env/env-reader';
import { loadLocalEnv } from './local-env';
import { loadWatchAccountsSource } from './watch-accounts';

const DEFAULT_FETCH_LIMIT = 5;
const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_LOG_LEVEL: Record<RuntimeEnvironment, AppLogLevel> = {
  development: 'debug',
  production: 'info',
  test: 'info',
};
const DEFAULT_POLL_INTERVAL_SECONDS = 300;
const DEFAULT_PORT = 3000;
const DEFAULT_SERVICE_NAME = 'ai-news-monitor';
const DEFAULT_SQLITE_PATH = '.data/ai-news-monitor.sqlite';
const DEFAULT_REDIS_URL = 'redis://127.0.0.1:1';
const DEFAULT_TARGET_KEY = 'feishu-main';
const DEFAULT_X_BROWSER_BASE_URL = 'https://x.com';
const DEFAULT_X_BROWSER_NAVIGATION_TIMEOUT_MS = 30_000;
const DEFAULT_X_BROWSER_POST_LOAD_TIMEOUT_MS = 15_000;
const DEFAULT_X_BROWSER_USER_DATA_DIR = '.x-browser-public-profile';

interface LoadAppConfigOption {
  cwd?: string;
  env?: EnvSource;
}

export async function loadAppConfig(options: LoadAppConfigOption = {}): Promise<AppConfig> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? loadLocalEnv(cwd);
  const reader = new EnvReader(env);

  const serviceEnv = reader.readEnum('NODE_ENV', ['development', 'test', 'production'] as const, {
    defaultValue: 'development',
  });
  const host = reader.readString('HOST', { defaultValue: DEFAULT_HOST });
  const port = reader.readInteger('PORT', {
    defaultValue: DEFAULT_PORT,
    max: 65_535,
    min: 1,
  });
  const sqlitePath = resolve(cwd, reader.readString('SQLITE_PATH', {
    defaultValue: DEFAULT_SQLITE_PATH,
  }));
  const prismaDatabaseUrl = toPrismaSqliteDatabaseUrl(sqlitePath);
  const redisUrl = reader.readUrl('REDIS_URL', {
    defaultValue: DEFAULT_REDIS_URL,
    protocols: ['redis:', 'rediss:'],
  });
  const feishuWebhookUrl = reader.readUrl('FEISHU_WEBHOOK_URL', {
    protocols: ['https:'],
    required: true,
  });
  const sourceMode = reader.readEnum('X_SOURCE_MODE', ['api', 'browser'] as const, {
    defaultValue: 'browser',
  });
  const xApiBaseUrl = reader.readUrl('X_API_BASE_URL', {
    protocols: ['http:', 'https:'],
    required: sourceMode === 'api',
  });
  const xApiBearerToken = reader.readString('X_API_BEARER_TOKEN', {
    required: sourceMode === 'api',
  });
  const xBrowserUserDataDir = resolve(
    cwd,
    reader.readString('X_BROWSER_USER_DATA_DIR', {
      defaultValue: DEFAULT_X_BROWSER_USER_DATA_DIR,
    }),
  );
  const xBrowserHeadless = reader.readBoolean('X_BROWSER_HEADLESS', { defaultValue: true });
  const xBrowserBaseUrl = reader.readUrl('X_BROWSER_BASE_URL', {
    defaultValue: DEFAULT_X_BROWSER_BASE_URL,
    protocols: ['http:', 'https:'],
  });
  const xBrowserNavigationTimeoutMs = reader.readInteger('X_BROWSER_NAVIGATION_TIMEOUT_MS', {
    defaultValue: DEFAULT_X_BROWSER_NAVIGATION_TIMEOUT_MS,
    max: 120_000,
    min: 1_000,
  });
  const xBrowserPostLoadTimeoutMs = reader.readInteger('X_BROWSER_POST_LOAD_TIMEOUT_MS', {
    defaultValue: DEFAULT_X_BROWSER_POST_LOAD_TIMEOUT_MS,
    max: 120_000,
    min: 1_000,
  });
  const pollIntervalSeconds = reader.readInteger('POLL_INTERVAL_SECONDS', {
    defaultValue: DEFAULT_POLL_INTERVAL_SECONDS,
    max: 3_600,
    min: 10,
  });
  const fetchLimitPerAccount = reader.readInteger('FETCH_LIMIT_PER_ACCOUNT', {
    defaultValue: DEFAULT_FETCH_LIMIT,
    max: 100,
    min: 1,
  });
  const excludeReplies = reader.readBoolean('EXCLUDE_REPLIES', { defaultValue: true });
  const excludeReposts = reader.readBoolean('EXCLUDE_REPOSTS', { defaultValue: true });
  const logLevel = reader.readEnum(
    'LOG_LEVEL',
    ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const,
    { defaultValue: DEFAULT_LOG_LEVEL[serviceEnv] },
  );

  let watchAccounts = {
    items: [],
    type: 'database',
  } as AppConfig['watchAccounts'];

  try {
    watchAccounts = await loadWatchAccountsSource(reader, cwd);
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      reader.addIssues(error.issues);
    } else if (error instanceof Error) {
      reader.addIssue(error.message);
    } else {
      reader.addIssue(String(error));
    }
  }

  reader.assertValid();

  return {
    delivery: {
      feishu: {
        targetKey: DEFAULT_TARGET_KEY,
        webhookUrl: feishuWebhookUrl,
      },
    },
    logging: {
      level: logLevel,
    },
    polling: {
      excludeReplies,
      excludeReposts,
      fetchLimitPerAccount,
      intervalSeconds: pollIntervalSeconds,
    },
    queue: {
      redis: {
        url: redisUrl,
      },
    },
    source: {
      mode: sourceMode,
      x: {
        apiBaseUrl: xApiBaseUrl.length > 0 ? xApiBaseUrl : undefined,
        bearerToken: xApiBearerToken.length > 0 ? xApiBearerToken : undefined,
        browser: {
          baseUrl: xBrowserBaseUrl,
          headless: xBrowserHeadless,
          navigationTimeoutMs: xBrowserNavigationTimeoutMs,
          postLoadTimeoutMs: xBrowserPostLoadTimeoutMs,
          userDataDir: xBrowserUserDataDir,
        },
      },
    },
    service: {
      env: serviceEnv,
      host,
      name: DEFAULT_SERVICE_NAME,
      port,
    },
    storage: {
      prisma: {
        databaseUrl: prismaDatabaseUrl,
      },
      sqlite: {
        path: sqlitePath,
      },
    },
    watchAccounts,
  };
}
