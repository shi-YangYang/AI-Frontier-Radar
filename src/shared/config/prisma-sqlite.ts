import { resolve } from 'node:path';

export function resolveSqlitePath(sqlitePath: string, cwd = process.cwd()): string {
  return resolve(cwd, sqlitePath);
}

export function toPrismaSqliteDatabaseUrl(sqlitePath: string): string {
  const normalizedPath = sqlitePath.replace(/\\/g, '/');

  if (/^[A-Za-z]:\//.test(normalizedPath)) {
    return `file:${normalizedPath}`;
  }

  if (normalizedPath.startsWith('/')) {
    return `file:${normalizedPath}`;
  }

  return `file:/${normalizedPath}`;
}

export function resolvePrismaSqliteDatabaseUrl(sqlitePath: string, cwd = process.cwd()): string {
  return toPrismaSqliteDatabaseUrl(resolveSqlitePath(sqlitePath, cwd));
}
