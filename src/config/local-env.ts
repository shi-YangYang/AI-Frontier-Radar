import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { EnvSource } from '../shared/env/env-reader';

const LOCAL_ENV_FILE_NAME = '.env';

export function loadLocalEnv(cwd = process.cwd(), baseEnv: EnvSource = process.env): EnvSource {
  const filePath = resolve(cwd, LOCAL_ENV_FILE_NAME);
  const fileEnv = existsSync(filePath) ? parseLocalEnvContent(readFileSync(filePath, 'utf8')) : {};

  return {
    ...fileEnv,
    ...baseEnv,
  };
}

export function parseLocalEnvContent(content: string): Record<string, string> {
  const env: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const parsedLine = parseLocalEnvLine(rawLine);

    if (parsedLine === null) {
      continue;
    }

    env[parsedLine.name] = parsedLine.value;
  }

  return env;
}

function parseLocalEnvLine(line: string): { name: string; value: string } | null {
  const trimmedLine = line.trim();

  if (trimmedLine.length === 0 || trimmedLine.startsWith('#')) {
    return null;
  }

  const dotenvMatch = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(trimmedLine);

  if (dotenvMatch !== null) {
    return {
      name: dotenvMatch[1],
      value: parseLocalEnvValue(dotenvMatch[2]),
    };
  }

  return null;
}

function parseLocalEnvValue(rawValue: string): string {
  const trimmedValue = rawValue.trim();

  if (trimmedValue.startsWith("'")) {
    const closingIndex = trimmedValue.lastIndexOf("'");

    if (closingIndex > 0) {
      return trimmedValue.slice(1, closingIndex).replace(/''/gu, "'");
    }
  }

  if (trimmedValue.startsWith('"')) {
    const closingIndex = trimmedValue.lastIndexOf('"');

    if (closingIndex > 0) {
      return trimmedValue
        .slice(1, closingIndex)
        .replace(/\\n/gu, '\n')
        .replace(/\\r/gu, '\r')
        .replace(/\\t/gu, '\t')
        .replace(/\\"/gu, '"')
        .replace(/\\\\/gu, '\\');
    }
  }

  return trimmedValue.replace(/\s+#.*$/u, '').trim();
}
