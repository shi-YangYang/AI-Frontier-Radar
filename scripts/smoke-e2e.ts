import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';

import type { AppConfig } from '../src/shared/config/types';
import { toPrismaSqliteDatabaseUrl } from '../src/shared/config';
import { loadAppConfig } from '../src/config';
import { createLogger } from '../src/lib/logger';
import { createApp } from '../src/app/create-app';
import { BrowserXSourceProvider, RssSourceProvider, SourceProviderError, YoutubeChannelResolveError, createGithubTrendingSourceProvider, createRssSourceProvider, createSourceProviderRegistry, createXSourceProvider, resolveYoutubeChannel, runPollingJob } from '../src/modules/polling';
import { runDeliveryWorkerJob } from '../src/modules/delivery';
import { createRuntimeSourceProviders } from '../src/modules/scheduler';
import { createPrismaClient, createStorage, DEFAULT_WATCH_SOURCES, importDefaultWatchSources } from '../src/modules/storage';
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

type MockFeedItem = {
  description?: string;
  guid: string;
  link?: string;
  pubDate?: string;
  title: string;
};

type MockAtomEntry = {
  contentHtml?: string;
  id: string;
  link: string;
  published?: string;
  title: string;
};

type MockFeedResponse = {
  body: string;
  contentType: string;
  statusCode: number;
};

const WATCH_USERNAME = 'mock_ai';
const WATCH_USER_ID = '10001';
const TARGET_KEY = 'feishu-main';
const RSS_FEED_PATH = '/feed.xml';
const ATOM_FEED_PATH = '/atom.xml';
const EMPTY_FEED_PATH = '/empty.xml';

async function main(): Promise<void> {
  const checks: SmokeCheck[] = [];
  const tempDir = await mkdtemp(join(tmpdir(), 'ai-news-monitor-smoke-'));
  const sqlitePath = join(tempDir, 'smoke.sqlite');
  const databaseUrl = toPrismaSqliteDatabaseUrl(sqlitePath);
  const xApi = await startMockXApi();
  const rssApi = await startMockFeedServer();
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
  const sourceProvider = createXSourceProvider({
    apiBaseUrl: xApi.url,
    bearerToken: 'smoke-token',
  });
  const rssProvider = createRssSourceProvider({
    timeoutMs: 5_000,
  });
  const githubProvider = createGithubTrendingSourceProvider({
    timeoutMs: 5_000,
  });
  const sourceProviders = createSourceProviderRegistry({
    github: githubProvider,
    rss: rssProvider,
    x: sourceProvider,
  });
  const app = createApp({
    adminActions: {
      validateWatchAccount: async (input) => {
        if (input.sourceType === 'rss') {
          return rssProvider.validateSource({
            source: {
              sourceType: 'rss',
              sourceUrl: input.sourceUrl,
            },
          });
        }

        if (input.sourceType === 'github') {
          return githubProvider.validateSource({
            source: {
              sourceType: 'github',
              sourceUrl: input.sourceUrl,
            },
          });
        }

        return sourceProvider.validateSource({
          source: {
            sourceType: 'x',
            xUsername: input.xUsername,
          },
        });
      },
    },
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

    const defaultsSqlitePath = join(tempDir, 'defaults.sqlite');
    const defaultsStorage = createStorage({
      databaseUrl: toPrismaSqliteDatabaseUrl(defaultsSqlitePath),
      sqlitePath: defaultsSqlitePath,
      watchAccountsSource: { items: [], type: 'database' },
    });

    try {
      await defaultsStorage.initialize();

      const firstImport = await importDefaultWatchSources(defaultsStorage);
      assert(
        firstImport.importedCount === DEFAULT_WATCH_SOURCES.length,
        `fresh database should import ${DEFAULT_WATCH_SOURCES.length} default sources, got ${firstImport.importedCount}`,
      );

      const secondImport = await importDefaultWatchSources(defaultsStorage);
      assert(secondImport.skipped, 'second default-source import should be skipped by the marker');

      const defaultsCount = await defaultsStorage.watchAccounts.countAll();
      assert(
        defaultsCount === DEFAULT_WATCH_SOURCES.length,
        `default sources should not be duplicated, got ${defaultsCount}`,
      );
      checks.push({ name: '首次初始化导入默认源且只导入一次' });
    } finally {
      await defaultsStorage.close();
    }

    const emptyPoll = await runPollingJob({
      config,
      logger,
      sourceProviders,
      storage,
    });
    const accountAfterEmptyPoll = await storage.watchAccounts.findByUsername(WATCH_USERNAME);
    assert(emptyPoll.status === 'success', 'first empty polling run should succeed');
    assert(emptyPoll.newPostsDetected === 0, 'first empty polling run should not detect posts');
    assert(accountAfterEmptyPoll?.baselinePostId === null, 'empty first poll must not set baseline');
    assert(accountAfterEmptyPoll?.lastSeenPostId === null, 'empty first poll must not set last seen post');
    assert(accountAfterEmptyPoll?.lastPollError === null, 'empty first poll must not set an error');
    checks.push({ name: '首次无帖不设置错误基线' });

    const seededTarget = await storage.deliveryTargets.findByTargetKey(TARGET_KEY);
    assert(seededTarget !== null, 'seed delivery target was not written');

    xApi.setPosts([
      {
        created_at: '2026-04-24T00:30:00.000Z',
        id: '1000000000000000000',
        text: 'Smoke test post without delivery target',
      },
    ]);

    await storage.deliveryTargets.update(seededTarget.id, { enabled: false });
    const noTargetPoll = await runPollingJob({
      config,
      logger,
      sourceProviders,
      storage,
    });
    assert(noTargetPoll.status === 'success', 'polling without enabled delivery targets should succeed');
    assert(
      noTargetPoll.newPostsDetected === 1,
      'polling without targets should still detect the new post',
    );
    assert(noTargetPoll.eventsCreated === 0, 'polling without targets should not create events');

    const noTargetPost = await storage.xPosts.findByXPostId('1000000000000000000');
    assert(noTargetPost !== null, 'post should be stored without enabled delivery targets');
    const noTargetEvent = await storage.deliveryEvents.findByPostAndTarget(
      '1000000000000000000',
      TARGET_KEY,
    );
    assert(noTargetEvent === null, 'no delivery event should be created without enabled targets');
    checks.push({ name: '无投递目标时轮询成功并入库，不创建投递事件' });

    await storage.deliveryTargets.update(seededTarget.id, { enabled: true });

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
      sourceProviders,
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

    const legacyCreateResponse = await app.inject({
      method: 'POST',
      payload: { xUsername: WATCH_USERNAME },
      url: '/admin/api/watch-accounts',
    });
    assert(
      legacyCreateResponse.statusCode === 200,
      `legacy watch account create returned ${legacyCreateResponse.statusCode}`,
    );
    const legacyCreateBody = JSON.parse(legacyCreateResponse.body) as {
      data?: { created?: boolean; watchAccount?: { sourceType?: string } };
      ok?: boolean;
    };
    assert(legacyCreateBody.ok === true, 'legacy watch account create did not return ok');
    assert(
      legacyCreateBody.data?.created === false,
      'legacy duplicate xUsername should not create a new account',
    );
    assert(
      legacyCreateBody.data?.watchAccount?.sourceType === 'x',
      'legacy create should keep sourceType x',
    );
    checks.push({ name: '管理 API 兼容旧 {xUsername} 请求体' });

    const invalidRssResponse = await app.inject({
      method: 'POST',
      payload: { sourceType: 'rss', sourceUrl: 'not-a-url' },
      url: '/admin/api/watch-accounts',
    });
    assert(invalidRssResponse.statusCode === 400, `invalid RSS URL returned ${invalidRssResponse.statusCode}`);
    const invalidRssBody = JSON.parse(invalidRssResponse.body) as { error?: { code?: string } };
    assert(
      invalidRssBody.error?.code === 'SOURCE_INVALID_INPUT',
      `invalid RSS URL should map to SOURCE_INVALID_INPUT, got ${invalidRssBody.error?.code}`,
    );
    checks.push({ name: '非法 RSS URL 返回 SOURCE_INVALID_INPUT' });

    const missingFeedResponse = await app.inject({
      method: 'POST',
      payload: { sourceType: 'rss', sourceUrl: `${rssApi.url}/missing.xml` },
      url: '/admin/api/watch-accounts',
    });
    assert(
      missingFeedResponse.statusCode === 404,
      `missing RSS feed returned ${missingFeedResponse.statusCode}`,
    );
    const missingFeedBody = JSON.parse(missingFeedResponse.body) as { error?: { code?: string } };
    assert(
      missingFeedBody.error?.code === 'SOURCE_ACCOUNT_NOT_FOUND',
      `missing RSS feed should map to SOURCE_ACCOUNT_NOT_FOUND, got ${missingFeedBody.error?.code}`,
    );
    checks.push({ name: 'RSS feed 404 返回 SOURCE_ACCOUNT_NOT_FOUND' });

    const rssFeedUrl = `${rssApi.url}${RSS_FEED_PATH}`;

    rssApi.setFeed(RSS_FEED_PATH, {
      body: createRssDocument('Mock AI Feed', [
        createRssItem({
          description: '<p>Hello &amp; <b>world</b></p>',
          guid: 'rss-item-2',
          link: 'https://example.com/posts/2',
          pubDate: 'Fri, 01 May 2026 08:00:00 GMT',
          title: '新版本发布',
        }),
        createRssItem({
          description: '<p>重复 guid 条目</p>',
          guid: 'rss-item-2',
          link: 'https://example.com/posts/2',
          pubDate: 'Fri, 01 May 2026 08:00:00 GMT',
          title: '新版本发布（重复）',
        }),
        createRssItem({
          guid: 'rss-item-nolink',
          pubDate: 'Sat, 02 May 2026 08:00:00 GMT',
          title: '缺少 link 的条目',
        }),
        createRssItem({
          description: '<p>旧条目</p>',
          guid: 'rss-item-1',
          link: 'https://example.com/posts/1',
          pubDate: 'Thu, 30 Apr 2026 08:00:00 GMT',
          title: '旧条目',
        }),
      ]),
      contentType: 'application/rss+xml; charset=utf-8',
      statusCode: 200,
    });

    const createRssResponse = await app.inject({
      method: 'POST',
      payload: { sourceType: 'rss', sourceUrl: rssFeedUrl },
      url: '/admin/api/watch-accounts',
    });
    assert(createRssResponse.statusCode === 200, `RSS account create returned ${createRssResponse.statusCode}`);
    const createRssBody = JSON.parse(createRssResponse.body) as {
      data?: {
        created?: boolean;
        watchAccount?: { displayName?: string | null; sourceType?: string; sourceUrl?: string | null };
      };
    };
    assert(createRssBody.data?.created === true, 'RSS watch account was not created');
    assert(createRssBody.data?.watchAccount?.sourceType === 'rss', 'RSS account should keep sourceType rss');
    assert(createRssBody.data?.watchAccount?.sourceUrl === rssFeedUrl, 'RSS account should store the feed URL');
    assert(
      createRssBody.data?.watchAccount?.displayName === 'Mock AI Feed',
      'RSS account should store the resolved feed title',
    );

    const duplicateRssResponse = await app.inject({
      method: 'POST',
      payload: { sourceType: 'rss', sourceUrl: rssFeedUrl },
      url: '/admin/api/watch-accounts',
    });
    const duplicateRssBody = JSON.parse(duplicateRssResponse.body) as {
      data?: { created?: boolean };
    };
    assert(
      duplicateRssResponse.statusCode === 200 && duplicateRssBody.data?.created === false,
      'duplicate RSS sourceUrl should not create a new account',
    );
    checks.push({ name: '添加 RSS 源并按 sourceType + sourceUrl 去重' });

    const rssAccount = await storage.watchAccounts.findBySource({
      sourceType: 'rss',
      sourceUrl: rssFeedUrl,
    });
    assert(rssAccount !== null, 'RSS watch account was not stored');
    assert(rssAccount.baselinePostId === null, 'RSS account should start without a baseline');

    const firstRssPoll = await runPollingJob({
      config,
      logger,
      sourceProviders,
      storage,
    });
    assert(firstRssPoll.status === 'success', 'first RSS polling run should succeed');

    const rssAccountAfterFirstPoll = await storage.watchAccounts.findById(rssAccount.id);
    assert(rssAccountAfterFirstPoll?.baselinePostId !== null, 'first RSS poll should set a baseline');
    assert(rssAccountAfterFirstPoll?.xUserId !== null, 'first RSS poll should resolve a source id');
    const rssSourceId = rssAccountAfterFirstPoll?.xUserId ?? '';
    const rssPostsAfterFirstPoll = await prisma.xPostRaw.findMany({
      where: { authorUserId: rssSourceId },
    });
    assert(
      rssPostsAfterFirstPoll.length === 1,
      `first RSS poll should store exactly one baseline post, got ${rssPostsAfterFirstPoll.length}`,
    );
    const baselineRssPost = rssPostsAfterFirstPoll[0];
    assert(/^\d{24}$/u.test(baselineRssPost.xPostId), 'RSS post id should be 16+8 numeric digits');
    assert(
      baselineRssPost.postedAt === '2026-05-01T08:00:00.000Z',
      `RSS baseline post should keep its pubDate, got ${baselineRssPost.postedAt}`,
    );
    assert(
      baselineRssPost.textContent === '新版本发布\n\nHello & world',
      `RSS textContent should strip HTML and decode entities, got ${JSON.stringify(baselineRssPost.textContent)}`,
    );
    assert(
      baselineRssPost.authorUsername === 'Mock AI Feed',
      'RSS post should fall back to the feed title as author',
    );

    const baselineRssEvent = await storage.deliveryEvents.findByPostAndTarget(
      baselineRssPost.xPostId,
      TARGET_KEY,
    );
    assert(baselineRssEvent !== null, 'RSS baseline post should create a delivery event');
    const baselineDeliveryResult = await runDeliveryWorkerJob({ logger, storage });
    assert(
      baselineDeliveryResult.processed.length === 1,
      'delivery worker should process the RSS baseline event',
    );
    assert(webhook.requests.length === 2, 'mock webhook should receive the RSS baseline request');
    checks.push({ name: 'RSS 首次轮询只建基线 1 条并跳过缺 link / 重复 guid 条目' });

    rssApi.setFeed(RSS_FEED_PATH, {
      body: createRssDocument('Mock AI Feed', [
        createRssItem({
          description: '<p>三号条目</p>',
          guid: 'rss-item-3',
          link: 'https://example.com/posts/3',
          pubDate: 'Sun, 03 May 2026 09:00:00 GMT',
          title: '三号条目',
        }),
        createRssItem({
          description: '<p>Hello &amp; <b>world</b></p>',
          guid: 'rss-item-2',
          link: 'https://example.com/posts/2',
          pubDate: 'Fri, 01 May 2026 08:00:00 GMT',
          title: '新版本发布',
        }),
        createRssItem({
          description: '<p>旧条目</p>',
          guid: 'rss-item-1',
          link: 'https://example.com/posts/1',
          pubDate: 'Thu, 30 Apr 2026 08:00:00 GMT',
          title: '旧条目',
        }),
      ]),
      contentType: 'application/rss+xml; charset=utf-8',
      statusCode: 200,
    });

    const incrementalRssPoll = await runPollingJob({
      config,
      logger,
      sourceProviders,
      storage,
    });
    assert(incrementalRssPoll.status === 'success', 'incremental RSS polling run should succeed');
    assert(incrementalRssPoll.newPostsDetected === 1, 'incremental RSS polling should detect one new post');
    assert(incrementalRssPoll.eventsCreated === 1, 'incremental RSS polling should create one event');

    const rssPostsAfterIncrement = await prisma.xPostRaw.findMany({
      where: { authorUserId: rssSourceId },
    });
    assert(
      rssPostsAfterIncrement.length === 2,
      `incremental RSS poll should store one additional post, got ${rssPostsAfterIncrement.length}`,
    );
    const incrementalRssPost = rssPostsAfterIncrement.find(
      (post) => post.postedAt === '2026-05-03T09:00:00.000Z',
    );
    assert(incrementalRssPost !== undefined, 'incremental RSS post was not stored with its pubDate');
    assert(
      incrementalRssPost.textContent === '三号条目\n\n三号条目',
      'incremental RSS post should merge title and content',
    );
    const incrementalRssEvent = await storage.deliveryEvents.findByPostAndTarget(
      incrementalRssPost.xPostId,
      TARGET_KEY,
    );
    assert(incrementalRssEvent?.status === 'pending', 'incremental RSS post should create a pending event');
    const incrementalDeliveryResult = await runDeliveryWorkerJob({ logger, storage });
    assert(
      incrementalDeliveryResult.processed.length === 1,
      'delivery worker should process the incremental RSS event',
    );
    assert(webhook.requests.length === 3, 'mock webhook should receive the incremental RSS request');
    checks.push({ name: 'RSS 增量检测、入库并投递' });

    const dedupPoll = await runPollingJob({
      config,
      logger,
      sourceProviders,
      storage,
    });
    assert(dedupPoll.status === 'success', 'dedup RSS polling run should succeed');
    assert(dedupPoll.newPostsDetected === 0, 'dedup RSS polling should not detect new posts');
    const rssPostsAfterDedup = await prisma.xPostRaw.findMany({
      where: { authorUserId: rssSourceId },
    });
    assert(rssPostsAfterDedup.length === 2, 'dedup RSS polling should not add duplicate rows');
    checks.push({ name: 'RSS 重复轮询不重复入库' });

    const emptyFeedUrl = `${rssApi.url}${EMPTY_FEED_PATH}`;
    rssApi.setFeed(EMPTY_FEED_PATH, {
      body: createRssDocument('Empty Feed', []),
      contentType: 'application/rss+xml; charset=utf-8',
      statusCode: 200,
    });
    const createEmptyFeedResponse = await app.inject({
      method: 'POST',
      payload: { sourceType: 'rss', sourceUrl: emptyFeedUrl },
      url: '/admin/api/watch-accounts',
    });
    assert(
      createEmptyFeedResponse.statusCode === 200,
      `empty RSS feed create returned ${createEmptyFeedResponse.statusCode}`,
    );
    const emptyFeedAccount = await storage.watchAccounts.findBySource({
      sourceType: 'rss',
      sourceUrl: emptyFeedUrl,
    });
    assert(emptyFeedAccount !== null, 'empty RSS feed account was not stored');

    const emptyFeedPoll = await runPollingJob({
      config,
      logger,
      sourceProviders,
      storage,
    });
    assert(emptyFeedPoll.status === 'success', 'empty RSS feed polling should succeed');
    const emptyFeedAccountAfterPoll = await storage.watchAccounts.findById(emptyFeedAccount.id);
    assert(
      emptyFeedAccountAfterPoll?.baselinePostId === null &&
        emptyFeedAccountAfterPoll?.lastSeenPostId === null,
      'empty RSS feed must not set a baseline',
    );
    assert(emptyFeedAccountAfterPoll?.lastPollError === null, 'empty RSS feed must not set an error');
    checks.push({ name: '空 feed 视为成功且不设基线' });

    const atomFeedUrl = `${rssApi.url}${ATOM_FEED_PATH}`;
    rssApi.setFeed(ATOM_FEED_PATH, {
      body: createAtomDocument('Mock Atom Feed', [
        createAtomEntry({
          contentHtml: '<p>Atom &amp; content</p>',
          id: 'atom-1',
          link: 'https://example.com/atom/1',
          published: '2026-05-04T10:00:00.000Z',
          title: 'Atom 条目一',
        }),
      ]),
      contentType: 'application/atom+xml; charset=utf-8',
      statusCode: 200,
    });
    const createAtomResponse = await app.inject({
      method: 'POST',
      payload: { sourceType: 'rss', sourceUrl: atomFeedUrl },
      url: '/admin/api/watch-accounts',
    });
    assert(createAtomResponse.statusCode === 200, `Atom feed create returned ${createAtomResponse.statusCode}`);
    const atomAccount = await storage.watchAccounts.findBySource({
      sourceType: 'rss',
      sourceUrl: atomFeedUrl,
    });
    assert(atomAccount !== null, 'Atom feed account was not stored');

    const atomPoll = await runPollingJob({
      config,
      logger,
      sourceProviders,
      storage,
    });
    assert(atomPoll.status === 'success', 'Atom feed polling should succeed');
    const atomAccountAfterPoll = await storage.watchAccounts.findById(atomAccount.id);
    const atomSourceId = atomAccountAfterPoll?.xUserId ?? '';
    const atomPosts = await prisma.xPostRaw.findMany({ where: { authorUserId: atomSourceId } });
    assert(atomPosts.length === 1, `Atom poll should store one baseline post, got ${atomPosts.length}`);
    assert(
      atomPosts[0].postedAt === '2026-05-04T10:00:00.000Z',
      `Atom post should use published time, got ${atomPosts[0].postedAt}`,
    );
    assert(
      atomPosts[0].textContent === 'Atom 条目一\n\nAtom & content',
      `Atom textContent should strip HTML and decode entities, got ${JSON.stringify(atomPosts[0].textContent)}`,
    );
    checks.push({ name: 'Atom feed 解析与入库' });

    rssApi.setFeed(ATOM_FEED_PATH, {
      body: createAtomDocument('Mock Atom Feed', [
        createAtomEntry({
          contentHtml: '<p>缺少日期</p>',
          id: 'atom-2',
          link: 'https://example.com/atom/2',
          title: 'Atom 条目二',
        }),
      ]),
      contentType: 'application/atom+xml; charset=utf-8',
      statusCode: 200,
    });
    const atomNoDatePoll = await runPollingJob({
      config,
      logger,
      sourceProviders,
      storage,
    });
    assert(atomNoDatePoll.status === 'success', 'Atom feed without dates should still succeed');
    const atomAccountAfterNoDatePoll = await storage.watchAccounts.findById(atomAccount.id);
    const noDateAtomPost = await prisma.xPostRaw.findUnique({
      where: { xPostId: atomAccountAfterNoDatePoll?.lastSeenPostId ?? '' },
    });
    assert(noDateAtomPost !== null, 'Atom entry without a date was not stored');
    assert(
      noDateAtomPost.textContent === 'Atom 条目二\n\n缺少日期',
      'Atom entry without a date should keep its content',
    );
    assert(
      Math.abs(Date.now() - Date.parse(noDateAtomPost.postedAt)) < 5 * 60_000,
      'Atom entry without a date should fall back to the fetch time',
    );
    checks.push({ name: 'Atom 缺日期回退抓取时刻' });

    const atomPostCountBeforeRepeat = await prisma.xPostRaw.count({
      where: { authorUserId: atomSourceId },
    });
    const atomNoDateRepeatPoll = await runPollingJob({
      config,
      logger,
      sourceProviders,
      storage,
    });
    assert(atomNoDateRepeatPoll.status === 'success', 'repeat Atom poll should succeed');
    const atomPostCountAfterRepeat = await prisma.xPostRaw.count({
      where: { authorUserId: atomSourceId },
    });
    assert(
      atomPostCountAfterRepeat === atomPostCountBeforeRepeat,
      `date-less Atom entry should not be stored twice, got ${atomPostCountAfterRepeat - atomPostCountBeforeRepeat} extra rows`,
    );
    checks.push({ name: '缺日期条目跨轮不重复入库' });

    rssApi.setFeed(ATOM_FEED_PATH, {
      body: createAtomDocument('Mock Atom Feed', []),
      contentType: 'application/atom+xml; charset=utf-8',
      statusCode: 200,
    });
    rssApi.setFeed(RSS_FEED_PATH, {
      body: 'upstream failure',
      contentType: 'text/plain; charset=utf-8',
      statusCode: 500,
    });

    const failingPoll = await runPollingJob({
      config,
      logger,
      sourceProviders,
      storage,
    });
    assert(failingPoll.status === 'partial_failed', `failing poll status should be partial_failed, got ${failingPoll.status}`);
    const failedRssAccount = await storage.watchAccounts.findById(rssAccount.id);
    assert(failedRssAccount?.lastPollStatus === 'failed', 'failing RSS source should be marked failed');
    assert(
      (failedRssAccount?.lastPollError ?? '').includes('500'),
      'failing RSS source should record the HTTP status',
    );
    const atomAccountAfterFailure = await storage.watchAccounts.findById(atomAccount.id);
    assert(
      atomAccountAfterFailure?.lastPollStatus === 'success',
      'other sources should still succeed when one source fails',
    );
    checks.push({ name: '单个源失败不影响其他源并记录错误' });

    const proxyFeedUrl = `${rssApi.url}${RSS_FEED_PATH}`;
    rssApi.setFeed(RSS_FEED_PATH, {
      body: createRssDocument('Proxy Feed', [
        createRssItem({
          description: 'Proxied entry',
          guid: 'proxy-1',
          link: 'https://example.com/proxy/1',
          pubDate: 'Tue, 05 May 2026 10:00:00 GMT',
          title: 'Proxy 条目',
        }),
      ]),
      contentType: 'application/rss+xml; charset=utf-8',
      statusCode: 200,
    });

    const proxyServer = await startMockProxy();
    try {
      const proxiedProvider = new RssSourceProvider({ proxyUrl: proxyServer.url });
      const proxiedResult = await proxiedProvider.fetchPosts({
        limit: 1,
        source: { sourceType: 'rss', sourceUrl: proxyFeedUrl },
      });
      assert(proxiedResult.posts.length === 1, 'proxied RSS fetch should return the feed entry');
      assert(proxyServer.requests.length === 1, 'proxied RSS fetch should go through the proxy');
      checks.push({ name: 'RSS 代理请求经代理转发' });
    } finally {
      await proxyServer.close();
    }

    const unreachableProxyProvider = new RssSourceProvider({ proxyUrl: 'http://127.0.0.1:1' });
    let unreachableProxyCode: string | null = null;

    try {
      await unreachableProxyProvider.fetchPosts({
        limit: 1,
        source: { sourceType: 'rss', sourceUrl: proxyFeedUrl },
      });
    } catch (error) {
      unreachableProxyCode = error instanceof SourceProviderError ? error.code : null;
    }

    assert(
      unreachableProxyCode === 'SOURCE_REQUEST_FAILED',
      `unreachable proxy should fail the fetch, got ${unreachableProxyCode}`,
    );
    checks.push({ name: 'RSS 代理不可用时请求失败' });

    const trendingPath = '/trending';
    const trendingUrl = `${rssApi.url}${trendingPath}`;
    rssApi.setFeed(trendingPath, {
      body: createTrendingHtml([
        {
          description: 'A high-throughput and memory-efficient inference engine.',
          language: 'Python',
          name: 'vllm',
          owner: 'vllm-project',
          stars: '60,123',
          starsToday: '652',
        },
        {
          description: 'Collection of transformer implementations.',
          language: 'Python',
          name: 'annotated_deep_learning_paper_implementations',
          owner: 'labmlai',
          stars: '50,000',
          starsToday: '120',
        },
      ]),
      contentType: 'text/html; charset=utf-8',
      statusCode: 200,
    });

    const directTrending = await githubProvider.fetchPosts({
      limit: 10,
      source: { sourceType: 'github', sourceUrl: trendingUrl },
    });
    assert(
      directTrending.posts.length === 2,
      `trending provider should parse 2 repos, got ${directTrending.posts.length}`,
    );
    assert(
      directTrending.posts[0]?.textContent.includes('vllm-project/vllm'),
      'trending post should contain the repo full name',
    );
    assert(
      directTrending.posts[0]?.textContent.includes('今日 +652'),
      'trending post should contain stars today',
    );
    assert(
      directTrending.posts[0]?.textContent.includes('A high-throughput') &&
        !directTrending.posts[0]?.textContent.includes('Star '),
      'trending post should strip star-button noise from the description',
    );
    checks.push({ name: 'GitHub Trending 解析（仓库/星数/描述）' });

    const createGithubResponse = await app.inject({
      method: 'POST',
      payload: { sourceType: 'github', sourceUrl: trendingUrl },
      url: '/admin/api/watch-accounts',
    });
    assert(
      createGithubResponse.statusCode === 200,
      `github source create returned ${createGithubResponse.statusCode}`,
    );
    const githubAccount = await storage.watchAccounts.findBySource({
      sourceType: 'github',
      sourceUrl: trendingUrl,
    });
    assert(githubAccount !== null, 'github watch account was not stored');

    await runPollingJob({ config, logger, sourceProviders, storage });
    const githubAccountAfterPoll = await storage.watchAccounts.findById(githubAccount.id);
    const githubAuthorId = githubAccountAfterPoll?.xUserId ?? '';
    const githubPostsAfterFirstPoll = await prisma.xPostRaw.count({
      where: { authorUserId: githubAuthorId },
    });
    assert(
      githubPostsAfterFirstPoll === 2,
      `first github poll should store both baseline repos, got ${githubPostsAfterFirstPoll}`,
    );

    const baselineRepoPost = await storage.xPosts.findByDedupeKey('github:trending:vllm-project/vllm');
    assert(baselineRepoPost !== null, 'baseline repo post was not stored');
    const baselineRepoEvent = await storage.deliveryEvents.findByPostAndTarget(
      baselineRepoPost.xPostId,
      TARGET_KEY,
    );
    assert(baselineRepoEvent === null, 'baseline repos must not create delivery events');
    checks.push({ name: 'GitHub Trending 首次基线全量入库且不投递' });

    rssApi.setFeed(trendingPath, {
      body: createTrendingHtml([
        {
          description: 'A high-throughput and memory-efficient inference engine.',
          language: 'Python',
          name: 'vllm',
          owner: 'vllm-project',
          stars: '60,123',
          starsToday: '652',
        },
        {
          description: 'Collection of transformer implementations.',
          language: 'Python',
          name: 'annotated_deep_learning_paper_implementations',
          owner: 'labmlai',
          stars: '50,000',
          starsToday: '120',
        },
        {
          description: 'LLM inference in C/C++.',
          language: 'C++',
          name: 'llama.cpp',
          owner: 'ggml-org',
          stars: '80,000',
          starsToday: '900',
        },
      ]),
      contentType: 'text/html; charset=utf-8',
      statusCode: 200,
    });

    await runPollingJob({ config, logger, sourceProviders, storage });
    const newRepoPost = await storage.xPosts.findByDedupeKey('github:trending:ggml-org/llama.cpp');
    assert(newRepoPost !== null, 'newly trending repo was not stored');
    const newRepoEvent = await storage.deliveryEvents.findByPostAndTarget(
      newRepoPost.xPostId,
      TARGET_KEY,
    );
    assert(newRepoEvent !== null, 'newly trending repo should create a delivery event');
    checks.push({ name: 'GitHub Trending 新仓库增量入库并投递' });

    await runPollingJob({ config, logger, sourceProviders, storage });
    const githubPostsAfterThirdPoll = await prisma.xPostRaw.count({
      where: { authorUserId: githubAuthorId },
    });
    assert(
      githubPostsAfterThirdPoll === 3,
      `repeat github poll should not store duplicates, got ${githubPostsAfterThirdPoll}`,
    );
    checks.push({ name: 'GitHub Trending 重复轮询不重复入库' });

    const youtubeHtml = [
      '<!doctype html><html><head>',
      '<meta property="og:title" content="OpenAI - YouTube">',
      '</head><body>',
      '<script>var ytInitialData = {"metadata":{"channelMetadataRenderer":{"channelId":"UCabcdefghijklmnopqrstuv"}}};</script>',
      '</body></html>',
    ].join('');
    const resolvedYoutube = await resolveYoutubeChannel('@openai', {
      fetchImplementation: async () =>
        new Response(youtubeHtml, {
          headers: { 'content-type': 'text/html; charset=utf-8' },
          status: 200,
        }),
    });
    assert(
      resolvedYoutube.feedUrl ===
        'https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv',
      `youtube resolver should build the feed url, got ${resolvedYoutube.feedUrl}`,
    );
    assert(
      resolvedYoutube.label === 'OpenAI',
      `youtube resolver should extract the channel title, got ${resolvedYoutube.label}`,
    );
    checks.push({ name: 'YouTube 频道解析（@handle）' });

    let youtubeResolveErrorKind: string | null = null;

    try {
      await resolveYoutubeChannel('@missing', {
        fetchImplementation: async () =>
          new Response('<html><body>no channel here</body></html>', { status: 200 }),
      });
    } catch (error) {
      youtubeResolveErrorKind = error instanceof YoutubeChannelResolveError ? error.kind : null;
    }

    assert(
      youtubeResolveErrorKind === 'resolve-failed',
      `youtube resolver should fail when channelId is missing, got ${youtubeResolveErrorKind}`,
    );
    checks.push({ name: 'YouTube 解析失败路径' });

    const directChannel = await resolveYoutubeChannel('UCabcdefghijklmnopqrstuv');
    assert(
      directChannel.feedUrl ===
        'https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv',
      'youtube resolver should accept a raw channel id without fetching',
    );
    checks.push({ name: 'YouTube 频道 ID 直接构造 feed' });

    const youtubeInvalidResponse = await app.inject({
      method: 'POST',
      payload: { input: '' },
      url: '/admin/api/source-presets/youtube/resolve',
    });
    assert(
      youtubeInvalidResponse.statusCode === 400,
      `empty youtube input should return 400, got ${youtubeInvalidResponse.statusCode}`,
    );
    checks.push({ name: 'YouTube 解析接口空输入返回 400' });

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
    await rssApi.close();
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
  const providers = createRuntimeSourceProviders({
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
    providers.x instanceof BrowserXSourceProvider,
    'browser mode should create BrowserXSourceProvider',
  );
  assert(
    providers.rss instanceof RssSourceProvider,
    'runtime source providers should create RssSourceProvider',
  );
  checks.push({ name: 'scheduler 会创建 browser X provider 与 RSS provider' });
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

function createRssItem(item: MockFeedItem): string {
  return [
    '<item>',
    `<title>${escapeXml(item.title)}</title>`,
    ...(item.link === undefined ? [] : [`<link>${escapeXml(item.link)}</link>`]),
    `<guid isPermaLink="false">${escapeXml(item.guid)}</guid>`,
    ...(item.pubDate === undefined ? [] : [`<pubDate>${escapeXml(item.pubDate)}</pubDate>`]),
    ...(item.description === undefined
      ? []
      : [`<description><![CDATA[${item.description}]]></description>`]),
    '</item>',
  ].join('');
}

function createRssDocument(title: string, items: string[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0"><channel>',
    `<title>${escapeXml(title)}</title>`,
    ...items,
    '</channel></rss>',
  ].join('');
}

function createAtomEntry(entry: MockAtomEntry): string {
  return [
    '<entry>',
    `<title>${escapeXml(entry.title)}</title>`,
    `<id>${escapeXml(entry.id)}</id>`,
    `<link rel="alternate" href="${escapeXml(entry.link)}"/>`,
    ...(entry.published === undefined ? [] : [`<published>${escapeXml(entry.published)}</published>`]),
    ...(entry.contentHtml === undefined
      ? []
      : [`<content type="html"><![CDATA[${entry.contentHtml}]]></content>`]),
    '</entry>',
  ].join('');
}

function createAtomDocument(title: string, entries: string[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `<title>${escapeXml(title)}</title>`,
    ...entries,
    '</feed>',
  ].join('');
}

interface MockTrendingRepo {
  description?: string;
  language?: string;
  name: string;
  owner: string;
  stars: string;
  starsToday?: string;
}

function createTrendingHtml(repos: MockTrendingRepo[]): string {
  const articles = repos.map((repo) => {
    const repoPath = `${repo.owner}/${repo.name}`;

    return [
      '<article class="Box-row">',
      `<h2 class="h3 lh-condensed"><a href="/${repoPath}">${repo.owner} / ${repo.name}</a></h2>`,
      repo.description === undefined
        ? ''
        : `<p class="col-9 color-fg-muted my-1 pr-4"><span class="sr-only">Star ${repo.owner} / ${repo.name}</span>${repo.description}</p>`,
      repo.language === undefined
        ? ''
        : `<span itemprop="programmingLanguage">${repo.language}</span>`,
      `<a href="/${repoPath}/stargazers"><svg class="octicon"></svg>${repo.stars}</a>`,
      repo.starsToday === undefined
        ? ''
        : `<span class="d-inline-block float-sm-right">${repo.starsToday} stars today</span>`,
      '</article>',
    ].join('');
  });

  return `<!doctype html><html><body>${articles.join('')}</body></html>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
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

async function startMockFeedServer(): Promise<{
  close(): Promise<void>;
  setFeed(path: string, feed: MockFeedResponse): void;
  url: string;
}> {
  const feeds = new Map<string, MockFeedResponse>();
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    const feed = feeds.get(requestUrl.pathname);

    if (request.method !== 'GET' || feed === undefined) {
      response.writeHead(404, {
        'content-type': 'text/plain; charset=utf-8',
      });
      response.end('not found');
      return;
    }

    response.writeHead(feed.statusCode, {
      'content-type': feed.contentType,
    });
    response.end(feed.body);
  });
  const url = await listen(server);

  return {
    close: () => closeServer(server),
    setFeed(path, feed) {
      feeds.set(path, feed);
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

async function startMockProxy(): Promise<{
  close(): Promise<void>;
  requests: string[];
  url: string;
}> {
  const requests: string[] = [];
  const server = http.createServer((request, response) => {
    const target = request.url ?? '';
    requests.push(target);

    if (request.method !== 'GET' || !/^http:\/\//u.test(target)) {
      sendJson(response, { error: 'unsupported proxy request' }, 400);
      return;
    }

    const targetUrl = new URL(target);
    const upstream = http.request(
      {
        headers: {
          ...request.headers,
          host: targetUrl.host,
        },
        hostname: targetUrl.hostname,
        method: 'GET',
        path: `${targetUrl.pathname}${targetUrl.search}`,
        port: targetUrl.port,
      },
      (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(response);
      },
    );

    upstream.on('error', () => {
      response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('proxy upstream error');
    });
    request.pipe(upstream);
  });
  const url = await listen(server);

  return {
    close: () => closeServer(server),
    requests,
    url,
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
