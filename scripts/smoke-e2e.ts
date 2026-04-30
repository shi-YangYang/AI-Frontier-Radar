import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';

import type { AppConfig } from '../src/shared/config/types';
import { toPrismaSqliteDatabaseUrl } from '../src/shared/config';
import { loadAppConfig } from '../src/config';
import { createLogger } from '../src/lib/logger';
import { createApp } from '../src/app/create-app';
import { BrowserXSourceProvider, createXSourceProvider, runPollingJob } from '../src/modules/polling';
import { runDeliveryWorkerJob } from '../src/modules/delivery';
import { createRuntimeSourceProvider } from '../src/modules/scheduler';
import { createPrismaClient, createStorage } from '../src/modules/storage';
import { ConfigValidationError } from '../src/shared/env/config-validation-error';

type SmokeCheck = {
  detail?: string;
  name: string;
};

type MockPost = {
  created_at: string;
  id: string;
  text: string;
};

const WATCH_USERNAME = 'mock_ai';
const WATCH_USER_ID = '10001';
const TARGET_KEY = 'feishu-main';

async function main(): Promise<void> {
  const checks: SmokeCheck[] = [];
  const tempDir = await mkdtemp(join(tmpdir(), 'ai-news-monitor-smoke-'));
  const sqlitePath = join(tempDir, 'smoke.sqlite');
  const databaseUrl = toPrismaSqliteDatabaseUrl(sqlitePath);
  const xApi = await startMockXApi();
  const webhook = await startMockWebhook();
  const logger = createLogger({
    bindings: { service: 'ai-news-monitor-smoke' },
    level: 'silent',
  });
  const config = createSmokeConfig({
    databaseUrl,
    sqlitePath,
    webhookUrl: webhook.url,
    xApiBaseUrl: xApi.url,
  });
  const storage = createStorage({
    databaseUrl,
    defaultDeliveryTarget: {
      targetKey: TARGET_KEY,
      webhookUrl: webhook.url,
    },
    sqlitePath,
    watchAccountsSource: config.watchAccounts,
  });
  const prisma = createPrismaClient(databaseUrl);
  const app = createApp({
    config,
    logger,
    storage,
  });

  try {
    await storage.initialize();
    await app.ready();

    await verifySourceModeConfig(checks, tempDir);
    verifyRuntimeSourceProviderFactory(checks, config);

    const seededAccount = await storage.watchAccounts.findByUsername(WATCH_USERNAME);
    assert(seededAccount !== null, 'seed watch account was not written');
    assert(seededAccount.enabled, 'seed watch account should be enabled');
    checks.push({ name: 'seed watch account 写入数据库' });

    const sourceProvider = createXSourceProvider({
      apiBaseUrl: xApi.url,
      bearerToken: 'smoke-token',
    });

    const emptyPoll = await runPollingJob({
      config,
      logger,
      sourceProvider,
      storage,
    });
    const accountAfterEmptyPoll = await storage.watchAccounts.findByUsername(WATCH_USERNAME);
    assert(emptyPoll.status === 'success', 'first empty polling run should succeed');
    assert(emptyPoll.newPostsDetected === 0, 'first empty polling run should not detect posts');
    assert(accountAfterEmptyPoll?.baselinePostId === null, 'empty first poll must not set baseline');
    assert(accountAfterEmptyPoll?.lastSeenPostId === null, 'empty first poll must not set last seen post');
    assert(accountAfterEmptyPoll?.lastPollError === null, 'empty first poll must not set an error');
    checks.push({ name: '首次无帖不设置错误基线' });

    xApi.setPosts([
      {
        created_at: '2026-04-24T01:00:00.000Z',
        id: '1000000000000000001',
        text: 'Smoke test new AI frontier post',
      },
    ]);

    const newPostPoll = await runPollingJob({
      config,
      logger,
      sourceProvider,
      storage,
    });
    assert(newPostPoll.status === 'success', 'polling with one new post should succeed');
    assert(newPostPoll.newPostsDetected === 1, 'polling should detect exactly one new post');
    assert(newPostPoll.eventsCreated === 1, 'polling should create exactly one delivery event');

    const rawPost = await storage.xPosts.findByXPostId('1000000000000000001');
    assert(rawPost !== null, 'new post was not written to x_posts_raw');
    checks.push({ name: '后续首条新帖会写入 x_posts_raw' });

    const deliveryEvent = await storage.deliveryEvents.findByPostAndTarget(
      '1000000000000000001',
      TARGET_KEY,
    );
    assert(deliveryEvent !== null, 'delivery event was not created');
    assert(deliveryEvent.status === 'pending', 'delivery event should start as pending');
    checks.push({ name: '新帖会创建 delivery_events' });

    const deliveryResult = await runDeliveryWorkerJob({
      logger,
      storage,
    });
    assert(deliveryResult.processed.length === 1, 'delivery worker should process one event');
    assert(deliveryResult.processed[0]?.status === 'sent', 'delivery worker should send the event');
    assert(webhook.requests.length === 1, 'mock webhook should receive one request');
    checks.push({ name: 'delivery worker 会发送到 mock webhook' });

    const sentEvent = await storage.deliveryEvents.findByPostAndTarget(
      '1000000000000000001',
      TARGET_KEY,
    );
    assert(sentEvent?.status === 'sent', 'delivery event status should be sent');
    checks.push({ name: '成功后 delivery_events.status = sent' });

    const healthResponse = await app.inject({ method: 'GET', url: '/health' });
    assert(healthResponse.statusCode === 200, `/health returned ${healthResponse.statusCode}`);
    const healthBody = JSON.parse(healthResponse.body) as { ok?: boolean; data?: { status?: string } };
    assert(healthBody.ok === true && healthBody.data?.status === 'ok', '/health body is not ok');
    checks.push({ name: '/health 可用' });

    const summaryResponse = await app.inject({ method: 'GET', url: '/config/summary' });
    assert(summaryResponse.statusCode === 200, `/config/summary returned ${summaryResponse.statusCode}`);
    const summaryBodyText = summaryResponse.body;
    assert(!summaryBodyText.includes(webhook.url), '/config/summary leaked webhook URL');
    assert(!summaryBodyText.includes('mock-feishu-webhook-secret'), '/config/summary leaked webhook secret');
    checks.push({ name: '/config/summary 不泄露 webhook' });

    const readyResponse = await app.inject({ method: 'GET', url: '/ready' });
    assert(readyResponse.statusCode === 503, `/ready returned ${readyResponse.statusCode}, expected 503`);
    const readyBody = JSON.parse(readyResponse.body) as {
      error?: { code?: string };
      ok?: boolean;
    };
    assert(
      readyBody.ok === false && readyBody.error?.code === 'DEPENDENCY_UNREADY',
      '/ready did not return DEPENDENCY_UNREADY',
    );
    checks.push({ name: '/ready 在 Redis 不可用时返回 503 DEPENDENCY_UNREADY' });

    const counts = await prisma.$transaction([
      prisma.watchAccount.count(),
      prisma.xPostRaw.count(),
      prisma.deliveryEvent.count(),
      prisma.pollRun.count(),
    ]);
    checks.push({
      detail: `watch_accounts=${counts[0]}, x_posts_raw=${counts[1]}, delivery_events=${counts[2]}, poll_runs=${counts[3]}`,
      name: '临时 SQLite 记录完整链路状态',
    });

    printSuccess(checks);
  } finally {
    await app.close();
    await prisma.$disconnect();
    await storage.close();
    await xApi.close();
    await webhook.close();
    await rm(tempDir, { force: true, recursive: true });
  }
}

function createSmokeConfig(input: {
  databaseUrl: string;
  sqlitePath: string;
  webhookUrl: string;
  xApiBaseUrl: string;
}): AppConfig {
  return {
    delivery: {
      feishu: {
        targetKey: TARGET_KEY,
        webhookUrl: input.webhookUrl,
      },
    },
    logging: {
      level: 'silent',
    },
    polling: {
      excludeReplies: true,
      excludeReposts: true,
      fetchLimitPerAccount: 10,
      intervalSeconds: 120,
    },
    queue: {
      redis: {
        url: 'redis://127.0.0.1:1',
      },
    },
    service: {
      env: 'test',
      host: '127.0.0.1',
      name: 'ai-news-monitor',
      port: 0,
    },
    source: {
      mode: 'api',
      x: {
        apiBaseUrl: input.xApiBaseUrl,
        bearerToken: 'smoke-token',
        browser: {
          baseUrl: 'https://x.com',
          headless: true,
          navigationTimeoutMs: 30_000,
          postLoadTimeoutMs: 15_000,
          userDataDir: join(input.sqlitePath, '..', '.x-browser-profile'),
        },
      },
    },
    storage: {
      prisma: {
        databaseUrl: input.databaseUrl,
      },
      sqlite: {
        path: input.sqlitePath,
      },
    },
    watchAccounts: {
      items: [
        {
          enabled: true,
          xUsername: WATCH_USERNAME,
        },
      ],
      raw: WATCH_USERNAME,
      type: 'env',
    },
  };
}

async function verifySourceModeConfig(
  checks: SmokeCheck[],
  tempDir: string,
): Promise<void> {
  const baseEnv = {
    FEISHU_WEBHOOK_URL: 'https://open.feishu.cn/open-apis/bot/v2/hook/smoke-placeholder',
    NODE_ENV: 'test',
    REDIS_URL: 'redis://127.0.0.1:1',
    SQLITE_PATH: join(tempDir, 'config-smoke.sqlite'),
    WATCH_ACCOUNTS: WATCH_USERNAME,
    WATCH_ACCOUNTS_SOURCE: 'env',
  };

  const browserConfig = await loadAppConfig({
    cwd: tempDir,
    env: {
      ...baseEnv,
      X_BROWSER_HEADLESS: 'true',
      X_BROWSER_USER_DATA_DIR: '.browser-profile',
      X_SOURCE_MODE: 'browser',
    },
  });
  assert(browserConfig.source.mode === 'browser', 'browser config should select browser source mode');
  assert(browserConfig.source.x.bearerToken === undefined, 'browser config should not require X API bearer token');
  assert(
    browserConfig.source.x.browser.userDataDir === join(tempDir, '.browser-profile'),
    'browser user data dir should resolve from cwd',
  );
  checks.push({ name: 'browser 模式不需要 X_API_BEARER_TOKEN' });

  await assertRejectsConfigValidation(
    loadAppConfig({
      cwd: tempDir,
      env: {
        ...baseEnv,
        X_API_BASE_URL: 'https://api.x.com',
        X_SOURCE_MODE: 'api',
      },
    }),
    'X_API_BEARER_TOKEN is required.',
  );
  checks.push({ name: 'api 模式缺少 X_API_BEARER_TOKEN 会配置失败' });
}

function verifyRuntimeSourceProviderFactory(checks: SmokeCheck[], config: AppConfig): void {
  const browserProvider = createRuntimeSourceProvider({
    ...config,
    source: {
      mode: 'browser',
      x: {
        browser: {
          baseUrl: 'https://x.com',
          headless: true,
          navigationTimeoutMs: 30_000,
          postLoadTimeoutMs: 15_000,
          userDataDir: join(config.storage.sqlite.path, '..', '.x-browser-profile'),
        },
      },
    },
  });

  assert(
    browserProvider instanceof BrowserXSourceProvider,
    'browser mode should create BrowserXSourceProvider',
  );
  checks.push({ name: 'scheduler browser 模式会创建 browser provider' });
}

async function assertRejectsConfigValidation(
  promise: Promise<unknown>,
  expectedIssue: string,
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    assert(error instanceof ConfigValidationError, 'expected config validation failure');
    assert(
      error.issues.includes(expectedIssue),
      `expected config issue "${expectedIssue}", got "${error.issues.join('; ')}"`,
    );
    return;
  }

  throw new Error('expected config validation failure');
}

async function startMockXApi(): Promise<{
  close(): Promise<void>;
  setPosts(posts: MockPost[]): void;
  url: string;
}> {
  let posts: MockPost[] = [];
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (request.method === 'GET' && requestUrl.pathname === `/2/users/by/username/${WATCH_USERNAME}`) {
      sendJson(response, {
        data: {
          id: WATCH_USER_ID,
          name: 'Mock AI',
          username: WATCH_USERNAME,
        },
      });
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === `/2/users/${WATCH_USER_ID}/tweets`) {
      const sinceId = requestUrl.searchParams.get('since_id');
      const visiblePosts = posts
        .filter((post) => sinceId === null || comparePostIds(post.id, sinceId) > 0)
        .sort((left, right) => comparePostIds(right.id, left.id));
      const newestPostId = visiblePosts[0]?.id;
      const oldestPostId = visiblePosts.at(-1)?.id;

      sendJson(response, {
        data: visiblePosts,
        meta: {
          newest_id: newestPostId,
          oldest_id: oldestPostId,
          result_count: visiblePosts.length,
        },
      });
      return;
    }

    sendJson(response, { error: 'not found' }, 404);
  });

  const url = await listen(server);

  return {
    close: () => closeServer(server),
    setPosts(nextPosts: MockPost[]) {
      posts = nextPosts;
    },
    url,
  };
}

async function startMockWebhook(): Promise<{
  close(): Promise<void>;
  requests: unknown[];
  url: string;
}> {
  const requests: unknown[] = [];
  const server = http.createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/mock-feishu-webhook-secret') {
      sendJson(response, { error: 'not found' }, 404);
      return;
    }

    requests.push(await readJsonBody(request));
    sendJson(response, {
      code: 0,
      msg: 'success',
    });
  });
  const baseUrl = await listen(server);

  return {
    close: () => closeServer(server),
    requests,
    url: `${baseUrl}/mock-feishu-webhook-secret`,
  };
}

function listen(server: http.Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address();

      if (address === null || typeof address === 'string') {
        reject(new Error('Mock server did not bind to a TCP port.'));
        return;
      }

      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function sendJson(response: ServerResponse, body: unknown, statusCode = 200): void {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let rawBody = '';

    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      rawBody += chunk;
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(rawBody));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function comparePostIds(left: string, right: string): number {
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);

  if (leftValue === rightValue) {
    return 0;
  }

  return leftValue > rightValue ? 1 : -1;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function printSuccess(checks: SmokeCheck[]): void {
  process.stdout.write('\nE2E smoke checks passed:\n');

  for (const check of checks) {
    const detail = check.detail === undefined ? '' : ` (${check.detail})`;
    process.stdout.write(`  PASS ${check.name}${detail}\n`);
  }

  process.stdout.write('\n');
}

void main().catch((error) => {
  process.stderr.write('\nE2E smoke failed:\n');
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
