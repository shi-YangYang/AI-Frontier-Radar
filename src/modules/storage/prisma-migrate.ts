import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

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
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    const stdout = typeof result.stdout === 'string' ? result.stdout.trim() : '';
    const message = stderr.length > 0 ? stderr : stdout.length > 0 ? stdout : 'Prisma migrate deploy failed.';

    throw new Error(message);
  }
}
