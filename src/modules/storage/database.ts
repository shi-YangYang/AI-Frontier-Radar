import { randomUUID } from 'node:crypto';

export function createDatabaseId(): string {
  return randomUUID();
}

export function createTimestamp(): string {
  return new Date().toISOString();
}
