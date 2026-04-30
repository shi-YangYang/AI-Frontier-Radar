import { mkdir, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import net from 'node:net';
import tls from 'node:tls';

import { parseRedisEndpoint } from './redis';
import type { AppConfig } from './types';

export interface DependencyCheckResult {
  message?: string;
  status: 'error' | 'ok';
}

export interface AppReadiness {
  config: 'ok';
  database: DependencyCheckResult;
  queue: DependencyCheckResult;
  ready: boolean;
}

const REDIS_TIMEOUT_MS = 2_000;

export async function checkAppReadiness(config: AppConfig): Promise<AppReadiness> {
  const [database, queue] = await Promise.all([
    checkSqlitePath(config.storage.sqlite.path),
    checkRedisConnection(config.queue.redis.url),
  ]);

  return {
    config: 'ok',
    database,
    queue,
    ready: database.status === 'ok' && queue.status === 'ok',
  };
}

async function checkSqlitePath(sqlitePath: string): Promise<DependencyCheckResult> {
  try {
    await mkdir(dirname(sqlitePath), { recursive: true });

    const handle = await open(sqlitePath, 'a');
    await handle.close();

    return { status: 'ok' };
  } catch (error) {
    return {
      message: toErrorMessage(error),
      status: 'error',
    };
  }
}

async function checkRedisConnection(redisUrl: string): Promise<DependencyCheckResult> {
  const endpoint = parseRedisEndpoint(redisUrl);

  try {
    await new Promise<void>((resolve, reject) => {
      const socket =
        endpoint.protocol === 'rediss:'
          ? tls.connect({
              host: endpoint.host,
              port: endpoint.port,
              servername: endpoint.host,
            })
          : net.createConnection({
              host: endpoint.host,
              port: endpoint.port,
            });

      const cleanup = (): void => {
        socket.removeAllListeners();
        socket.end();
        socket.destroy();
      };

      socket.setTimeout(REDIS_TIMEOUT_MS);
      socket.once('connect', () => {
        cleanup();
        resolve();
      });
      socket.once('secureConnect', () => {
        cleanup();
        resolve();
      });
      socket.once('timeout', () => {
        cleanup();
        reject(new Error(`Redis connection timed out after ${REDIS_TIMEOUT_MS}ms.`));
      });
      socket.once('error', (error) => {
        cleanup();
        reject(error);
      });
    });

    return { status: 'ok' };
  } catch (error) {
    return {
      message: toErrorMessage(error),
      status: 'error',
    };
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
