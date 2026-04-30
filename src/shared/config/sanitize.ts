import { parseRedisEndpoint } from './redis';
import type { AppConfig, AppConfigSummary, StartupConfigLogContext } from './types';

const SENSITIVE_KEY_PATTERN = /authorization|password|secret|token|webhook/i;

export function redactSensitiveValues<T>(value: T): T {
  return redactValue(value, undefined, new WeakSet<object>()) as T;
}

export function toAppConfigSummary(config: AppConfig): AppConfigSummary {
  return {
    deliveryTargetsCount: 1,
    excludeReplies: config.polling.excludeReplies,
    excludeReposts: config.polling.excludeReposts,
    fetchLimitPerAccount: config.polling.fetchLimitPerAccount,
    pollIntervalSeconds: config.polling.intervalSeconds,
    sourceMode: config.source.mode,
    watchAccountsCount: config.watchAccounts.items.length,
    watchAccountsSource: config.watchAccounts.type,
  };
}

export function toStartupConfigLogContext(config: AppConfig): StartupConfigLogContext {
  const redisEndpoint = parseRedisEndpoint(config.queue.redis.url);

  return {
    host: config.service.host,
    port: config.service.port,
    redisHost: redisEndpoint.host,
    redisPort: redisEndpoint.port,
    sourceMode: config.source.mode,
    sqlitePath: config.storage.sqlite.path,
    watchAccountsCount: config.watchAccounts.items.length,
    watchAccountsSource: config.watchAccounts.type,
  };
}

function redactValue(value: unknown, currentKey: string | undefined, seen: WeakSet<object>): unknown {
  if (currentKey !== undefined && SENSITIVE_KEY_PATTERN.test(currentKey)) {
    return '[REDACTED]';
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, undefined, seen));
  }

  if (typeof value === 'object' && value !== null) {
    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, redactValue(entryValue, key, seen)]),
    );
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
