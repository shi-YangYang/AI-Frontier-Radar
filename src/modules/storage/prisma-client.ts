import { mkdir, open } from 'node:fs/promises';
import { dirname } from 'node:path';

import { PrismaClient } from '@prisma/client';

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
}

export async function ensureSqliteDirectory(sqlitePath: string): Promise<void> {
  await mkdir(dirname(sqlitePath), { recursive: true });
  const handle = await open(sqlitePath, 'a');
  await handle.close();
}
