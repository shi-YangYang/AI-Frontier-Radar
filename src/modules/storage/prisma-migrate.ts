import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const localRequire = createRequire(__filename);

export interface RunPrismaMigrateDeployOptions {
  cwd?: string;
  databaseUrl: string;
}

export function runPrismaMigrateDeploy(options: RunPrismaMigrateDeployOptions): void {
  const prismaCliEntrypoint = localRequire.resolve('prisma/build/index.js');
  const result = spawnSync(process.execPath, [prismaCliEntrypoint, 'migrate', 'deploy'], {
    cwd: options.cwd ?? process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: options.databaseUrl,
    },
    shell: false,
    stdio: 'pipe',
    encoding: 'utf8',
  });

  if (result.error !== undefined) {
    if (isSpawnBlockedError(result.error)) {
      runSqliteMigrationFallback(options);
      return;
    }

    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    const stdout = typeof result.stdout === 'string' ? result.stdout.trim() : '';
    const message = stderr.length > 0 ? stderr : stdout.length > 0 ? stdout : 'Prisma migrate deploy failed.';

    if (message.includes('EPERM') || message.includes('spawn')) {
      runSqliteMigrationFallback(options);
      return;
    }

    throw new Error(message);
  }
}

function runSqliteMigrationFallback(options: RunPrismaMigrateDeployOptions): void {
  const sqlitePath = parsePrismaSqliteFileUrl(options.databaseUrl);
  const migrationsPath = join(options.cwd ?? process.cwd(), 'prisma', 'migrations');

  if (!existsSync(migrationsPath)) {
    throw new Error(`Prisma migrations directory was not found: ${migrationsPath}`);
  }

  const { DatabaseSync } = localRequire('node:sqlite') as {
    DatabaseSync: new (path: string) => {
      close(): void;
      exec(sql: string): void;
    };
  };
  const database = new DatabaseSync(sqlitePath);

  try {
    for (const migrationName of readdirSync(migrationsPath).sort()) {
      const migrationSqlPath = join(migrationsPath, migrationName, 'migration.sql');

      if (!existsSync(migrationSqlPath)) {
        continue;
      }

      database.exec(readFileSync(migrationSqlPath, 'utf8'));
    }
  } finally {
    database.close();
  }
}

function parsePrismaSqliteFileUrl(databaseUrl: string): string {
  if (!databaseUrl.startsWith('file:')) {
    throw new Error('Only SQLite file: DATABASE_URL values are supported by migration fallback.');
  }

  return decodeURIComponent(databaseUrl.slice('file:'.length));
}

function isSpawnBlockedError(error: Error & { code?: string }): boolean {
  return error.code === 'EPERM' || error.message.includes('spawn');
}
