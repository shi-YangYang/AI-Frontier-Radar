import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { WatchAccountSeed, WatchAccountsSourceConfig } from '../shared/config/types';
import { ConfigValidationError } from '../shared/env/config-validation-error';
import { EnvReader } from '../shared/env/env-reader';

const DEFAULT_WATCH_ACCOUNTS = [
  'openai',
  'AnthropicAI',
  'GoogleAI',
  'MetaAI',
  'karpathy',
  'garrytan',
  'berkeley_ai',
].join(',');

export async function loadWatchAccountsSource(
  reader: EnvReader,
  cwd: string,
): Promise<WatchAccountsSourceConfig> {
  const source = reader.readEnum('WATCH_ACCOUNTS_SOURCE', ['file', 'env', 'database'] as const, {
    defaultValue: 'env',
  });

  if (source === 'database') {
    return {
      items: [],
      type: 'database',
    };
  }

  if (source === 'env') {
    const raw = reader.readString('WATCH_ACCOUNTS', { defaultValue: DEFAULT_WATCH_ACCOUNTS });

    if (reader.hasIssues()) {
      return {
        items: [],
        raw,
        type: 'env',
      };
    }

    return {
      items: parseWatchAccountsText(raw, 'WATCH_ACCOUNTS'),
      raw,
      type: 'env',
    };
  }

  const configuredPath = reader.readString('WATCH_ACCOUNTS_FILE_PATH', { required: true });

  if (reader.hasIssues()) {
    return {
      items: [],
      path: configuredPath.length > 0 ? resolve(cwd, configuredPath) : '',
      type: 'file',
    };
  }

  const resolvedPath = resolve(cwd, configuredPath);
  const fileContent = await readFile(resolvedPath, 'utf8');

  return {
    items: parseWatchAccountsText(fileContent, 'WATCH_ACCOUNTS_FILE_PATH'),
    path: resolvedPath,
    type: 'file',
  };
}

function parseWatchAccountsText(text: string, sourceLabel: string): WatchAccountSeed[] {
  const issues: string[] = [];
  const entries = normalizeEntries(text, sourceLabel, issues);
  const dedupedAccounts = new Map<string, WatchAccountSeed>();

  for (const entry of entries) {
    const account = normalizeAccount(entry, sourceLabel, issues);

    if (account === undefined) {
      continue;
    }

    const dedupeKey = account.xUsername.toLowerCase();

    if (dedupedAccounts.has(dedupeKey)) {
      issues.push(`${sourceLabel} contains duplicate watch account "${account.xUsername}".`);
      continue;
    }

    dedupedAccounts.set(dedupeKey, account);
  }

  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }

  return [...dedupedAccounts.values()];
}

function normalizeEntries(text: string, sourceLabel: string, issues: string[]): unknown[] {
  const trimmedText = text.trim();

  if (trimmedText.length === 0) {
    issues.push(`${sourceLabel} must declare at least one watch account.`);
    return [];
  }

  if (trimmedText.startsWith('[') || trimmedText.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmedText) as unknown;

      if (Array.isArray(parsed)) {
        return parsed;
      }

      if (isPlainObject(parsed)) {
        if (Array.isArray(parsed.accounts)) {
          return parsed.accounts;
        }

        if (Array.isArray(parsed.watchAccounts)) {
          return parsed.watchAccounts;
        }
      }

      issues.push(`${sourceLabel} JSON must be an array or an object with an "accounts" array.`);
      return [];
    } catch (error) {
      issues.push(`${sourceLabel} contains invalid JSON: ${toErrorMessage(error)}`);
      return [];
    }
  }

  return trimmedText
    .split(/[\r\n,]+/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

function normalizeAccount(
  value: unknown,
  sourceLabel: string,
  issues: string[],
): WatchAccountSeed | undefined {
  if (typeof value === 'string') {
    return buildWatchAccount(value, true, sourceLabel, issues);
  }

  if (isPlainObject(value)) {
    const rawUsername =
      typeof value.xUsername === 'string'
        ? value.xUsername
        : typeof value.username === 'string'
          ? value.username
          : undefined;

    if (rawUsername === undefined) {
      issues.push(`${sourceLabel} account objects must include "xUsername" or "username".`);
      return undefined;
    }

    const enabled = typeof value.enabled === 'boolean' ? value.enabled : true;
    return buildWatchAccount(rawUsername, enabled, sourceLabel, issues);
  }

  issues.push(`${sourceLabel} contains an unsupported watch account entry.`);
  return undefined;
}

function buildWatchAccount(
  rawUsername: string,
  enabled: boolean,
  sourceLabel: string,
  issues: string[],
): WatchAccountSeed | undefined {
  const normalizedUsername = rawUsername.trim().replace(/^@/, '');

  if (!/^[A-Za-z0-9_]{1,15}$/u.test(normalizedUsername)) {
    issues.push(
      `${sourceLabel} contains invalid X username "${rawUsername}". Expected 1-15 letters, numbers, or underscores.`,
    );
    return undefined;
  }

  return {
    enabled,
    xUsername: normalizedUsername,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
