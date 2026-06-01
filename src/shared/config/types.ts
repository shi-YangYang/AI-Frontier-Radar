export type RuntimeEnvironment = 'development' | 'test' | 'production';

export type AppLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

export type XSourceMode = 'api' | 'browser';

export interface WatchAccountSeed {
  enabled: boolean;
  xUsername: string;
}

export interface FileWatchAccountsSourceConfig {
  items: WatchAccountSeed[];
  path: string;
  type: 'file';
}

export interface EnvWatchAccountsSourceConfig {
  items: WatchAccountSeed[];
  raw: string;
  type: 'env';
}

export interface DatabaseWatchAccountsSourceConfig {
  items: WatchAccountSeed[];
  type: 'database';
}

export type WatchAccountsSourceConfig =
  | DatabaseWatchAccountsSourceConfig
  | EnvWatchAccountsSourceConfig
  | FileWatchAccountsSourceConfig;

export interface XBrowserSourceConfig {
  baseUrl: string;
  headless: boolean;
  navigationTimeoutMs: number;
  postLoadTimeoutMs: number;
  proxyUrl?: string;
  userDataDir: string;
}

export interface AppConfig {
  delivery: {
    feishu: {
      targetKey: string;
      webhookUrl: string;
    };
  };
  logging: {
    level: AppLogLevel;
  };
  polling: {
    excludeReplies: boolean;
    excludeReposts: boolean;
    fetchLimitPerAccount: number;
    intervalSeconds: number;
  };
  queue: {
    redis: {
      url: string;
    };
  };
  source: {
    mode: XSourceMode;
    x: {
      apiBaseUrl?: string;
      bearerToken?: string;
      browser: XBrowserSourceConfig;
    };
  };
  service: {
    env: RuntimeEnvironment;
    host: string;
    name: string;
    port: number;
  };
  storage: {
    prisma: {
      databaseUrl: string;
    };
    sqlite: {
      path: string;
    };
  };
  watchAccounts: WatchAccountsSourceConfig;
}

export interface AppConfigSummary {
  deliveryTargetsCount: number;
  excludeReplies: boolean;
  excludeReposts: boolean;
  fetchLimitPerAccount: number;
  pollIntervalSeconds: number;
  sourceMode?: XSourceMode;
  watchAccountsCount: number;
  watchAccountsSource: WatchAccountsSourceConfig['type'];
}

export interface StartupConfigLogContext {
  host: string;
  port: number;
  redisHost: string;
  redisPort: number;
  sourceMode: XSourceMode;
  sqlitePath: string;
  watchAccountsCount: number;
  watchAccountsSource: WatchAccountsSourceConfig['type'];
}
