import { spawnSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

import { resolvePrismaSqliteDatabaseUrl } from '../shared/config';
import { ConfigValidationError } from '../shared/env/config-validation-error';
import { EnvReader } from '../shared/env/env-reader';
import { loadLocalEnv } from './local-env';

const localRequire = createRequire(__filename);
const DEFAULT_SQLITE_PATH = '.data/ai-news-monitor.sqlite';

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    throw new Error('Prisma CLI arguments are required.');
  }

  const env = loadLocalEnv(process.cwd());
  const reader = new EnvReader(env);
  const sqlitePath = reader.readString('SQLITE_PATH', { defaultValue: DEFAULT_SQLITE_PATH });
  reader.assertValid();

  const resolvedSqlitePath = resolve(process.cwd(), sqlitePath);
  mkdirSync(dirname(resolvedSqlitePath), { recursive: true });
  closeSync(openSync(resolvedSqlitePath, 'a'));

  const databaseUrl = resolvePrismaSqliteDatabaseUrl(sqlitePath);
  const prismaCliEntrypoint = localRequire.resolve('prisma/build/index.js');
  const result = spawnSync(process.execPath, [prismaCliEntrypoint, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
      DATABASE_URL: databaseUrl,
    },
    shell: false,
    stdio: 'inherit',
  });

  if (result.error !== undefined) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;
}

try {
  main();
} catch (error) {
  if (error instanceof ConfigValidationError) {
    for (const issue of error.issues) {
      process.stderr.write(`${issue}\n`);
    }
    process.exitCode = 1;
  } else if (error instanceof Error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  }
}
