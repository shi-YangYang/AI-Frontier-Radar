import net from 'node:net';
import tls from 'node:tls';

import type { PrismaClient } from '@prisma/client';

import { createPrismaClient } from '../../storage';
import { parseRedisEndpoint } from '../../../shared/config';
import type { AppConfig } from '../../../shared/config/types';

export interface HealthResponse {
  ok: true;
  data: {
    service: string;
    status: 'ok';
    time: string;
  };
}

export interface ReadySuccessResponse {
  ok: true;
  data: {
    config: 'ok';
    database: 'ok';
    queue: 'ok';
    status: 'ready';
  };
}

export interface ReadyErrorResponse {
  ok: false;
  error: {
    code: 'DEPENDENCY_UNREADY';
    message: string;
  };
}

export type ReadyResponse = ReadySuccessResponse | ReadyErrorResponse;

const REDIS_TIMEOUT_MS = 2_000;

export function getHealth(config: AppConfig): HealthResponse {
  return {
    ok: true,
    data: {
      service: config.service.name,
      status: 'ok',
      time: new Date().toISOString(),
    },
  };
}

export async function getReadiness(config: AppConfig): Promise<ReadyResponse> {
  const [database, queue] = await Promise.all([checkDatabase(config), checkRedis(config)]);

  if (database.status !== 'ok' || queue.status !== 'ok') {
    return {
      ok: false,
      error: {
        code: 'DEPENDENCY_UNREADY',
        message: database.message ?? queue.message ?? 'service dependencies are not ready',
      },
    };
  }

  return {
    ok: true,
    data: {
      config: 'ok',
      database: 'ok',
      queue: 'ok',
      status: 'ready',
    },
  };
}

async function checkDatabase(config: AppConfig): Promise<DependencyCheckResult> {
  let prisma: PrismaClient | undefined;

  try {
    prisma = createPrismaClient(config.storage.prisma.databaseUrl);
    await Promise.all([prisma.watchAccount.count(), prisma.deliveryTarget.count()]);
    return { status: 'ok' };
  } catch (error) {
    return {
      message: `database not reachable: ${toErrorMessage(error)}`,
      status: 'error',
    };
  } finally {
    await prisma?.$disconnect();
  }
}

async function checkRedis(config: AppConfig): Promise<DependencyCheckResult> {
  try {
    await pingRedis(config.queue.redis.url);
    return { status: 'ok' };
  } catch (error) {
    return {
      message: `queue not reachable: ${toErrorMessage(error)}`,
      status: 'error',
    };
  }
}

function pingRedis(redisUrl: string): Promise<void> {
  const endpoint = parseRedisEndpoint(redisUrl);
  const parsedUrl = new URL(redisUrl);
  const username = parsedUrl.username.length > 0 ? decodeURIComponent(parsedUrl.username) : undefined;
  const password = parsedUrl.password.length > 0 ? decodeURIComponent(parsedUrl.password) : undefined;

  return new Promise<void>((resolve, reject) => {
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

    let buffer = '';
    let settled = false;
    const commands = password === undefined ? [redisCommand('PING')] : [redisCommand('AUTH', username, password), redisCommand('PING')];

    const cleanup = (): void => {
      socket.removeAllListeners();
      socket.end();
      socket.destroy();
    };

    const fail = (error: Error): void => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(error);
    };

    const writeNextCommand = (): void => {
      const command = commands.shift();

      if (command === undefined) {
        if (!settled) {
          settled = true;
          cleanup();
          resolve();
        }
        return;
      }

      socket.write(command);
    };

    const handleResponse = (): void => {
      const lineEnd = buffer.indexOf('\r\n');

      if (lineEnd === -1) {
        return;
      }

      const line = buffer.slice(0, lineEnd);
      buffer = buffer.slice(lineEnd + 2);

      if (line.startsWith('-')) {
        fail(new Error(line.slice(1)));
        return;
      }

      writeNextCommand();
    };

    socket.setTimeout(REDIS_TIMEOUT_MS);
    socket.once(endpoint.protocol === 'rediss:' ? 'secureConnect' : 'connect', writeNextCommand);
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      handleResponse();
    });
    socket.once('timeout', () => {
      fail(new Error(`Redis PING timed out after ${REDIS_TIMEOUT_MS}ms.`));
    });
    socket.once('error', fail);
  });
}

function redisCommand(command: string, ...args: Array<string | undefined>): string {
  const parts = [command, ...args.filter((arg): arg is string => arg !== undefined)];
  return `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join('')}`;
}

interface DependencyCheckResult {
  message?: string;
  status: 'error' | 'ok';
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
