const { spawnSync } = require('node:child_process');
const { existsSync, mkdirSync, openSync, closeSync, readdirSync, readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { dirname, resolve } = require('node:path');

const localRequire = createRequire(__filename);
const DEFAULT_SQLITE_PATH = '.data/ai-news-monitor.sqlite';
const LOCAL_ENV_FILE_NAME = '.env';

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    throw new Error('Prisma CLI arguments are required.');
  }

  const env = loadLocalEnv(process.cwd(), process.env);
  const sqlitePath = readEnvString(env, 'SQLITE_PATH', DEFAULT_SQLITE_PATH);
  const resolvedSqlitePath = resolve(process.cwd(), sqlitePath);
  mkdirSync(dirname(resolvedSqlitePath), { recursive: true });
  closeSync(openSync(resolvedSqlitePath, 'a'));

  const databaseUrl = toPrismaSqliteDatabaseUrl(resolve(process.cwd(), sqlitePath));
  const prismaCliEntrypoint = localRequire.resolve('prisma/build/index.js');
  const shouldCaptureOutput = isMigrateDeploy(args);
  const result = spawnSync(process.execPath, [prismaCliEntrypoint, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
      DATABASE_URL: databaseUrl,
    },
    shell: false,
    stdio: shouldCaptureOutput ? 'pipe' : 'inherit',
    encoding: shouldCaptureOutput ? 'utf8' : undefined,
  });

  if (result.error !== undefined) {
    if (isMigrateDeploy(args) && isSpawnBlockedError(result.error)) {
      runSqliteMigrationFallback(resolvedSqlitePath);
      return;
    }

    throw result.error;
  }

  const output = `${result.stderr ?? ''}\n${result.stdout ?? ''}`;

  if (isMigrateDeploy(args) && result.status !== 0 && isSpawnBlockedOutput(output)) {
    runSqliteMigrationFallback(resolvedSqlitePath);
    return;
  }

  if (shouldCaptureOutput) {
    if (typeof result.stdout === 'string' && result.stdout.length > 0) {
      process.stdout.write(result.stdout);
    }

    if (typeof result.stderr === 'string' && result.stderr.length > 0) {
      process.stderr.write(result.stderr);
    }
  }

  process.exitCode = result.status ?? 1;
}

function loadLocalEnv(cwd, baseEnv) {
  const filePath = resolve(cwd, LOCAL_ENV_FILE_NAME);
  const fileEnv = existsSync(filePath) ? parseLocalEnvContent(readFileSync(filePath, 'utf8')) : {};

  return {
    ...fileEnv,
    ...baseEnv,
  };
}

function parseLocalEnvContent(content) {
  const env = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const parsedLine = parseLocalEnvLine(rawLine);

    if (parsedLine === null) {
      continue;
    }

    env[parsedLine.name] = parsedLine.value;
  }

  return env;
}

function parseLocalEnvLine(line) {
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

function parseLocalEnvValue(rawValue) {
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

function readEnvString(env, name, defaultValue) {
  const value = env[name];

  if (typeof value !== 'string' || value.trim().length === 0) {
    return defaultValue;
  }

  return value.trim();
}

function toPrismaSqliteDatabaseUrl(sqlitePath) {
  return `file:${sqlitePath.replace(/\\/gu, '/')}`;
}

function runSqliteMigrationFallback(sqlitePath) {
  const migrationsPath = resolve(process.cwd(), 'prisma', 'migrations');

  if (!existsSync(migrationsPath)) {
    throw new Error(`Prisma migrations directory was not found: ${migrationsPath}`);
  }

  const { DatabaseSync } = require('node:sqlite');
  const database = new DatabaseSync(sqlitePath);

  try {
    for (const migrationName of readdirSync(migrationsPath).sort()) {
      const migrationSqlPath = resolve(migrationsPath, migrationName, 'migration.sql');

      if (!existsSync(migrationSqlPath)) {
        continue;
      }

      database.exec(readFileSync(migrationSqlPath, 'utf8'));
    }
  } finally {
    database.close();
  }

  process.stdout.write('Applied SQLite migrations using local fallback.\n');
}

function isMigrateDeploy(args) {
  return args.length === 2 && args[0] === 'migrate' && args[1] === 'deploy';
}

function isSpawnBlockedError(error) {
  return error.code === 'EPERM' || error.message.includes('spawn');
}

function isSpawnBlockedOutput(output) {
  return output.includes('EPERM') || output.includes('spawn');
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
