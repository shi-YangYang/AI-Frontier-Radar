import { createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';

import type { AppConfig } from '../src/shared/config/types';
import { toPrismaSqliteDatabaseUrl } from '../src/shared/config';
import { loadAppConfig } from '../src/config';
import { createLogger } from '../src/lib/logger';
import { createApp } from '../src/app/create-app';
import { createAuthService } from '../src/modules/auth';
import type { WechatLoginState } from '../src/modules/wechat';
import { BrowserXSourceProvider, RssSourceProvider, SourceProviderError, YoutubeChannelResolveError, createAi2BlogSourceProvider, createAnthropicNewsSourceProvider, createGithubTrendingSourceProvider, createHfDailyPapersSourceProvider, createMoonshotBlogSourceProvider, createRssSourceProvider, createSourceProviderRegistry, createSubscriptionRuleMatcher, createXSourceProvider, normalizeMetaBlogRawEntries, parseAi2BlogHtml, parseMoonshotBlogHtml, parseXaiNewsHtml, resolveYoutubeChannel, runPollingJob } from '../src/modules/polling';
import { createV1TextMessageFormatter, isWithinQuietHours, runDeliveryWorkerJob } from '../src/modules/delivery';
import { createWechatBridgeSender } from '../src/modules/delivery/channel';
import { createRuntimeScheduler, createRuntimeSourceProviders } from '../src/modules/scheduler';
import { createPrismaClient, createRuntimeSettingsService, createStorage, seedSourcePacks } from '../src/modules/storage';
import { SOURCE_GROUPS } from '../src/config/source-groups';
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

const SMOKE_ADMIN_PASSWORD = 'smoke-admin-pass';
const SMOKE_ADMIN_USERNAME = 'smoke-admin';
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
    webhookUrl: webhook.urls.feishu,
    xApiBaseUrl: xApi.url,
  });
  const storage = createStorage({
    databaseUrl,
    defaultDeliveryTarget: {
      targetKey: TARGET_KEY,
      webhookUrl: webhook.urls.feishu,
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
  const hfPapersProvider = createHfDailyPapersSourceProvider({
    timeoutMs: 5_000,
  });
  const anthropicProvider = createAnthropicNewsSourceProvider({
    timeoutMs: 5_000,
  });
  const ai2BlogProvider = createAi2BlogSourceProvider({
    timeoutMs: 5_000,
  });
  const moonshotBlogProvider = createMoonshotBlogSourceProvider({
    timeoutMs: 5_000,
  });
  const sourceProviders = createSourceProviderRegistry({
    ai2_blog: ai2BlogProvider,
    anthropic_news: anthropicProvider,
    github: githubProvider,
    hf_papers: hfPapersProvider,
    moonshot_blog: moonshotBlogProvider,
    rss: rssProvider,
    x: sourceProvider,
  });
  const fakeWechatAccounts = [
    {
      accountId: 'wechat-a@im.bot',
      baseUrl: 'https://ilinkai.weixin.qq.com',
      hasContextToken: true,
      tokenMasked: 'aaaa***bbbb',
      userId: 'user-a@im.wechat',
    },
    {
      accountId: 'wechat-b@im.bot',
      baseUrl: 'https://ilinkai.weixin.qq.com',
      hasContextToken: false,
      tokenMasked: 'cccc***dddd',
      userId: 'user-b@im.wechat',
    },
  ];
  let fakeWechatLoginState: WechatLoginState = { loggedIn: true, status: 'idle' };
  // Start the bridge in its own test section, so the startup timer cannot change earlier fixtures.
  let fakeWechatRunning = false;
  const fakeWechatBridge = {
    getAccounts: async () => fakeWechatAccounts,
    getLoginState: async () => fakeWechatLoginState,
    cancelLogin: async () => true,
    getStatus: () => ({ installed: true, port: 3_991, running: fakeWechatRunning }),
    getTargets: async () => [],
    isInstalled: () => true,
    isRunning: () => fakeWechatRunning,
    removeAccount: async (accountId: string) => {
      const index = fakeWechatAccounts.findIndex((account) => account.accountId === accountId);

      if (index >= 0) {
        fakeWechatAccounts.splice(index, 1);
        return true;
      }

      return false;
    },
    sendMessage: async () => ({ ok: true }),
    startLogin: async () => ({ status: 'pending' }),
    submitLoginCode: async () => undefined,
  };
  const auth = createAuthService({
    adminPassword: SMOKE_ADMIN_PASSWORD,
    adminUsername: SMOKE_ADMIN_USERNAME,
    storage,
  });
  const app = createApp({
    auth,
    wechatBridge: fakeWechatBridge as never,
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

        if (input.sourceType === 'anthropic_news') {
          return anthropicProvider.validateSource({
            source: {
              sourceType: 'anthropic_news',
              sourceUrl: input.sourceUrl,
            },
          });
        }

        if (input.sourceType === 'ai2_blog') {
          return ai2BlogProvider.validateSource({
            source: {
              sourceType: 'ai2_blog',
              sourceUrl: input.sourceUrl,
            },
          });
        }

        if (input.sourceType === 'moonshot_blog') {
          return moonshotBlogProvider.validateSource({
            source: {
              sourceType: 'moonshot_blog',
              sourceUrl: input.sourceUrl,
            },
          });
        }

        if (input.sourceType === 'hf_papers') {
          return hfPapersProvider.validateSource({
            source: {
              sourceType: 'hf_papers',
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

  let adminCookie = '';
  let rawInject: typeof app.inject = app.inject.bind(app);

  try {
    await storage.initialize();
    await auth.ensureSeedAdmin();
    await app.ready();

    const adminLoginResponse = await app.inject({
      method: 'POST',
      payload: { password: SMOKE_ADMIN_PASSWORD, username: SMOKE_ADMIN_USERNAME },
      url: '/auth/login',
    });
    assert(adminLoginResponse.statusCode === 200, `admin login returned ${adminLoginResponse.statusCode}`);
    adminCookie = readSessionCookie(adminLoginResponse.headers['set-cookie']);
    assert(adminCookie.length > 0, 'admin login should set a session cookie');

    rawInject = app.inject.bind(app);
    app.inject = ((options: string | Record<string, unknown>) => {
      if (typeof options === 'string') {
        return rawInject({ headers: { cookie: adminCookie }, method: 'GET', url: options });
      }

      const headers = (options.headers as Record<string, string> | undefined) ?? {};

      return rawInject({
        ...options,
        headers: { cookie: adminCookie, ...headers },
      } as never);
    }) as typeof app.inject;

    await verifySourceModeConfig(checks, tempDir);
    verifyRuntimeSourceProviderFactory(checks, config);

    const seededAccount = await storage.watchAccounts.findByUsername(WATCH_USERNAME);
    assert(seededAccount !== null, 'seed watch account was not written');
    assert(seededAccount.enabled, 'seed watch account should be enabled');
    checks.push({ name: 'seed watch account 写入数据库' });

    const groupsSqlitePath = join(tempDir, 'groups.sqlite');
    const groupsStorage = createStorage({
      databaseUrl: toPrismaSqliteDatabaseUrl(groupsSqlitePath),
      sqlitePath: groupsSqlitePath,
      watchAccountsSource: { items: [], type: 'database' },
    });
    // smoke 环境无外网：YouTube 频道解析用桩替换（Neuralink 模拟解析失败，验证跳过不阻塞）。
    const smokeYoutubeFeedUrls = new Map<string, string>([
      ['TwoMinutePapers', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsmokeAI1'],
      ['ai-explained', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsmokeAI2'],
      ['YannicKilcher', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsmokeAI3'],
      ['BostonDynamics', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsmokeRobot1'],
      ['jamesbruton', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsmokeRobot2'],
    ]);
    const youtubeChannelResolver = async (handle: string) => {
      const feedUrl = smokeYoutubeFeedUrls.get(handle);

      if (feedUrl === undefined) {
        throw new YoutubeChannelResolveError('resolve-failed', `smoke: no channel for ${handle}`);
      }

      return { feedUrl, label: `Smoke ${handle}` };
    };

    try {
      await groupsStorage.initialize();

      const aiGroup = SOURCE_GROUPS.find((group) => group.id === 'ai-news');
      assert(aiGroup !== undefined, 'ai-news source group should exist');

      // 验证 start-server 的种子 resolver 从运行时设置（SQLite app_settings）读取 RSS 代理，
      // 而非 .env：注入 7897 等价 mock 代理并断言 resolver 收到的 proxyUrl 来自 database_override。
      const seedRuntimeSettings = createRuntimeSettingsService({
        config: { ...config, source: { ...config.source, rss: undefined } },
        storage: groupsStorage,
      });
      const mockProxyUrl = 'http://127.0.0.1:7897/';
      await groupsStorage.appSettings.setJson('source.rss.proxyUrl', mockProxyUrl);
      const recordedProxyUrls: Array<string | undefined> = [];
      const proxiedYoutubeChannelResolver = async (handle: string) => {
        const rssSettings = await seedRuntimeSettings.getEffectiveRssProxySettings();
        recordedProxyUrls.push(rssSettings.proxyUrl);
        return youtubeChannelResolver(handle);
      };

      const firstSeed = await seedSourcePacks({
        sourcePacks: groupsStorage.sourcePacks,
        watchAccounts: groupsStorage.watchAccounts,
        youtubeChannelResolver: proxiedYoutubeChannelResolver,
      });
      assert(
        recordedProxyUrls.length > 0 &&
          recordedProxyUrls.every((proxyUrl) => proxyUrl === mockProxyUrl),
        `seed youtube resolver should receive the runtime-settings proxy (${mockProxyUrl}), got ${JSON.stringify(recordedProxyUrls)}`,
      );
      const rssProxyAfterSeed = await seedRuntimeSettings.getEffectiveRssProxySettings();
      assert(
        rssProxyAfterSeed.proxySource === 'database_override' && rssProxyAfterSeed.proxyUrl === mockProxyUrl,
        `rss proxy should resolve from SQLite with database_override source, got ${JSON.stringify(rssProxyAfterSeed)}`,
      );
      checks.push({ name: 'seed YouTube 解析的代理来自运行时设置（SQLite 优先，回落 .env）' });
      assert(
        firstSeed.paperPackCreated && firstSeed.paperPackName === '论文包' &&
          firstSeed.createdPackNames.length === 4,
        `first seed should create the paper pack plus 4 built-in packs, got ${JSON.stringify(firstSeed)}`,
      );

      const secondSeed = await seedSourcePacks({
        sourcePacks: groupsStorage.sourcePacks,
        watchAccounts: groupsStorage.watchAccounts,
        youtubeChannelResolver,
      });
      assert(
        !secondSeed.paperPackCreated && secondSeed.paperPackId === firstSeed.paperPackId &&
          secondSeed.createdPackNames.length === 0 && secondSeed.createdSourceCount === 0,
        `second seed should be a no-op, got ${JSON.stringify(secondSeed)}`,
      );
      assert(
        secondSeed.skippedSources.some((skipped) => skipped.source === 'Neuralink'),
        `unresolvable YouTube channel should be skipped without blocking the seed, got ${JSON.stringify(secondSeed.skippedSources)}`,
      );

      const seededPacks = await groupsStorage.sourcePacks.listAll();
      assert(
        seededPacks.length === 5 &&
          seededPacks.some((pack) => pack.name === '论文包' && pack.memberSourceIds.length === aiGroup.sources.length) &&
          ['AI 包', '机器人包', '脑机包', '融资包'].every((name) =>
            seededPacks.some((pack) => pack.name === name),
          ),
        `seed should persist 论文包 plus 4 built-in packs, got ${JSON.stringify(seededPacks.map((pack) => [pack.name, pack.memberSourceIds.length]))}`,
      );

      const samaAccount = await groupsStorage.watchAccounts.findByUsername('sama');
      assert(
        samaAccount !== null && samaAccount.displayName === 'Sam Altman' && samaAccount.enabled,
        `seed X source @sama should exist with its display name, got ${JSON.stringify(samaAccount)}`,
      );
      const robotReportAccount = await groupsStorage.watchAccounts.findBySource({
        sourceType: 'rss',
        sourceUrl: 'https://www.therobotreport.com/feed/',
      });
      assert(robotReportAccount !== null, 'seed RSS source The Robot Report should exist');
      const youtubeFeedUrl = smokeYoutubeFeedUrls.get('TwoMinutePapers') ?? '';
      const youtubeAccount = await groupsStorage.watchAccounts.findBySource({
        sourceType: 'rss',
        sourceUrl: youtubeFeedUrl,
      });
      assert(
        youtubeAccount !== null && youtubeAccount.displayName === 'Smoke TwoMinutePapers',
        `resolved YouTube channel should be stored as an rss feed source, got ${JSON.stringify(youtubeAccount)}`,
      );
      const aiPack = seededPacks.find((pack) => pack.name === 'AI 包');
      assert(
        aiPack !== undefined && aiPack.memberSourceIds.includes(samaAccount.id) &&
          aiPack.memberSourceIds.includes(youtubeAccount.id),
        `AI pack should include the seeded X source and the resolved YouTube feed, got ${JSON.stringify(aiPack)}`,
      );
      checks.push({ name: '首启 seed：论文包 + 4 内置包，X/RSS/YouTube 源挂包，重复执行不重复' });

      const groupsAuth = createAuthService({
        adminPassword: SMOKE_ADMIN_PASSWORD,
        adminUsername: SMOKE_ADMIN_USERNAME,
        storage: groupsStorage,
      });
      await groupsAuth.ensureSeedAdmin();
      const groupsApp = createApp({
        auth: groupsAuth,
        config,
        logger,
        storage: groupsStorage,
      });
      await groupsApp.ready();
      const groupsLoginResponse = await groupsApp.inject({
        method: 'POST',
        payload: { password: SMOKE_ADMIN_PASSWORD, username: SMOKE_ADMIN_USERNAME },
        url: '/auth/login',
      });
      assert(
        groupsLoginResponse.statusCode === 200,
        `groups admin login returned ${groupsLoginResponse.statusCode}`,
      );
      const groupsPacksResponse = await groupsApp.inject({
        headers: { cookie: readSessionCookie(groupsLoginResponse.headers['set-cookie']) },
        method: 'GET',
        url: '/admin/api/source-packs',
      });
      const groupsPacksBody = groupsPacksResponse.json() as {
        data?: { packs?: Array<{ enabled: boolean; name: string; sourceCount: number }> };
      };
      assert(
        groupsPacksResponse.statusCode === 200 &&
          groupsPacksBody.data?.packs?.length === 5 &&
          groupsPacksBody.data.packs.some(
            (pack) => pack.name === '论文包' && pack.enabled && pack.sourceCount === aiGroup.sources.length,
          ),
        `source-packs GET should return the 5 seeded packs, got ${groupsPacksResponse.body}`,
      );
      await groupsApp.close();
      checks.push({ name: '种子后 source-packs GET 返回 5 个包' });
    } finally {
      await groupsStorage.close();
    }

    // (a) YouTube 全失败场景：单条源失败不中断种子，4 个内置包仍然创建（允许部分成员）。
    const allFailSqlitePath = join(tempDir, 'all-fail-seed.sqlite');
    const allFailStorage = createStorage({
      databaseUrl: toPrismaSqliteDatabaseUrl(allFailSqlitePath),
      sqlitePath: allFailSqlitePath,
      watchAccountsSource: { items: [], type: 'database' },
    });

    try {
      await allFailStorage.initialize();
      const allFailResolver = async (handle: string): Promise<{ feedUrl: string }> => {
        throw new YoutubeChannelResolveError('resolve-failed', `smoke: youtube all failed for ${handle}`);
      };
      const failSeed = await seedSourcePacks({
        sourcePacks: allFailStorage.sourcePacks,
        watchAccounts: allFailStorage.watchAccounts,
        youtubeChannelResolver: allFailResolver,
      });
      assert(
        failSeed.paperPackCreated && failSeed.createdPackNames.length === 4 &&
          ['AI 包', '机器人包', '脑机包', '融资包'].every((name) =>
            failSeed.createdPackNames.includes(name),
          ),
        `all-Youtube-failed seed should still create the 4 built-in packs, got ${JSON.stringify(failSeed)}`,
      );
      assert(
        failSeed.skippedSources.length === 6 &&
          ['TwoMinutePapers', 'ai-explained', 'YannicKilcher', 'BostonDynamics', 'jamesbruton', 'Neuralink']
            .every((handle) => failSeed.skippedSources.some((skipped) => skipped.source === handle)),
        `all 6 Youtube handles should be recorded as skipped, got ${JSON.stringify(failSeed.skippedSources)}`,
      );

      const packsAfterFailSeed = await allFailStorage.sourcePacks.listAll();
      const packMemberCount = (packs: Awaited<ReturnType<typeof allFailStorage.sourcePacks.listAll>>, name: string): number =>
        packs.find((pack) => pack.name === name)?.memberSourceIds.length ?? -1;
      assert(
        packMemberCount(packsAfterFailSeed, '论文包') === 22 &&
          packMemberCount(packsAfterFailSeed, 'AI 包') === 24 &&
          packMemberCount(packsAfterFailSeed, '机器人包') === 6 &&
          packMemberCount(packsAfterFailSeed, '脑机包') === 3 &&
          packMemberCount(packsAfterFailSeed, '融资包') === 7,
        `packs should be created with partial members when all Youtube resolutions fail, got ${JSON.stringify(
          packsAfterFailSeed.map((pack) => [pack.name, pack.memberSourceIds.length]),
        )}`,
      );
      checks.push({ name: 'YouTube 全失败：4 内置包仍创建，缺失成员跳过不阻塞种子' });

      // 收敛语义：管理员从内置包删除的种子成员会在下次启动补挂；管理员自建包完全不受影响。
      const samaAccount = await allFailStorage.watchAccounts.findByUsername('sama');
      assert(samaAccount !== null, 'seed X source @sama should exist after fail seed');
      const customPack = await allFailStorage.sourcePacks.create({
        description: '管理员自建包',
        name: '自定义包',
        sourceIds: [samaAccount.id],
      });
      const aiPackBeforeRetry = packsAfterFailSeed.find((pack) => pack.name === 'AI 包');
      assert(aiPackBeforeRetry !== undefined, 'AI pack should exist after fail seed');
      await allFailStorage.sourcePacks.update(aiPackBeforeRetry.id, {
        sourceIds: aiPackBeforeRetry.memberSourceIds.filter((id) => id !== samaAccount.id),
      });

      // (b) 下一次 seed（模拟解析成功）：源补建并自动补挂进已存在的内置包（幂等）。
      const retryResolver = async (handle: string): Promise<{ feedUrl: string; label?: string }> => {
        if (handle === 'Neuralink') {
          return {
            feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsmokeBCI1',
            label: 'Smoke Neuralink',
          };
        }

        return youtubeChannelResolver(handle);
      };
      const retrySeed = await seedSourcePacks({
        sourcePacks: allFailStorage.sourcePacks,
        watchAccounts: allFailStorage.watchAccounts,
        youtubeChannelResolver: retryResolver,
      });
      assert(
        retrySeed.createdPackNames.length === 0 && retrySeed.createdSourceCount === 6 &&
          retrySeed.repairedPackNames.length === 3 &&
          ['AI 包', '机器人包', '脑机包'].every((name) => retrySeed.repairedPackNames.includes(name)),
        `retry seed should create the 6 Youtube sources and re-attach them into the existing packs, got ${JSON.stringify(retrySeed)}`,
      );

      const packsAfterRetry = await allFailStorage.sourcePacks.listAll();
      assert(
        packMemberCount(packsAfterRetry, 'AI 包') === 27 &&
          packMemberCount(packsAfterRetry, '机器人包') === 8 &&
          packMemberCount(packsAfterRetry, '脑机包') === 4 &&
          packMemberCount(packsAfterRetry, '融资包') === 7,
        `resolved Youtube feeds should be backfilled into the existing built-in packs, got ${JSON.stringify(
          packsAfterRetry.map((pack) => [pack.name, pack.memberSourceIds.length]),
        )}`,
      );
      const aiPackAfterRetry = packsAfterRetry.find((pack) => pack.name === 'AI 包');
      assert(
        aiPackAfterRetry !== undefined && aiPackAfterRetry.memberSourceIds.includes(samaAccount.id),
        'admin-removed seed member should be re-attached into the built-in AI pack',
      );
      const customPackAfterRetry = await allFailStorage.sourcePacks.findById(customPack.id);
      assert(
        customPackAfterRetry !== null && customPackAfterRetry.memberSourceIds.length === 1 &&
          customPackAfterRetry.memberSourceIds[0] === samaAccount.id &&
          customPackAfterRetry.description === '管理员自建包',
        `admin-created pack must not be touched by seed backfill, got ${JSON.stringify(customPackAfterRetry)}`,
      );
      checks.push({ name: '内置包种子成员收敛补挂，管理员自建包不受影响' });
      const thirdSeed = await seedSourcePacks({
        sourcePacks: allFailStorage.sourcePacks,
        watchAccounts: allFailStorage.watchAccounts,
        youtubeChannelResolver: retryResolver,
      });
      assert(
        thirdSeed.createdPackNames.length === 0 && thirdSeed.createdSourceCount === 0 &&
          thirdSeed.repairedPackNames.length === 0 && thirdSeed.skippedSources.length === 0,
        `third seed should be a full no-op after backfill, got ${JSON.stringify(thirdSeed)}`,
      );
      checks.push({ name: 'YouTube 解析恢复：源补建并自动补挂进已存在内置包，重复 seed 幂等' });
    } finally {
      await allFailStorage.close();
    }

    const legacySqlitePath = join(tempDir, 'legacy-pack.sqlite');
    const legacyStorage = createStorage({
      databaseUrl: toPrismaSqliteDatabaseUrl(legacySqlitePath),
      sqlitePath: legacySqlitePath,
      watchAccountsSource: { items: [], type: 'database' },
    });

    try {
      await legacyStorage.initialize();

      const legacySource = await legacyStorage.watchAccounts.create({
        enabled: true,
        sourceType: 'rss',
        sourceUrl: 'https://export.arxiv.org/rss/cs.AI',
      });
      const legacyPack = await legacyStorage.sourcePacks.create({
        description: '存量 AI 消息包描述',
        name: 'AI 消息',
        sourceIds: [legacySource.id],
      });

      const renameSeed = await seedSourcePacks({
        sourcePacks: legacyStorage.sourcePacks,
        watchAccounts: legacyStorage.watchAccounts,
        youtubeChannelResolver,
      });
      const renamedPack = await legacyStorage.sourcePacks.findById(legacyPack.id);
      assert(
        renameSeed.renamedFromLegacy && renamedPack !== null &&
          renamedPack.id === legacyPack.id && renamedPack.name === '论文包' &&
          renamedPack.description === '存量 AI 消息包描述' &&
          renamedPack.memberSourceIds.length === 1,
        `legacy pack should be renamed in place keeping id, members and description, got ${JSON.stringify(renameSeed)} / ${JSON.stringify(renamedPack)}`,
      );
      checks.push({ name: '存量「AI 消息」包改名「论文包」且保留 id、成员与描述' });
    } finally {
      await legacyStorage.close();
    }

    const removedGroupsResponse = await app.inject({ method: 'GET', url: '/admin/api/source-groups' });
    assert(
      removedGroupsResponse.statusCode === 404,
      `removed source-groups API should return 404, got ${removedGroupsResponse.statusCode}`,
    );
    const removedApplyResponse = await app.inject({
      method: 'POST',
      url: '/admin/api/source-groups/not-exist/apply',
    });
    assert(
      removedApplyResponse.statusCode === 404,
      `removed source-groups apply API should return 404, got ${removedApplyResponse.statusCode}`,
    );
    checks.push({ name: '旧监听组合 API 已删除（404）' });

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
    const anchorPoll = await runPollingJob({
      config,
      logger,
      sourceProviders,
      storage,
    });
    assert(anchorPoll.status === 'success', 'first polling run with posts should succeed');
    assert(anchorPoll.newPostsDetected === 0, 'first polling run should only anchor the newest post');
    assert(anchorPoll.eventsCreated === 0, 'first polling run should not create events');
    const anchorPost = await storage.xPosts.findByXPostId('1000000000000000000');
    assert(anchorPost === null, 'first polling run should not store the anchor post');
    const accountAfterAnchorPoll = await storage.watchAccounts.findByUsername(WATCH_USERNAME);
    assert(
      accountAfterAnchorPoll?.baselinePostId === '1000000000000000000' &&
        accountAfterAnchorPoll?.lastSeenPostId === '1000000000000000000',
      'first polling run should anchor the newest fetched post',
    );
    checks.push({ name: '首轮仅锚定最新帖，不落库不投递' });

    xApi.setPosts([
      {
        created_at: '2026-04-24T01:00:00.000Z',
        id: '1000000000000000001',
        text: 'Smoke test new AI frontier post',
      },
    ]);
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

    const noTargetPost = await storage.xPosts.findByXPostId('1000000000000000001');
    assert(noTargetPost !== null, 'post should be stored without enabled delivery targets');
    const noTargetEvent = await storage.deliveryEvents.findByPostAndTarget(
      '1000000000000000001',
      TARGET_KEY,
    );
    assert(noTargetEvent === null, 'no delivery event should be created without enabled targets');
    checks.push({ name: '无投递目标时轮询成功并入库，不创建投递事件' });

    await storage.deliveryTargets.update(seededTarget.id, { enabled: true });

    xApi.setPosts([
      {
        created_at: '2026-04-24T02:00:00.000Z',
        id: '1000000000000000002',
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

    const rawPost = await storage.xPosts.findByXPostId('1000000000000000002');
    assert(rawPost !== null, 'new post was not written to x_posts_raw');
    checks.push({ name: '后续首条新帖会写入 x_posts_raw' });

    const deliveryEvent = await storage.deliveryEvents.findByPostAndTarget(
      '1000000000000000002',
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
      '1000000000000000002',
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
      rssPostsAfterFirstPoll.length === 0,
      `first RSS poll should only anchor without storing, got ${rssPostsAfterFirstPoll.length}`,
    );
    assert(firstRssPoll.newPostsDetected === 0, 'first RSS poll should not detect posts');
    assert(firstRssPoll.eventsCreated === 0, 'first RSS poll should not create delivery events');
    const rssAnchorEvent = await storage.deliveryEvents.findByPostAndTarget(
      rssAccountAfterFirstPoll?.baselinePostId ?? '',
      TARGET_KEY,
    );
    assert(rssAnchorEvent === null, 'RSS anchor post must not create a delivery event');
    checks.push({ name: 'RSS 首轮仅锚定最新 1 条（不落库不投递）并跳过缺 link / 重复 guid 条目' });

    rssApi.setFeed(RSS_FEED_PATH, {
      body: createRssDocument('Mock AI Feed', [
        createRssItem({
          description: '<p>Hello &amp; <b>world</b></p>',
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
      rssPostsAfterIncrement.length === 1,
      `incremental RSS poll should store exactly one post, got ${rssPostsAfterIncrement.length}`,
    );
    const incrementalRssPost = rssPostsAfterIncrement.find(
      (post) => post.postedAt === '2026-05-03T09:00:00.000Z',
    );
    assert(incrementalRssPost !== undefined, 'incremental RSS post was not stored with its pubDate');
    assert(/^\d{24}$/u.test(incrementalRssPost.xPostId), 'RSS post id should be 16+8 numeric digits');
    assert(
      incrementalRssPost.textContent === '三号条目\n\nHello & world',
      `RSS post should strip HTML and decode entities, got ${JSON.stringify(incrementalRssPost.textContent)}`,
    );
    assert(
      incrementalRssPost.authorUsername === 'Mock AI Feed',
      'RSS post should fall back to the feed title as author',
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
    assert(webhook.requests.length === 2, 'mock webhook should receive the incremental RSS request');
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
    assert(rssPostsAfterDedup.length === 1, 'dedup RSS polling should not add duplicate rows');
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
    assert(
      atomPosts.length === 0,
      `first Atom poll should only anchor without storing, got ${atomPosts.length}`,
    );
    assert(atomAccountAfterPoll?.baselinePostId !== null, 'first Atom poll should set a baseline');
    checks.push({ name: 'Atom feed 首轮仅锚定最新条目' });

    rssApi.setFeed(ATOM_FEED_PATH, {
      body: createAtomDocument('Mock Atom Feed', [
        createAtomEntry({
          contentHtml: '<p>Atom &amp; <b>content</b></p>',
          id: 'atom-3',
          link: 'https://example.com/atom/3',
          published: '2026-05-05T10:00:00.000Z',
          title: 'Atom 条目三',
        }),
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
    const atomIncrementalPoll = await runPollingJob({
      config,
      logger,
      sourceProviders,
      storage,
    });
    assert(atomIncrementalPoll.status === 'success', 'incremental Atom polling should succeed');
    const atomPostsAfterIncrement = await prisma.xPostRaw.findMany({
      where: { authorUserId: atomSourceId },
    });
    assert(
      atomPostsAfterIncrement.length === 1,
      `incremental Atom poll should store exactly one post, got ${atomPostsAfterIncrement.length}`,
    );
    assert(
      atomPostsAfterIncrement[0].postedAt === '2026-05-05T10:00:00.000Z',
      `Atom post should use published time, got ${atomPostsAfterIncrement[0].postedAt}`,
    );
    assert(
      atomPostsAfterIncrement[0].textContent === 'Atom 条目三\n\nAtom & content',
      `Atom textContent should strip HTML and decode entities, got ${JSON.stringify(atomPostsAfterIncrement[0].textContent)}`,
    );
    checks.push({ name: 'Atom feed 解析与增量入库' });

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

    const runCountBeforeRepeatFailure = await prisma.pollRun.count();
    const repeatFailingPoll = await runPollingJob({
      config,
      logger,
      sourceProviders,
      storage,
    });
    assert(
      repeatFailingPoll.status === 'partial_failed',
      `repeat failing poll status should stay partial_failed, got ${repeatFailingPoll.status}`,
    );
    const runCountAfterRepeatFailure = await prisma.pollRun.count();
    assert(
      runCountAfterRepeatFailure === runCountBeforeRepeatFailure,
      `identical failure should merge instead of adding a run: ${runCountBeforeRepeatFailure} -> ${runCountAfterRepeatFailure}`,
    );
    const mergedFailingRun = await prisma.pollRun.findFirst({
      orderBy: { startedAt: 'desc' },
    });
    assert(
      mergedFailingRun !== null && mergedFailingRun.repeatCount >= 2,
      `consecutive identical failures should increment repeatCount, got ${mergedFailingRun?.repeatCount}`,
    );
    checks.push({ name: '连续相同失败合并为一条记录' });

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

    const hfApiPath = '/hf-api';
    const hfApiUrl = `${rssApi.url}${hfApiPath}`;
    rssApi.setFeed(hfApiPath, {
      body: JSON.stringify([
        {
          paper: {
            authors: [{ name: 'Alice' }, { name: 'Bob' }],
            id: '2609.00001',
            publishedAt: '2026-09-15T00:00:00.000Z',
            submittedOnDailyAt: '2026-09-16T00:00:00.000Z',
            summary: 'Summary one.',
            title: 'Paper One',
            upvotes: 12,
          },
        },
        {
          paper: {
            id: '2609.00002',
            summary: 'Summary two.',
            title: 'Paper Two',
            upvotes: 3,
          },
        },
      ]),
      contentType: 'application/json; charset=utf-8',
      statusCode: 200,
    });

    const directPapers = await hfPapersProvider.fetchPosts({
      limit: 10,
      source: { sourceType: 'hf_papers', sourceUrl: hfApiUrl },
    });
    assert(
      directPapers.posts.length === 2,
      `hf provider should parse 2 papers, got ${directPapers.posts.length}`,
    );
    assert(
      directPapers.posts[0]?.textContent.includes('Paper One') &&
        directPapers.posts[0]?.textContent.includes('👍 12'),
      'hf paper post should contain the title and upvotes',
    );
    assert(
      directPapers.posts[0]?.dedupeKey === 'hf:papers:2609.00001',
      `hf paper dedupe key mismatch: ${directPapers.posts[0]?.dedupeKey}`,
    );
    checks.push({ name: 'HF Daily Papers 解析（标题/摘要/点赞）' });

    const createHfResponse = await app.inject({
      method: 'POST',
      payload: { sourceType: 'hf_papers', sourceUrl: hfApiUrl },
      url: '/admin/api/watch-accounts',
    });
    assert(
      createHfResponse.statusCode === 200,
      `hf source create returned ${createHfResponse.statusCode}`,
    );
    const hfAccount = await storage.watchAccounts.findBySource({
      sourceType: 'hf_papers',
      sourceUrl: hfApiUrl,
    });
    assert(hfAccount !== null, 'hf watch account was not stored');

    await runPollingJob({ config, logger, sourceProviders, storage });
    const hfAccountAfterPoll = await storage.watchAccounts.findById(hfAccount.id);
    const hfAuthorId = hfAccountAfterPoll?.xUserId ?? '';
    const hfPostsAfterFirst = await prisma.xPostRaw.count({ where: { authorUserId: hfAuthorId } });
    assert(hfPostsAfterFirst === 2, `first hf poll should store both papers, got ${hfPostsAfterFirst}`);
    const hfBaselinePost = await storage.xPosts.findByDedupeKey('hf:papers:2609.00001');
    assert(hfBaselinePost !== null, 'hf baseline paper was not stored');
    const hfBaselineEvent = await storage.deliveryEvents.findByPostAndTarget(
      hfBaselinePost.xPostId,
      TARGET_KEY,
    );
    assert(hfBaselineEvent === null, 'hf baseline papers must not create delivery events');
    checks.push({ name: 'HF Daily Papers 首次基线全量入库且不投递' });

    rssApi.setFeed(hfApiPath, {
      body: JSON.stringify([
        { paper: { id: '2609.00003', summary: 'Summary three.', title: 'Paper Three', upvotes: 9 } },
        { paper: { id: '2609.00001', summary: 'Summary one.', title: 'Paper One', upvotes: 12 } },
      ]),
      contentType: 'application/json; charset=utf-8',
      statusCode: 200,
    });
    await runPollingJob({ config, logger, sourceProviders, storage });
    const hfNewPost = await storage.xPosts.findByDedupeKey('hf:papers:2609.00003');
    assert(hfNewPost !== null, 'newly listed hf paper was not stored');
    const hfNewEvent = await storage.deliveryEvents.findByPostAndTarget(
      hfNewPost.xPostId,
      TARGET_KEY,
    );
    assert(hfNewEvent !== null, 'newly listed hf paper should create a delivery event');
    checks.push({ name: 'HF Daily Papers 新论文增量入库并投递' });

    const anthropicPath = '/anthropic-news';
    const anthropicUrl = `${rssApi.url}${anthropicPath}`;
    const createAnthropicHtml = (extraArticle: boolean): string => {
      const articles = [
        '<a href="/news/article-two"><div><span class="caption bold">Product</span><time class="date">Sep 12, 2026</time></div><h4 class="title">Article Two</h4><p class="body">Summary two.</p></a>',
        '<a href="/news/article-one"><div><time class="date">Sep 10, 2026</time><span class="subject">Announcements</span></div><span class="title">Article One</span></a>',
        ...(extraArticle
          ? [
              '<a href="/news/article-three"><div><span class="caption bold">Announcements</span><time class="date">Sep 14, 2026</time></div><h4 class="title">Article Three</h4><p class="body">Summary three.</p></a>',
            ]
          : []),
      ];

      return `<html><body>${articles.join('')}</body></html>`;
    };

    rssApi.setFeed(anthropicPath, {
      body: createAnthropicHtml(false),
      contentType: 'text/html; charset=utf-8',
      statusCode: 200,
    });

    const directNews = await anthropicProvider.fetchPosts({
      limit: 10,
      source: { sourceType: 'anthropic_news', sourceUrl: anthropicUrl },
    });
    assert(directNews.posts.length === 2, `anthropic provider should parse 2 articles, got ${directNews.posts.length}`);
    assert(
      directNews.posts[0]?.textContent.includes('Article Two') &&
        directNews.posts[0]?.textContent.includes('Summary two.') &&
        directNews.posts[0]?.textContent.includes('Product'),
      'anthropic post should contain title, summary and category',
    );
    assert(
      directNews.posts[0]?.dedupeKey === 'anthropic:news:article-two',
      `anthropic dedupe key mismatch: ${directNews.posts[0]?.dedupeKey}`,
    );
    checks.push({ name: 'Anthropic 新闻解析（标题/摘要/分类）' });

    const createAnthropicResponse = await app.inject({
      method: 'POST',
      payload: { sourceType: 'anthropic_news', sourceUrl: anthropicUrl },
      url: '/admin/api/watch-accounts',
    });
    assert(
      createAnthropicResponse.statusCode === 200,
      `anthropic source create returned ${createAnthropicResponse.statusCode}`,
    );
    const anthropicAccount = await storage.watchAccounts.findBySource({
      sourceType: 'anthropic_news',
      sourceUrl: anthropicUrl,
    });
    assert(anthropicAccount !== null, 'anthropic watch account was not stored');

    await runPollingJob({ config, logger, sourceProviders, storage });
    const anthropicAccountAfterFirstPoll = await storage.watchAccounts.findById(anthropicAccount.id);
    const anthropicPostsAfterFirstPoll = await prisma.xPostRaw.count({
      where: { authorUserId: anthropicAccountAfterFirstPoll?.xUserId ?? '' },
    });
    assert(
      anthropicPostsAfterFirstPoll === 0,
      `first anthropic poll should only anchor without storing, got ${anthropicPostsAfterFirstPoll}`,
    );
    const anthropicBaselinePost = await storage.xPosts.findByDedupeKey('anthropic:news:article-two');
    assert(anthropicBaselinePost === null, 'anthropic anchor article must not be stored');
    const anthropicSkippedPost = await storage.xPosts.findByDedupeKey('anthropic:news:article-one');
    assert(anthropicSkippedPost === null, 'older anthropic article must not be ingested on first poll');
    assert(
      anthropicAccountAfterFirstPoll?.baselinePostId !== null,
      'first anthropic poll should set a baseline',
    );
    checks.push({ name: 'Anthropic 首轮仅锚定最新 1 条（不落库不投递）' });

    rssApi.setFeed(anthropicPath, {
      body: createAnthropicHtml(true),
      contentType: 'text/html; charset=utf-8',
      statusCode: 200,
    });
    await runPollingJob({ config, logger, sourceProviders, storage });
    const anthropicNewPost = await storage.xPosts.findByDedupeKey('anthropic:news:article-three');
    assert(anthropicNewPost !== null, 'new anthropic article was not stored');
    const anthropicNewEvent = await storage.deliveryEvents.findByPostAndTarget(
      anthropicNewPost.xPostId,
      TARGET_KEY,
    );
    assert(anthropicNewEvent !== null, 'new anthropic article should create a delivery event');

    await runPollingJob({ config, logger, sourceProviders, storage });
    const anthropicAccountAfterPoll = await storage.watchAccounts.findById(anthropicAccount.id);
    const anthropicPostsAfterRepeat = await prisma.xPostRaw.count({
      where: { authorUserId: anthropicAccountAfterPoll?.xUserId ?? '' },
    });
    assert(
      anthropicPostsAfterRepeat === 1,
      `repeat anthropic poll should keep 1 post, got ${anthropicPostsAfterRepeat}`,
    );
    checks.push({ name: 'Anthropic 增量入库并投递' });

    const ai2Path = '/ai2-blog';
    const ai2Url = `${rssApi.url}${ai2Path}`;
    const createAi2Row = (date: string, slug: string, title: string, blurb: string): string =>
      `<div class="d_grid cg_8 p_10 bd-be-w_2px"><div class="as_start justify-self_start">${date}</div>` +
      `<div><a href="/blog/${slug}"><span class="label"><h2 class="mbs_0 fw_regular">${title}</h2></span></a>` +
      `<span class="textStyle_wideCardBlurb c_colorPalette.text op_0.8 lh_1">${blurb}</span></div></div>`;
    const createAi2Html = (extraArticle: boolean): string =>
      `<html><body>${createAi2Row('June 12, 2026', 'olmo-eval', 'olmo-eval: An evaluation workbench', 'olmo-eval is an open evaluation workbench.')}` +
      `${createAi2Row('May 19, 2026', 'olmoearth-v1-1', 'OlmoEarth v1.1', 'A more efficient family of models.')}` +
      `${extraArticle ? createAi2Row('September 1, 2026', 'benchmirt', 'BenchMIRT: What are LLM benchmarks measuring?', 'Benchmark analysis.') : ''}` +
      `</body></html>`;

    rssApi.setFeed(ai2Path, {
      body: createAi2Html(false),
      contentType: 'text/html; charset=utf-8',
      statusCode: 200,
    });

    const directAi2 = await ai2BlogProvider.fetchPosts({
      limit: 10,
      source: { sourceType: 'ai2_blog', sourceUrl: ai2Url },
    });
    assert(
      directAi2.posts.length === 2,
      `ai2 provider should parse 2 posts, got ${directAi2.posts.length}`,
    );
    assert(
      directAi2.posts[0]?.dedupeKey === 'ai2:blog:olmo-eval' &&
        directAi2.posts[0]?.textContent.includes('olmo-eval is an open evaluation workbench.'),
      `ai2 post mismatch: ${JSON.stringify(directAi2.posts[0]?.dedupeKey)}`,
    );
    checks.push({ name: 'AI2 博客解析（标题/日期/摘要/去重键）' });

    const createAi2Response = await app.inject({
      method: 'POST',
      payload: { sourceType: 'ai2_blog', sourceUrl: ai2Url },
      url: '/admin/api/watch-accounts',
    });
    assert(createAi2Response.statusCode === 200, `ai2 source create returned ${createAi2Response.statusCode}`);
    const ai2Account = await storage.watchAccounts.findBySource({
      sourceType: 'ai2_blog',
      sourceUrl: ai2Url,
    });
    assert(ai2Account !== null, 'ai2 watch account was not stored');

    await runPollingJob({ config, logger, sourceProviders, storage });
    const ai2BaselinePost = await storage.xPosts.findByDedupeKey('ai2:blog:olmo-eval');
    assert(ai2BaselinePost === null, 'ai2 anchor post must not be stored');
    const ai2AccountAfterFirstPoll = await storage.watchAccounts.findById(ai2Account.id);
    assert(ai2AccountAfterFirstPoll?.baselinePostId !== null, 'first ai2 poll should set a baseline');

    rssApi.setFeed(ai2Path, {
      body: createAi2Html(true),
      contentType: 'text/html; charset=utf-8',
      statusCode: 200,
    });
    await runPollingJob({ config, logger, sourceProviders, storage });
    const ai2NewPost = await storage.xPosts.findByDedupeKey('ai2:blog:benchmirt');
    assert(ai2NewPost !== null, 'new ai2 post was not stored');
    const ai2NewEvent = await storage.deliveryEvents.findByPostAndTarget(
      ai2NewPost.xPostId,
      TARGET_KEY,
    );
    assert(ai2NewEvent !== null, 'new ai2 post should create a delivery event');

    await runPollingJob({ config, logger, sourceProviders, storage });
    const ai2AccountAfterPoll = await storage.watchAccounts.findById(ai2Account.id);
    const ai2PostsAfterRepeat = await prisma.xPostRaw.count({
      where: { authorUserId: ai2AccountAfterPoll?.xUserId ?? '' },
    });
    assert(ai2PostsAfterRepeat === 1, `repeat ai2 poll should keep 1 post, got ${ai2PostsAfterRepeat}`);
    const ai2SkippedPost = await storage.xPosts.findByDedupeKey('ai2:blog:olmoearth-v1-1');
    assert(ai2SkippedPost === null, 'older ai2 post must not be ingested after the baseline');
    checks.push({ name: 'AI2 首轮仅锚定最新 1 条 + 增量入库并投递' });

    const moonshotHtml =
      '<html><body>' +
      '<div class="post-item"><h3><a class="!nx-no-underline" href="/blog/posts/k2-think">Kimi K2 Thinking 模型发布并开源</a></h3>' +
      '<time class="nx-text-sm" dateTime="2025-11-06T00:00:00.000Z">2025年11月06日</time></div>' +
      '<div class="post-item"><h3><a href="/blog/posts/k2-turbo-discount">Kimi K2 Turbo API 价格调整通知</a></h3>' +
      '<time dateTime="2025-11-05T00:00:00.000Z">2025年11月05日</time></div>' +
      '</body></html>';
    const moonshotEntries = parseMoonshotBlogHtml(moonshotHtml, '2026-01-01T00:00:00.000Z');
    assert(
      moonshotEntries.length === 2 &&
        moonshotEntries[0]?.slug === 'k2-think' &&
        moonshotEntries[0]?.publishedAt === '2025-11-06T00:00:00.000Z' &&
        moonshotEntries[0]?.title === 'Kimi K2 Thinking 模型发布并开源',
      `moonshot parse mismatch: ${JSON.stringify(moonshotEntries[0])}`,
    );
    checks.push({ name: 'Moonshot 博客解析（标题/日期）' });

    const metaEntries = normalizeMetaBlogRawEntries(
      [
        {
          dateText: 'Jul 27, 2026',
          href: 'https://ai.meta.com/blog/assistive-robotics-university-of-pittsburgh-sam-dino/',
          title: 'Reimagining Independence: How Meta AI Models Help Assistive Robotics',
        },
        {
          href: 'https://ai.meta.com/blog/assistive-robotics-university-of-pittsburgh-sam-dino/',
          title: 'Reimagining Independence',
        },
        {
          dateText: 'April 8, 2026',
          href: 'https://ai.meta.com/blog/scaling-how-we-build-test-advanced-ai/',
          title: 'Scaling How We Build and Test Our Most Advanced AI',
        },
      ],
      '2026-08-01T00:00:00.000Z',
    );
    assert(
      metaEntries.length === 2 &&
        metaEntries[0]?.slug === 'assistive-robotics-university-of-pittsburgh-sam-dino' &&
        metaEntries[0]?.title === 'Reimagining Independence: How Meta AI Models Help Assistive Robotics' &&
        Date.parse(metaEntries[0]?.publishedAt ?? '') === Date.parse('Jul 27, 2026'),
      `meta normalize mismatch: ${JSON.stringify(metaEntries[0])}`,
    );
    checks.push({ name: 'Meta AI 博客归一化（去重/日期）' });

    const xaiHtml =
      '<a class="group" href="/news/grok-bot-for-enterprise"><p>Sep 3, 2026</p><h1>Grok Bot for Enterprise</h1>' +
      '<p>Grok Bot is now available for enterprises.</p><span>Read More</span></a>' +
      '<a class="group" href="/news/grok-build-memory"><span>Product</span><span>·</span><time>Sep 16, 2026</time>' +
      '<h3>Memory in Grok Build</h3></a>';
    const xaiEntries = parseXaiNewsHtml(xaiHtml, '2026-09-17T00:00:00.000Z');
    assert(
      xaiEntries.length === 2 &&
        xaiEntries[0]?.slug === 'grok-build-memory' &&
        xaiEntries[0]?.category === 'Product' &&
        Date.parse(xaiEntries[0]?.publishedAt ?? '') === Date.parse('Sep 16, 2026') &&
        xaiEntries[1]?.slug === 'grok-bot-for-enterprise' &&
        xaiEntries[1]?.summary === 'Grok Bot is now available for enterprises.' &&
        xaiEntries[1]?.category === undefined,
      `xai parse mismatch: ${JSON.stringify(xaiEntries)}`,
    );
    checks.push({ name: 'xAI 新闻解析（精选卡+列表卡/分类/摘要）' });

    const matcherWithoutRules = createSubscriptionRuleMatcher([]);
    assert(!matcherWithoutRules.hasEnabledRules, 'empty rules should not enable filtering');

    const anyMatcher = createSubscriptionRuleMatcher([
      { enabled: true, exclude: [], id: 'r1', include: ['llama.cpp'], mode: 'any', name: 'any' },
    ]);
    assert(anyMatcher.hasEnabledRules, 'enabled rule should activate filtering');
    assert(anyMatcher.matches('About llama.cpp updates'), 'any matcher should match included term');
    assert(!anyMatcher.matches('Unrelated text'), 'any matcher should not match missing term');

    const allMatcher = createSubscriptionRuleMatcher([
      { enabled: true, exclude: [], id: 'r2', include: ['NeurIPS', 'ICML'], mode: 'all', name: 'all' },
    ]);
    assert(
      allMatcher.matches('NeurIPS and ICML papers'),
      'all matcher should match when all terms appear',
    );
    assert(!allMatcher.matches('Only NeurIPS here'), 'all matcher should require every term');

    const excludeMatcher = createSubscriptionRuleMatcher([
      {
        enabled: true,
        exclude: ['workshop'],
        id: 'r3',
        include: ['NeurIPS'],
        mode: 'any',
        name: 'exclude',
      },
    ]);
    assert(!excludeMatcher.matches('NeurIPS workshop paper'), 'exclude term should suppress delivery');

    const disabledMatcher = createSubscriptionRuleMatcher([
      { enabled: false, exclude: [], id: 'r4', include: ['llama.cpp'], mode: 'any', name: 'disabled' },
    ]);
    assert(!disabledMatcher.hasEnabledRules, 'disabled rules should be ignored');
    checks.push({ name: '订阅规则匹配（任一/全部/排除/停用）' });

    const saveRulesResponse = await app.inject({
      method: 'PUT',
      payload: {
        rules: [
          { enabled: true, exclude: [], include: ['llama.cpp'], mode: 'any', name: 'llama only' },
        ],
      },
      url: '/admin/api/subscription-rules',
    });
    assert(saveRulesResponse.statusCode === 200, `save rules returned ${saveRulesResponse.statusCode}`);

    rssApi.setFeed(trendingPath, {
      body: createTrendingHtml([
        { name: 'llama.cpp', owner: 'ggml-org', stars: '80,000', starsToday: '900' },
        { name: 'plain-repo', owner: 'acme', stars: '10', starsToday: '1' },
      ]),
      contentType: 'text/html; charset=utf-8',
      statusCode: 200,
    });
    await runPollingJob({ config, logger, sourceProviders, storage });
    const unmatchedPost = await storage.xPosts.findByDedupeKey('github:trending:acme/plain-repo');
    assert(unmatchedPost !== null, 'unmatched repo should still be stored');
    const unmatchedEvent = await storage.deliveryEvents.findByPostAndTarget(
      unmatchedPost.xPostId,
      TARGET_KEY,
    );
    assert(unmatchedEvent === null, 'unmatched post must not create a delivery event');
    checks.push({ name: '订阅规则：未命中入库但不投递' });

    rssApi.setFeed(trendingPath, {
      body: createTrendingHtml([
        { name: 'llama.cpp', owner: 'ggml-org', stars: '80,000', starsToday: '900' },
        { name: 'plain-repo', owner: 'acme', stars: '10', starsToday: '1' },
        { name: 'llama.cpp-tools', owner: 'acme', stars: '5', starsToday: '1' },
      ]),
      contentType: 'text/html; charset=utf-8',
      statusCode: 200,
    });
    await runPollingJob({ config, logger, sourceProviders, storage });
    const matchedPost = await storage.xPosts.findByDedupeKey('github:trending:acme/llama.cpp-tools');
    assert(matchedPost !== null, 'matched repo was not stored');
    const matchedEvent = await storage.deliveryEvents.findByPostAndTarget(
      matchedPost.xPostId,
      TARGET_KEY,
    );
    assert(matchedEvent !== null, 'matched post should create a delivery event');
    checks.push({ name: '订阅规则：命中才投递' });

    await app.inject({
      method: 'PUT',
      payload: { rules: [] },
      url: '/admin/api/subscription-rules',
    });
    rssApi.setFeed(trendingPath, {
      body: createTrendingHtml([
        { name: 'llama.cpp', owner: 'ggml-org', stars: '80,000', starsToday: '900' },
        { name: 'plain-repo', owner: 'acme', stars: '10', starsToday: '1' },
        { name: 'llama.cpp-tools', owner: 'acme', stars: '5', starsToday: '1' },
        { name: 'another-repo', owner: 'acme', stars: '3', starsToday: '1' },
      ]),
      contentType: 'text/html; charset=utf-8',
      statusCode: 200,
    });
    await runPollingJob({ config, logger, sourceProviders, storage });
    const noRulePost = await storage.xPosts.findByDedupeKey('github:trending:acme/another-repo');
    assert(noRulePost !== null, 'no-rule repo was not stored');
    const noRuleEvent = await storage.deliveryEvents.findByPostAndTarget(
      noRulePost.xPostId,
      TARGET_KEY,
    );
    assert(noRuleEvent !== null, 'with no enabled rules every new post should be delivered');
    checks.push({ name: '订阅规则：清空规则后恢复全量投递' });

    const channelDefinitions = [
      { channelType: 'wecom_webhook', kind: 'wecom', name: 'Mock WeCom', url: webhook.urls.wecom },
      {
        channelType: 'dingtalk_webhook',
        kind: 'dingtalk',
        name: 'Mock DingTalk',
        secret: 'SECsmokeSecret',
        url: webhook.urls.dingtalk,
      },
      { channelType: 'bark', kind: 'bark', name: 'Mock Bark', url: webhook.urls.bark },
      { channelType: 'generic_webhook', kind: 'generic', name: 'Mock Generic', url: webhook.urls.generic },
      {
        accountId: 'bot-account-1@im.bot',
        channelType: 'wechat_clawbot',
        kind: 'wechatBridge',
        name: 'Mock WeChat Bridge',
        secret: 'bridge-smoke-secret',
        target: 'user-1@im.wechat',
        url: webhook.urls.wechatBridge,
      },
    ] as const;
    const channelTargetByKind = new Map<string, { id: string; targetKey: string }>();

    for (const definition of channelDefinitions) {
      const createChannelResponse = await app.inject({
        method: 'POST',
        payload: {
          channelType: definition.channelType,
          displayName: definition.name,
          enabled: true,
          webhookUrl: definition.url,
          ...('secret' in definition ? { secret: definition.secret } : {}),
          ...('target' in definition ? { target: definition.target } : {}),
          ...('accountId' in definition ? { accountId: definition.accountId } : {}),
        },
        url: '/admin/api/settings/delivery-targets',
      });
      assert(
        createChannelResponse.statusCode === 200,
        `create channel ${definition.kind} returned ${createChannelResponse.statusCode}: ${createChannelResponse.body.slice(0, 200)}`,
      );
      const createdTarget = JSON.parse(createChannelResponse.body) as {
        data: { deliveryTarget: { channelType: string; id: string; secretConfigured: boolean; targetKey: string } };
      };
      assert(
        createdTarget.data.deliveryTarget.channelType === definition.channelType,
        `channel type mismatch for ${definition.kind}`,
      );
      if (definition.kind === 'dingtalk' || definition.kind === 'wechatBridge') {
        assert(
          createdTarget.data.deliveryTarget.secretConfigured,
          `${definition.kind} target should report secretConfigured`,
        );
      }
      channelTargetByKind.set(definition.kind, {
        id: createdTarget.data.deliveryTarget.id,
        targetKey: createdTarget.data.deliveryTarget.targetKey,
      });
    }
    checks.push({ name: '创建企业微信/钉钉/Bark/通用 Webhook 通道' });

    const invalidChannelResponse = await app.inject({
      method: 'POST',
      payload: {
        channelType: 'telegram',
        displayName: 'bad',
        enabled: true,
        webhookUrl: 'https://example.com/hook',
      },
      url: '/admin/api/settings/delivery-targets',
    });
    assert(invalidChannelResponse.statusCode === 400, 'unknown channel type should be rejected');
    const invalidBarkResponse = await app.inject({
      method: 'POST',
      payload: {
        channelType: 'bark',
        displayName: 'bad bark',
        enabled: true,
        webhookUrl: 'https://api.day.app/',
      },
      url: '/admin/api/settings/delivery-targets',
    });
    assert(invalidBarkResponse.statusCode === 400, 'bark URL without device key should be rejected');
    checks.push({ name: '渠道校验：未知类型与缺失 Bark Key 拒绝' });

    const requestsBeforeChannelTests = webhook.requests.length;

    for (const definition of channelDefinitions) {
      const target = channelTargetByKind.get(definition.kind);
      const testChannelResponse = await app.inject({
        method: 'POST',
        url: `/admin/api/settings/delivery-targets/${target?.id}/test`,
      });
      assert(
        testChannelResponse.statusCode === 200,
        `test send ${definition.kind} returned ${testChannelResponse.statusCode}: ${testChannelResponse.body.slice(0, 200)}`,
      );
    }

    assert(
      webhook.requests.length === requestsBeforeChannelTests + channelDefinitions.length,
      `mock receiver should get ${channelDefinitions.length} channel test messages, got ${webhook.requests.length - requestsBeforeChannelTests}`,
    );

    const wecomRequest = webhook.requests.find((entry) => entry.url.startsWith('/mock-wecom'));
    assert(
      wecomRequest !== undefined &&
        (wecomRequest.body as { msgtype?: string }).msgtype === 'markdown' &&
        typeof (wecomRequest.body as { markdown?: { content?: string } }).markdown?.content === 'string',
      `wecom payload mismatch: ${JSON.stringify(wecomRequest?.body)}`,
    );

    const dingtalkRequest = webhook.requests.find((entry) => entry.url.startsWith('/mock-dingtalk'));
    const dingtalkBody = dingtalkRequest?.body as {
      markdown?: { text?: string; title?: string };
      msgtype?: string;
    };
    const dingtalkQuery = new URL(`http://127.0.0.1${dingtalkRequest?.url ?? ''}`).searchParams;
    const dingtalkTimestamp = dingtalkQuery.get('timestamp') ?? '';
    const expectedDingtalkSign = createHmac('sha256', 'SECsmokeSecret')
      .update(`${dingtalkTimestamp}\nSECsmokeSecret`)
      .digest('base64');
    assert(
      dingtalkBody?.msgtype === 'markdown' &&
        typeof dingtalkBody.markdown?.text === 'string' &&
        typeof dingtalkBody.markdown?.title === 'string' &&
        dingtalkTimestamp.length > 0 &&
        dingtalkQuery.get('sign') === expectedDingtalkSign,
      `dingtalk payload/sign mismatch: ${JSON.stringify({ body: dingtalkBody, url: dingtalkRequest?.url })}`,
    );

    const barkRequest = webhook.requests.find((entry) => entry.url.startsWith('/mock-bark'));
    const barkBody = barkRequest?.body as { body?: string; title?: string; url?: string };
    assert(
      typeof barkBody?.title === 'string' && typeof barkBody.body === 'string' && typeof barkBody.url === 'string',
      `bark payload mismatch: ${JSON.stringify(barkBody)}`,
    );

    const genericRequest = webhook.requests.find((entry) => entry.url.startsWith('/mock-generic'));
    const genericBody = genericRequest?.body as {
      author?: string;
      postedAt?: string;
      text?: string;
      title?: string;
      url?: string;
    };
    assert(
      typeof genericBody?.author === 'string' &&
        typeof genericBody.postedAt === 'string' &&
        typeof genericBody.text === 'string' &&
        typeof genericBody.title === 'string' &&
        typeof genericBody.url === 'string',
      `generic payload mismatch: ${JSON.stringify(genericBody)}`,
    );
    checks.push({ name: '4 渠道测试发送：payload 正确且钉钉加签可校验' });

    const wechatBridgeRequest = webhook.requests.find((entry) =>
      entry.url.startsWith('/mock-wechat-bridge'),
    );
    const wechatBridgeBody = wechatBridgeRequest?.body as {
      accountId?: string;
      text?: string;
      title?: string;
      to?: string;
      url?: string;
    };
    assert(
      wechatBridgeRequest?.headers.authorization === 'Bearer bridge-smoke-secret' &&
        wechatBridgeBody?.accountId === 'bot-account-1@im.bot' &&
        wechatBridgeBody?.to === 'user-1@im.wechat' &&
        wechatBridgeBody?.title === undefined &&
        typeof wechatBridgeBody.text === 'string' &&
        typeof wechatBridgeBody.url === 'string',
      `wechat bridge payload mismatch: ${JSON.stringify({ body: wechatBridgeBody, headers: wechatBridgeRequest?.headers.authorization })}`,
    );
    checks.push({ name: '微信桥通道：payload 与 Bearer 鉴权正确' });

    const formatter = createV1TextMessageFormatter();
    const titledMessage = formatter.format({
      authorUsername: 'OpenAI News',
      permalinkUrl: 'https://openai.com/index/cooley-gopublic',
      postedAt: '2026-09-17T12:00:00.000Z',
      textContent:
        'How Cooley is accelerating IPO work with ChatGPT\n\nCooley built GO Public with ChatGPT Work to bring intelligence to the IPO process.',
      title: 'How Cooley is accelerating IPO work with ChatGPT',
    });
    assert(
      titledMessage.text.includes('📌 标题：How Cooley is accelerating IPO work with ChatGPT') &&
        titledMessage.text.includes(
          '📝 内容：Cooley built GO Public with ChatGPT Work to bring intelligence to the IPO process.',
        ) &&
        titledMessage.text.includes('🔗 原文链接：https://openai.com/index/cooley-gopublic') &&
        !titledMessage.text.includes('📝 内容：How Cooley') &&
        titledMessage.title.includes('How Cooley is accelerating IPO work'),
      `formatter titled output mismatch: ${titledMessage.text}`,
    );

    const untitledMessage = formatter.format({
      authorUsername: 'mock_ai',
      permalinkUrl: 'https://x.com/mock_ai/status/1000000000000000001',
      postedAt: '2026-09-17T12:00:00.000Z',
      textContent: 'hello from X',
    });
    assert(
      !untitledMessage.text.includes('📌 标题') &&
        untitledMessage.text.includes('📝 内容：hello from X') &&
        untitledMessage.text.includes('🆔 帖子 ID：1000000000000000001'),
      `formatter untitled output mismatch: ${untitledMessage.text}`,
    );
    checks.push({ name: '推送消息模板：标题/内容分行且 X 帖无标题行' });

    const barkTargetKey = channelTargetByKind.get('bark')?.targetKey ?? '';
    const routingRulesResponse = await app.inject({
      method: 'PUT',
      payload: {
        rules: [
          {
            enabled: true,
            exclude: [],
            include: ['routing-marker'],
            mode: 'any',
            name: 'routing',
            targetKeys: [barkTargetKey],
          },
        ],
      },
      url: '/admin/api/subscription-rules',
    });
    assert(routingRulesResponse.statusCode === 200, 'routing rule should be saved');

    const unknownKeyRulesResponse = await app.inject({
      method: 'PUT',
      payload: {
        rules: [
          {
            enabled: true,
            exclude: [],
            include: ['anything'],
            mode: 'any',
            name: 'bad',
            targetKeys: ['not-exist-target'],
          },
        ],
      },
      url: '/admin/api/subscription-rules',
    });
    assert(unknownKeyRulesResponse.statusCode === 400, 'rule with unknown target key should be rejected');

    rssApi.setFeed(trendingPath, {
      body: createTrendingHtml([
        { name: 'llama.cpp', owner: 'ggml-org', stars: '80,000', starsToday: '900' },
        { name: 'plain-repo', owner: 'acme', stars: '10', starsToday: '1' },
        { name: 'llama.cpp-tools', owner: 'acme', stars: '5', starsToday: '1' },
        { name: 'another-repo', owner: 'acme', stars: '3', starsToday: '1' },
        { name: 'routing-marker-repo', owner: 'acme', stars: '7', starsToday: '2' },
      ]),
      contentType: 'text/html; charset=utf-8',
      statusCode: 200,
    });
    await runPollingJob({ config, logger, sourceProviders, storage });

    const routedPost = await storage.xPosts.findByDedupeKey('github:trending:acme/routing-marker-repo');
    assert(routedPost !== null, 'routing marker repo should be stored');
    const routedBarkEvent = await storage.deliveryEvents.findByPostAndTarget(
      routedPost.xPostId,
      barkTargetKey,
    );
    assert(routedBarkEvent !== null, 'routing rule should deliver to the bark target');
    const routedFeishuEvent = await storage.deliveryEvents.findByPostAndTarget(
      routedPost.xPostId,
      TARGET_KEY,
    );
    assert(
      routedFeishuEvent === null,
      'routing rule must not deliver to channels outside its target list',
    );
    const routedGenericEvent = await storage.deliveryEvents.findByPostAndTarget(
      routedPost.xPostId,
      channelTargetByKind.get('generic')?.targetKey ?? '',
    );
    assert(routedGenericEvent === null, 'routing rule must not deliver to generic webhook');
    checks.push({ name: '分渠道规则：命中帖子只投递到指定通道' });

    const nonMatchingRepoPost = await storage.xPosts.findByDedupeKey('github:trending:acme/plain-repo');
    const nonMatchingEvent = await storage.deliveryEvents.findByPostAndTarget(
      nonMatchingRepoPost?.xPostId ?? '',
      barkTargetKey,
    );
    assert(nonMatchingEvent === null, 'non-matching post must not create events for routed channels');

    await app.inject({
      method: 'PUT',
      payload: { rules: [] },
      url: '/admin/api/subscription-rules',
    });
    checks.push({ name: '分渠道规则：未命中不投递并正确清理规则' });

    fakeWechatRunning = true;
    const wechatStatusResponse = await app.inject({ method: 'GET', url: '/admin/api/wechat/status' });
    assert(wechatStatusResponse.statusCode === 200, 'wechat status should return 200');
    const wechatTargetA = await storage.deliveryTargets.findByTargetKey('wechat:wechat-a@im.bot');
    const wechatTargetB = await storage.deliveryTargets.findByTargetKey('wechat:wechat-b@im.bot');
    assert(
      wechatTargetA !== null &&
        wechatTargetA.enabled &&
        wechatTargetA.config.accountId === 'wechat-a@im.bot' &&
        wechatTargetA.config.target === 'user-a@im.wechat' &&
        wechatTargetB !== null &&
        wechatTargetB.enabled,
      `wechat auto targets mismatch: ${JSON.stringify({ a: wechatTargetA?.config, b: wechatTargetB?.config })}`,
    );
    checks.push({ name: '绑定微信号后自动创建投递通道（默认开启）' });

    await app.inject({
      method: 'PATCH',
      payload: { enabled: false },
      url: `/admin/api/settings/delivery-targets/${wechatTargetB?.id}/enabled`,
    });
    await app.inject({ method: 'GET', url: '/admin/api/wechat/status' });
    const wechatTargetBAfterToggle = await storage.deliveryTargets.findByTargetKey(
      'wechat:wechat-b@im.bot',
    );
    assert(
      wechatTargetBAfterToggle !== null && !wechatTargetBAfterToggle.enabled,
      'sync must preserve per-account disabled state',
    );
    checks.push({ name: '单账号可关闭推送且同步不会覆盖' });

    const deleteWechatResponse = await app.inject({ method: 'DELETE', url: '/admin/api/wechat/accounts/wechat-b@im.bot' });
    assert(deleteWechatResponse.statusCode === 200, `wechat delete failed: ${deleteWechatResponse.body}`);
    const wechatTargetBAfterDelete = await storage.deliveryTargets.findByTargetKey(
      'wechat:wechat-b@im.bot',
    );
    const wechatTargetAAfterDelete = await storage.deliveryTargets.findByTargetKey(
      'wechat:wechat-a@im.bot',
    );
    assert(
      wechatTargetBAfterDelete === null && wechatTargetAAfterDelete !== null,
      'removing a wechat account without delivery history should remove its channel only',
    );
    checks.push({ name: '无发送历史的微信号：删除时移除通道且不影响其他微信' });

    // Deleting a channel physically removes its row; delivery history stays in delivery_events keyed by targetKey.
    fakeWechatAccounts.push({
      accountId: 'wechat-b@im.bot',
      baseUrl: 'https://ilinkai.weixin.qq.com',
      hasContextToken: false,
      tokenMasked: 'cccc***dddd',
      userId: 'user-b@im.wechat',
    });
    const restoredWechatResponse = await app.inject({ method: 'GET', url: '/admin/api/wechat/status' });
    assert(restoredWechatResponse.statusCode === 200, `wechat restore failed: ${restoredWechatResponse.body}`);
    const historyWechatTarget = await storage.deliveryTargets.findByTargetKey('wechat:wechat-b@im.bot');
    assert(historyWechatTarget !== null, 'rebound wechat target should exist');
    const sentWechatEvent = await storage.deliveryEvents.create({
      status: 'sent', sentAt: new Date().toISOString(), attemptCount: 1,
      targetKey: historyWechatTarget.targetKey, xPostId: routedPost.xPostId,
    });
    assert(nonMatchingRepoPost !== null, 'wechat pending fixture requires a stored post');
    const pendingWechatEvent = await storage.deliveryEvents.create({
      status: 'pending', targetKey: historyWechatTarget.targetKey, xPostId: nonMatchingRepoPost.xPostId,
    });
    const deleteWithHistoryResponse = await app.inject({ method: 'DELETE', url: '/admin/api/wechat/accounts/wechat-b@im.bot' });
    assert(deleteWithHistoryResponse.statusCode === 200, `wechat delete with history failed: ${deleteWithHistoryResponse.body}`);
    assert(await storage.deliveryTargets.findById(historyWechatTarget.id) === null, 'history-bearing wechat channel must be physically removed');
    assert((await storage.deliveryEvents.findById(sentWechatEvent.id))?.status === 'sent', 'deleting a binding must preserve sent history');
    assert((await storage.deliveryEvents.findById(pendingWechatEvent.id))?.status === 'dead', 'deleting a binding must stop its pending deliveries');
    assert((await storage.deliveryTargets.findById(wechatTargetA.id))?.enabled === true, 'deleting one binding must leave other bindings enabled');
    checks.push({ name: '有发送历史的微信号：物理删除通道、终止待发送任务、保留历史' });

    if (wechatTargetAAfterDelete !== null) {
      await storage.deliveryTargets.delete(wechatTargetAAfterDelete.id);
    }
    fakeWechatAccounts.push({
      accountId: 'wechat-b@im.bot',
      baseUrl: 'https://ilinkai.weixin.qq.com',
      tokenMasked: 'cccc***dddd',
      userId: 'user-b@im.wechat',
    });
    const rebindWithHistoryResponse = await app.inject({ method: 'GET', url: '/admin/api/wechat/status' });
    assert(rebindWithHistoryResponse.statusCode === 200, `wechat rebind with history failed: ${rebindWithHistoryResponse.body}`);
    const reboundWechatTarget = await storage.deliveryTargets.findByTargetKey(historyWechatTarget.targetKey);
    assert(
      reboundWechatTarget !== null &&
        reboundWechatTarget.id !== historyWechatTarget.id &&
        reboundWechatTarget.enabled &&
        reboundWechatTarget.webhookUrl !== '',
      'rebinding a deleted channel must create a fresh enabled row for the same targetKey',
    );
    assert((await storage.deliveryEvents.findById(sentWechatEvent.id))?.status === 'sent' && (await storage.deliveryEvents.findById(pendingWechatEvent.id))?.status === 'dead', 'rebinding must not replay historical or cancelled deliveries');
    checks.push({ name: '重新绑定已删除的微信通道：按原 key 新建通道且不重发旧任务' });

    const feedXmlResponse = await app.inject({ method: 'GET', url: '/feed.xml' });
    assert(feedXmlResponse.statusCode === 200, `feed.xml returned ${feedXmlResponse.statusCode}`);
    assert(
      String(feedXmlResponse.headers['content-type'] ?? '').includes('rss+xml'),
      `feed.xml content-type mismatch: ${feedXmlResponse.headers['content-type']}`,
    );
    assert(
      feedXmlResponse.body.includes('<rss') && feedXmlResponse.body.includes('<item>'),
      'feed.xml should contain items',
    );
    checks.push({ name: 'RSS feed 输出（/feed.xml）' });

    const feedJsonResponse = await app.inject({ method: 'GET', url: '/feed.json?limit=5' });
    assert(feedJsonResponse.statusCode === 200, `feed.json returned ${feedJsonResponse.statusCode}`);
    const feedJson = JSON.parse(feedJsonResponse.body) as { items?: unknown[]; version?: string };
    assert(
      feedJson.version === 'https://jsonfeed.org/version/1.1',
      `feed.json version mismatch: ${feedJson.version}`,
    );
    assert(
      (feedJson.items?.length ?? 0) === 5,
      `feed.json should honour limit=5, got ${feedJson.items?.length}`,
    );
    checks.push({ name: 'JSON feed 输出（/feed.json + limit）' });

    await app.inject({
      method: 'PUT',
      payload: {
        rules: [
          { enabled: true, exclude: [], include: ['llama.cpp'], mode: 'any', name: 'feed filter' },
        ],
      },
      url: '/admin/api/subscription-rules',
    });
    const matchedFeedResponse = await app.inject({ method: 'GET', url: '/feed.json?matched=1' });
    const matchedFeed = JSON.parse(matchedFeedResponse.body) as {
      items?: Array<{ content_text?: string }>;
    };
    assert((matchedFeed.items?.length ?? 0) >= 1, 'matched feed should return matching posts');
    assert(
      matchedFeed.items?.every((item) => (item.content_text ?? '').includes('llama.cpp')) ?? false,
      'matched feed should only contain posts matching the enabled rule',
    );
    await app.inject({ method: 'PUT', payload: { rules: [] }, url: '/admin/api/subscription-rules' });
    checks.push({ name: '订阅规则过滤 feed（?matched=1）' });

    const scheduler = createRuntimeScheduler({
      config,
      logger,
      sourceProviders,
      storage,
    });
    const enabledAccounts = await storage.watchAccounts.listEnabled();

    for (const account of enabledAccounts) {
      await storage.watchAccounts.update(account.id, { enabled: false });
    }

    const pollRunsBeforeSkip = await prisma.pollRun.count();
    const skippedResult = await scheduler.runPollingNow({ trigger: 'smoke-skip' });
    const pollRunsAfterSkip = await prisma.pollRun.count();
    assert(
      skippedResult.status === 'skipped',
      `polling without enabled sources should be skipped, got ${skippedResult.status}`,
    );
    assert(
      pollRunsAfterSkip === pollRunsBeforeSkip,
      'skipped polling must not create a poll run record',
    );

    for (const account of enabledAccounts) {
      await storage.watchAccounts.update(account.id, { enabled: true });
    }
    checks.push({ name: '无启用监听源时跳过轮询且不产生记录' });

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

    const exportCsvResponse = await app.inject({
      method: 'GET',
      url: '/admin/api/posts/export?format=csv',
    });
    assert(exportCsvResponse.statusCode === 200, `csv export returned ${exportCsvResponse.statusCode}`);
    assert(
      exportCsvResponse.headers['content-type']?.includes('text/csv') === true,
      `csv export content-type mismatch: ${exportCsvResponse.headers['content-type']}`,
    );
    assert(
      exportCsvResponse.body.startsWith('\ufeffxPostId,authorUsername,postedAt'),
      'csv export should start with UTF-8 BOM and header row',
    );
    const csvLines = exportCsvResponse.body.trim().split('\r\n');
    assert(csvLines.length >= 2, `csv export should contain data rows, got ${csvLines.length}`);
    assert(
      exportCsvResponse.headers['content-disposition']?.includes('posts-') === true,
      'csv export should set a download file name',
    );

    const exportJsonResponse = await app.inject({
      method: 'GET',
      url: `/admin/api/posts/export?format=json&authorUsername=${encodeURIComponent(WATCH_USERNAME)}`,
    });
    assert(exportJsonResponse.statusCode === 200, `json export returned ${exportJsonResponse.statusCode}`);
    const exportedPosts = JSON.parse(exportJsonResponse.body) as Array<{ authorUsername: string }>;
    assert(
      exportedPosts.length > 0 &&
        exportedPosts.every((post) => post.authorUsername === WATCH_USERNAME),
      `json export filter mismatch: ${exportedPosts.map((post) => post.authorUsername).join(',')}`,
    );

    const wildcardExportResponse = await app.inject({
      method: 'GET',
      url: '/admin/api/posts/export?format=json&authorUsername=%25',
    });
    const wildcardExportBody = JSON.parse(wildcardExportResponse.body) as unknown[];
    assert(
      wildcardExportBody.length === 0,
      `author filter should treat % literally, got ${wildcardExportBody.length} posts`,
    );

    const accountSearchResponse = await app.inject({
      method: 'GET',
      url: '/admin/api/watch-accounts?page=1&pageSize=50&query=%25',
    });
    const accountSearchBody = JSON.parse(accountSearchResponse.body) as {
      data: { pagination: { total: number } };
    };
    assert(
      accountSearchBody.data.pagination.total === 0,
      `watch account search should treat % literally, got ${accountSearchBody.data.pagination.total}`,
    );
    checks.push({ name: '帖子导出 CSV/JSON（BOM、表头、筛选、通配符转义）' });

    const dataSettingsBefore = await app.inject({ method: 'GET', url: '/admin/api/settings/data' });
    const dataSettingsBeforeBody = JSON.parse(dataSettingsBefore.body) as {
      data: { expiredPosts: number; retentionDays: number };
    };
    assert(
      dataSettingsBeforeBody.data.retentionDays === 0 && dataSettingsBeforeBody.data.expiredPosts === 0,
      `default retention should be disabled: ${JSON.stringify(dataSettingsBeforeBody.data)}`,
    );

    const saveRetentionResponse = await app.inject({
      method: 'PUT',
      payload: { retentionDays: 30 },
      url: '/admin/api/settings/data',
    });
    const saveRetentionBody = JSON.parse(saveRetentionResponse.body) as {
      data: { expiredEvents: number; expiredPosts: number; retentionDays: number };
    };
    assert(
      saveRetentionBody.data.retentionDays === 30 && saveRetentionBody.data.expiredPosts > 0,
      `retention preview mismatch: ${JSON.stringify(saveRetentionBody.data)}`,
    );

    const cleanupResponse = await app.inject({
      method: 'POST',
      url: '/admin/api/actions/cleanup-now',
    });
    const cleanupBody = JSON.parse(cleanupResponse.body) as {
      data: {
        deletedEvents: number;
        deletedPosts: number;
        settings: { expiredPosts: number; lastCleanupAt: string | null };
      };
    };
    assert(
      cleanupBody.data.deletedPosts > 0 &&
        cleanupBody.data.settings.expiredPosts === 0 &&
        cleanupBody.data.settings.lastCleanupAt !== null,
      `cleanup mismatch: ${JSON.stringify(cleanupBody.data)}`,
    );
    const recentPostAfterCleanup = await storage.xPosts.findByDedupeKey('anthropic:news:article-three');
    assert(recentPostAfterCleanup !== null, 'recent posts should survive retention cleanup');
    checks.push({ name: '数据保留策略（预览计数、立即清理、保留最近帖子）' });

    const backupResponse = await app.inject({ method: 'POST', url: '/admin/api/actions/backup' });
    assert(backupResponse.statusCode === 200, `backup returned ${backupResponse.statusCode}`);
    const backupBody = JSON.parse(backupResponse.body) as {
      data: { backup: { name: string; sizeBytes: number }; backups: unknown[] };
    };
    assert(
      /^backup-\d{8}-\d{6}\.sqlite$/u.test(backupBody.data.backup.name) &&
        backupBody.data.backup.sizeBytes > 0 &&
        backupBody.data.backups.length === 1,
      `backup payload mismatch: ${JSON.stringify(backupBody.data.backup)}`,
    );

    const backupListResponse = await app.inject({ method: 'GET', url: '/admin/api/backups' });
    const backupListBody = JSON.parse(backupListResponse.body) as { data: { backups: unknown[] } };
    assert(backupListBody.data.backups.length === 1, 'backup list should contain one entry');

    const downloadResponse = await app.inject({
      method: 'GET',
      url: `/admin/api/backups/${backupBody.data.backup.name}/download`,
    });
    assert(downloadResponse.statusCode === 200, `backup download returned ${downloadResponse.statusCode}`);
    assert(
      downloadResponse.rawPayload.subarray(0, 15).toString('utf8') === 'SQLite format 3',
      'downloaded backup should be a SQLite database',
    );

    const deleteBackupResponse = await app.inject({
      method: 'DELETE',
      url: `/admin/api/backups/${backupBody.data.backup.name}`,
    });
    const deleteBackupBody = JSON.parse(deleteBackupResponse.body) as { data: { deleted: boolean } };
    assert(deleteBackupBody.data.deleted, 'backup delete should report deleted=true');
    const backupListAfterDelete = await app.inject({ method: 'GET', url: '/admin/api/backups' });
    const backupListAfterDeleteBody = JSON.parse(backupListAfterDelete.body) as {
      data: { backups: unknown[] };
    };
    assert(backupListAfterDeleteBody.data.backups.length === 0, 'backup list should be empty after delete');
    checks.push({ name: '数据库备份（创建、列表、下载、删除）' });

    const logProbe = createLogger({ bindings: { module: 'smoke-probe' }, level: 'info' });
    logProbe.info({ probe: true }, 'smoke log probe');
    logProbe.error({ probe: true }, 'smoke error probe');

    const logsResponse = await app.inject({ method: 'GET', url: '/admin/api/logs?limit=50' });
    assert(logsResponse.statusCode === 200, `logs returned ${logsResponse.statusCode}: ${logsResponse.body.slice(0, 200)}`);
    const logsBody = JSON.parse(logsResponse.body) as {
      data: { capacity: number; entries: Array<{ level: string; time: string }>; size: number };
    };
    assert(
      logsBody.data.capacity === 500 &&
        logsBody.data.size >= 2 &&
        logsBody.data.entries.length >= 2 &&
        logsBody.data.entries.every((entry) => typeof entry.time === 'string'),
      `logs payload mismatch: size=${logsBody.data.size}`,
    );

    const errorLogsResponse = await app.inject({ method: 'GET', url: '/admin/api/logs?level=error' });
    const errorLogsBody = JSON.parse(errorLogsResponse.body) as {
      data: { entries: Array<{ level: string }> };
    };
    assert(
      errorLogsBody.data.entries.length >= 1 &&
        errorLogsBody.data.entries.every((entry) => ['error', 'fatal'].includes(entry.level)),
      'error level filter should only return error/fatal entries',
    );
    checks.push({ name: '运行日志接口（环形缓冲、级别过滤）' });

    const anthropicAuthorId = anthropicAccountAfterPoll?.xUserId ?? '';
    const postsBeforeCascade = await prisma.xPostRaw.count();
    const eventsBeforeCascade = await prisma.deliveryEvent.count();
    const anthropicPostsBeforeCascade = await prisma.xPostRaw.count({
      where: { authorUserId: anthropicAuthorId },
    });
    assert(anthropicPostsBeforeCascade === 1, 'anthropic posts should exist before cascade delete');

    const deleteAccountResponse = await app.inject({
      method: 'DELETE',
      url: `/admin/api/watch-accounts/${anthropicAccount.id}`,
    });
    const deleteAccountBody = JSON.parse(deleteAccountResponse.body) as {
      data: { deleted: boolean; deletedEvents: number; deletedPosts: number };
    };
    assert(
      deleteAccountResponse.statusCode === 200 &&
        deleteAccountBody.data.deleted === true &&
        deleteAccountBody.data.deletedPosts === anthropicPostsBeforeCascade &&
        deleteAccountBody.data.deletedEvents > 0,
      `cascade delete payload mismatch: ${JSON.stringify(deleteAccountBody.data)}`,
    );

    const anthropicPostsAfterCascade = await prisma.xPostRaw.count({
      where: { authorUserId: anthropicAuthorId },
    });
    assert(anthropicPostsAfterCascade === 0, 'source posts should be removed with the account');
    const postsAfterCascade = await prisma.xPostRaw.count();
    const eventsAfterCascade = await prisma.deliveryEvent.count();
    assert(
      postsAfterCascade === postsBeforeCascade - anthropicPostsBeforeCascade &&
        eventsAfterCascade === eventsBeforeCascade - deleteAccountBody.data.deletedEvents,
      `cascade delete should not touch other sources: posts ${postsAfterCascade}/${postsBeforeCascade}, events ${eventsAfterCascade}/${eventsBeforeCascade}`,
    );
    const deletedAccount = await storage.watchAccounts.findById(anthropicAccount.id);
    assert(deletedAccount === null, 'watch account should be deleted after cascade');
    checks.push({ name: '删除监听源级联删除其消息与投递记录（其他源不受影响）' });

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

    const clearResponse = await app.inject({
      method: 'POST',
      url: '/admin/api/posts/clear-all',
    });
    assert(clearResponse.statusCode === 200, `clear posts returned ${clearResponse.statusCode}`);
    const postsAfterClear = await prisma.xPostRaw.count();
    const eventsAfterClear = await prisma.deliveryEvent.count();
    assert(postsAfterClear === 0, `posts should be cleared, got ${postsAfterClear}`);
    assert(eventsAfterClear === 0, `delivery events should be cleared, got ${eventsAfterClear}`);
    const githubAccountAfterClear = await storage.watchAccounts.findById(githubAccount.id);
    assert(
      githubAccountAfterClear?.baselinePostId === null &&
        githubAccountAfterClear?.lastSeenPostId === null,
      'board source cursors should be reset after clearing posts',
    );
    checks.push({ name: '一键清空消息（帖子 + 投递事件 + 榜单游标重置）' });

    const unauthorizedResponse = await rawInject({ method: 'GET', url: '/admin/api/summary' });
    assert(
      unauthorizedResponse.statusCode === 401,
      `unauthenticated admin api should return 401, got ${unauthorizedResponse.statusCode}`,
    );
    const unauthorizedMeResponse = await rawInject({ method: 'GET', url: '/auth/me' });
    assert(unauthorizedMeResponse.statusCode === 401, '/auth/me should require a session');
    checks.push({ name: '未登录访问管理 API 与 /auth/me 返回 401' });

    const meResponse = await app.inject({ method: 'GET', url: '/auth/me' });
    const mePayload = meResponse.json() as { data: { user: { id: string; role: string; username: string } } };
    assert(
      meResponse.statusCode === 200 &&
        mePayload.data.user.username === SMOKE_ADMIN_USERNAME &&
        mePayload.data.user.role === 'admin',
      'admin session should resolve to the seeded admin',
    );
    checks.push({ name: '管理员会话可用（/auth/me）' });

    const badLoginResponse = await rawInject({
      method: 'POST',
      payload: { password: 'wrong-password', username: SMOKE_ADMIN_USERNAME },
      url: '/auth/login',
    });
    assert(badLoginResponse.statusCode === 401, 'wrong password should return 401');
    checks.push({ name: '错误密码登录返回 401' });

    const createUserResponse = await app.inject({
      method: 'POST',
      payload: { password: 'smoke-user-pass', role: 'user', username: 'smoke-user' },
      url: '/admin/api/users',
    });
    assert(createUserResponse.statusCode === 200, `create user returned ${createUserResponse.statusCode}`);
    const createdUser = (createUserResponse.json() as { data: { user: { id: string } } }).data.user;

    const duplicateUserResponse = await app.inject({
      method: 'POST',
      payload: { password: 'smoke-user-pass', role: 'user', username: 'smoke-user' },
      url: '/admin/api/users',
    });
    assert(duplicateUserResponse.statusCode === 400, 'duplicate username should be rejected');
    checks.push({ name: '管理员创建普通用户且拒绝重复用户名' });

    const userLoginResponse = await rawInject({
      method: 'POST',
      payload: { password: 'smoke-user-pass', username: 'smoke-user' },
      url: '/auth/login',
    });
    assert(userLoginResponse.statusCode === 200, 'regular user should be able to log in');
    const userCookie = readSessionCookie(userLoginResponse.headers['set-cookie']);
    checks.push({ name: '普通用户可以登录' });

    const providersDefault = await rawInject({ method: 'GET', url: '/auth/providers' });
    const providersDefaultPayload = providersDefault.json() as {
      ok: boolean;
      data: { dingtalk: { enabled: boolean } };
    };
    assert(
      providersDefault.statusCode === 200 &&
        providersDefaultPayload.ok === true &&
        providersDefaultPayload.data.dingtalk.enabled === false,
      'providers should be public and report dingtalk disabled by default',
    );
    checks.push({ name: '公开 providers 接口默认显示钉钉登录未启用' });

    const dingtalkStartDisabled = await rawInject({ method: 'GET', url: '/auth/dingtalk/start' });
    assert(
      dingtalkStartDisabled.statusCode === 302 &&
        String(dingtalkStartDisabled.headers.location ?? '').includes('/login?error=dingtalk_disabled'),
      'dingtalk start should redirect to login error when disabled',
    );
    checks.push({ name: '未启用时钉钉登录入口拒绝并提示' });

    const dingtalkPutResponse = await app.inject({
      method: 'PUT',
      payload: {
        appKey: 'ding-smoke-key',
        appSecret: 'ding-smoke-secret-987654321',
        corpId: 'ding-smoke-corp',
        enabled: true,
      },
      url: '/admin/api/settings/dingtalk',
    });
    assert(dingtalkPutResponse.statusCode === 200, 'dingtalk settings PUT should succeed');
    const dingtalkSaved = (
      dingtalkPutResponse.json() as {
        data: {
          appSecretConfigured: boolean;
          appSecretPreview: string | null;
          corpId: string;
          enabled: boolean;
        };
      }
    ).data;
    assert(
      dingtalkSaved.appSecretConfigured === true &&
        dingtalkSaved.appSecretPreview !== null &&
        dingtalkSaved.appSecretPreview.startsWith('***') &&
        !dingtalkSaved.appSecretPreview.includes('987654321') &&
        dingtalkSaved.corpId === 'ding-smoke-corp',
      'dingtalk secret must be masked and corpId must round-trip',
    );
    const dingtalkProviders = await rawInject({ method: 'GET', url: '/auth/providers' });
    assert(
      (dingtalkProviders.json() as { data: { dingtalk: { enabled: boolean } } }).data.dingtalk.enabled,
      'providers should report dingtalk enabled after saving',
    );
    checks.push({ name: '钉钉登录配置保存且 AppSecret 脱敏、providers 同步启用' });

    const dingtalkStartAuthorized = await rawInject({ method: 'GET', url: '/auth/dingtalk/start' });
    const dingtalkAuthorizeLocation = String(dingtalkStartAuthorized.headers.location ?? '');
    assert(
      dingtalkStartAuthorized.statusCode === 302 &&
        dingtalkAuthorizeLocation.startsWith('https://login.dingtalk.com/oauth2/auth') &&
        dingtalkAuthorizeLocation.includes('exclusiveLogin=true') &&
        dingtalkAuthorizeLocation.includes('exclusiveCorpId=ding-smoke-corp'),
      'dingtalk start should carry exclusive login params when corpId configured',
    );
    checks.push({ name: '配置 CorpId 后授权链接携带专属登录参数' });

    const dingtalkGetResponse = await app.inject({ method: 'GET', url: '/admin/api/settings/dingtalk' });
    assert(dingtalkGetResponse.statusCode === 200, 'dingtalk settings GET should succeed');
    checks.push({ name: '管理员可读取钉钉登录配置' });

    const forbiddenAdminResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'GET',
      url: '/admin/api/summary',
    });
    assert(
      forbiddenAdminResponse.statusCode === 403,
      `regular user should get 403 on admin api, got ${forbiddenAdminResponse.statusCode}`,
    );
    checks.push({ name: '普通用户访问管理 API 返回 403' });

    const userBindStartResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'POST',
      url: '/user/api/wechat/bind',
    });
    assert(userBindStartResponse.statusCode === 200, 'user should be able to start wechat binding');
    fakeWechatLoginState = { loggedIn: true, status: 'connected', accountId: 'wechat-a@im.bot' };
    const userBindingResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'GET',
      url: '/user/api/wechat',
    });
    assert(userBindingResponse.statusCode === 200, 'user wechat binding should return 200');
    const userBinding = userBindingResponse.json() as {
      data: { accounts: Array<{ accountId: string }> };
    };
    assert(
      userBinding.data.accounts.length >= 1,
      `binding accounts should include the claimed account, got ${JSON.stringify(userBinding.data.accounts)}`,
    );
    const boundAccountId = userBinding.data.accounts[0]?.accountId ?? '';
    const claimedTargets = await storage.deliveryTargets.listAll();
    assert(
      claimedTargets.some(
        (target) => target.config.accountId === boundAccountId && target.ownerUserId === createdUser.id,
      ),
      'bound wechat account should be owned by the binding user',
    );
    checks.push({ name: '普通用户绑定微信并写入归属' });

    const otherUserResponse = await app.inject({
      method: 'POST',
      payload: { password: 'smoke-user-2-pass', role: 'user', username: 'smoke-user-2' },
      url: '/admin/api/users',
    });
    assert(otherUserResponse.statusCode === 200, 'second user should be created');
    const otherUser = (otherUserResponse.json() as { data: { user: { id: string } } }).data.user;
    const otherLoginResponse = await rawInject({
      method: 'POST',
      payload: { password: 'smoke-user-2-pass', username: 'smoke-user-2' },
      url: '/auth/login',
    });
    const otherCookie = readSessionCookie(otherLoginResponse.headers['set-cookie']);
    const otherBindingResponse = await rawInject({
      headers: { cookie: otherCookie },
      method: 'GET',
      url: '/user/api/wechat',
    });
    const otherBinding = otherBindingResponse.json() as { data: { accounts: unknown[] } };
    assert(
      otherBinding.data.accounts.length === 0,
      'other users must not see bindings they do not own',
    );

    const overreachUnbindResponse = await rawInject({
      headers: { cookie: otherCookie },
      method: 'DELETE',
      url: `/user/api/wechat/accounts/${encodeURIComponent(boundAccountId)}`,
    });
    assert(
      overreachUnbindResponse.statusCode === 404,
      `unbinding another user's account should return 404, got ${overreachUnbindResponse.statusCode}`,
    );
    checks.push({ name: '用户只能看到并解绑自己的微信绑定' });

    const wechatTargetKey = `wechat:${boundAccountId}`;
    const setSourcesResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'PUT',
      payload: { sourceIds: [seededAccount.id] },
      url: `/user/api/wechat/accounts/${encodeURIComponent(boundAccountId)}/sources`,
    });
    assert(
      setSourcesResponse.statusCode === 200,
      `setting wechat sources returned ${setSourcesResponse.statusCode}`,
    );
    const bindingAfterFilter = (
      await rawInject({ headers: { cookie: userCookie }, method: 'GET', url: '/user/api/wechat' })
    ).json() as {
      data: {
        accounts: Array<{
          accountId: string;
          sendLimit: number;
          sessionActive: boolean;
          sourceIds: string[];
        }>;
        sources: Array<{ id: string }>;
      };
    };
    assert(
      bindingAfterFilter.data.accounts.some(
        (account) =>
          account.accountId === boundAccountId &&
          account.sourceIds.includes(seededAccount.id) &&
          account.sessionActive === true &&
          account.sendLimit === 10,
      ),
      `binding API should report sessionActive, got ${JSON.stringify(bindingAfterFilter.data.accounts)}`,
    );
    assert(
      bindingAfterFilter.data.sources.some((source) => source.id === seededAccount.id),
      'binding API should expose available sources',
    );
    const overreachSourcesResponse = await rawInject({
      headers: { cookie: otherCookie },
      method: 'PUT',
      payload: { sourceIds: [] },
      url: `/user/api/wechat/accounts/${encodeURIComponent(boundAccountId)}/sources`,
    });
    assert(
      overreachSourcesResponse.statusCode === 404,
      `other user setting sources should return 404, got ${overreachSourcesResponse.statusCode}`,
    );
    checks.push({ name: '绑定端保存接收源并拒绝越权修改' });

    await prisma.xPostRaw.create({
      data: {
        authorUserId: 'user-posts-probe',
        authorUsername: 'posts-probe',
        createdAt: new Date().toISOString(),
        detectedAt: new Date().toISOString(),
        id: 'posts-probe-1',
        isReply: false,
        isRepost: false,
        permalinkUrl: 'https://example.com/posts-probe-1',
        postedAt: new Date().toISOString(),
        rawPayloadJson: '{}',
        textContent: '用户端消息列表探针',
        title: '探针标题',
        xPostId: '9000000000000000001',
      },
    });
    const userPostsResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'GET',
      url: '/user/api/posts?page=1&pageSize=5',
    });
    assert(
      userPostsResponse.statusCode === 200,
      `user posts returned ${userPostsResponse.statusCode}`,
    );
    const userPosts = userPostsResponse.json() as {
      data: {
        pagination: { total: number };
        posts: Array<{ permalinkUrl: string; textContent: string; title: string | null }>;
      };
    };
    assert(
      userPosts.data.pagination.total >= 1 &&
        userPosts.data.posts.some((post) => post.textContent === '用户端消息列表探针'),
      `user posts should return stored posts, got ${JSON.stringify(userPosts.data)}`,
    );
    const unauthorizedPostsResponse = await rawInject({ method: 'GET', url: '/user/api/posts' });
    assert(
      unauthorizedPostsResponse.statusCode === 401,
      'user posts should require a session',
    );
    checks.push({ name: '用户端可浏览消息列表（/user/api/posts，含鉴权）' });

    const searchResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'GET',
      url: '/user/api/posts?page=1&pageSize=5&query=%E6%8E%A2%E9%92%88',
    });
    const searchBody = searchResponse.json() as {
      data: { pagination: { total: number }; posts: Array<{ title: string | null }> };
    };
    assert(
      searchResponse.statusCode === 200 &&
        searchBody.data.pagination.total === 1 &&
        searchBody.data.posts[0]?.title === '探针标题',
      `search should match title, got ${JSON.stringify(searchBody.data)}`,
    );
    const missResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'GET',
      url: '/user/api/posts?page=1&pageSize=5&query=zzz-not-exist',
    });
    const missBody = missResponse.json() as { data: { pagination: { total: number } } };
    assert(missBody.data.pagination.total === 0, 'search should return empty for no match');
    checks.push({ name: '用户端消息搜索（标题/正文，空结果）' });

    const { watchAccount: arxivCategoryAccount } = await storage.watchAccounts.createIfAbsentBySource({
      enabled: false,
      sourceType: 'rss',
      sourceUrl: 'https://export.arxiv.org/rss/cs.AI',
    });
    const { watchAccount: hnCategoryAccount } = await storage.watchAccounts.createIfAbsentBySource({
      enabled: false,
      sourceType: 'rss',
      sourceUrl: 'https://hnrss.org/frontpage',
    });
    const { watchAccount: youtubeCategoryAccount } = await storage.watchAccounts.createIfAbsentBySource({
      enabled: false,
      sourceType: 'rss',
      sourceUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsmokeCategory',
    });
    await storage.watchAccounts.update(arxivCategoryAccount.id, { xUserId: 'category-arxiv-uid' });
    await storage.watchAccounts.update(hnCategoryAccount.id, { xUserId: 'category-hn-uid' });
    await storage.watchAccounts.update(youtubeCategoryAccount.id, {
      xUserId: 'category-youtube-uid',
    });
    const categorySeedAccount = await storage.watchAccounts.findByUsername(WATCH_USERNAME);
    assert(categorySeedAccount !== null, 'category probe needs the seeded X account');
    await prisma.xPostRaw.create({
      data: {
        authorUserId: categorySeedAccount.xUserId ?? WATCH_USER_ID,
        authorUsername: WATCH_USERNAME,
        createdAt: new Date().toISOString(),
        detectedAt: new Date().toISOString(),
        id: 'category-probe-x',
        isReply: false,
        isRepost: false,
        permalinkUrl: 'https://example.com/category-probe-x',
        postedAt: new Date().toISOString(),
        rawPayloadJson: '{}',
        textContent: '分类筛选探针：X 源',
        title: '分类探针 X',
        xPostId: '9000000000000000041',
      },
    });
    await prisma.xPostRaw.create({
      data: {
        authorUserId: 'category-arxiv-uid',
        authorUsername: 'arxiv-cs-ai',
        createdAt: new Date().toISOString(),
        detectedAt: new Date().toISOString(),
        id: 'category-probe-arxiv',
        isReply: false,
        isRepost: false,
        permalinkUrl: 'https://example.com/category-probe-arxiv',
        postedAt: new Date().toISOString(),
        rawPayloadJson: '{}',
        textContent: '分类筛选探针：arXiv 论文源',
        title: '分类探针 arXiv',
        xPostId: '9000000000000000042',
      },
    });
    await prisma.xPostRaw.create({
      data: {
        authorUserId: 'category-hn-uid',
        authorUsername: 'hacker-news',
        createdAt: new Date().toISOString(),
        detectedAt: new Date().toISOString(),
        id: 'category-probe-hn',
        isReply: false,
        isRepost: false,
        permalinkUrl: 'https://example.com/category-probe-hn',
        postedAt: new Date().toISOString(),
        rawPayloadJson: '{}',
        textContent: '分类筛选探针：Hacker News 社区源',
        title: '分类探针 HN',
        xPostId: '9000000000000000043',
      },
    });
    await prisma.xPostRaw.create({
      data: {
        authorUserId: 'category-youtube-uid',
        authorUsername: 'youtube-channel',
        createdAt: new Date().toISOString(),
        detectedAt: new Date().toISOString(),
        id: 'category-probe-youtube',
        isReply: false,
        isRepost: false,
        permalinkUrl: 'https://example.com/category-probe-youtube',
        postedAt: new Date().toISOString(),
        rawPayloadJson: '{}',
        textContent: '分类筛选探针：YouTube 频道源',
        title: '分类探针 YouTube',
        xPostId: '9000000000000000044',
      },
    });
    const categoryListResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'GET',
      url: '/user/api/posts?page=1&pageSize=50',
    });
    assert(
      categoryListResponse.statusCode === 200,
      `category list returned ${categoryListResponse.statusCode}`,
    );
    const categoryListBody = categoryListResponse.json() as {
      data: {
        pagination: { total: number };
        posts: Array<{ id: string; platformCategory: string }>;
      };
    };
    const platformCategoryById = new Map(
      categoryListBody.data.posts.map((post) => [post.id, post.platformCategory]),
    );
    assert(
      platformCategoryById.get('category-probe-x') === 'x' &&
        platformCategoryById.get('category-probe-arxiv') === 'paper' &&
        platformCategoryById.get('category-probe-hn') === 'community' &&
        platformCategoryById.get('category-probe-youtube') === 'youtube',
      `posts should carry the platform category of their source account, got ${JSON.stringify(
        [...platformCategoryById].filter(([id]) => id.startsWith('category-probe-')),
      )}`,
    );
    const unmappedCategoryResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'GET',
      url: `/user/api/posts?page=1&pageSize=5&query=${encodeURIComponent('探针标题')}`,
    });
    const unmappedCategoryBody = unmappedCategoryResponse.json() as {
      data: { posts: Array<{ id: string; platformCategory: string }> };
    };
    assert(
      unmappedCategoryBody.data.posts.length === 1 &&
        unmappedCategoryBody.data.posts[0]?.id === 'posts-probe-1' &&
        unmappedCategoryBody.data.posts[0]?.platformCategory === 'blog',
      `posts without a source account should fall back to blog, got ${JSON.stringify(unmappedCategoryBody.data.posts)}`,
    );
    checks.push({ name: '用户端消息按来源平台归类（X/YouTube/论文/社区，缺源兜底 blog）' });

    const categoryProbeUrl = (category: string): string =>
      `/user/api/posts?page=1&pageSize=50${category.length > 0 ? `&category=${category}` : ''}`;
    const paperCategoryResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'GET',
      url: categoryProbeUrl('paper'),
    });
    const paperCategoryBody = paperCategoryResponse.json() as typeof categoryListBody;
    assert(
      paperCategoryResponse.statusCode === 200 &&
        paperCategoryBody.data.pagination.total >= 1 &&
        paperCategoryBody.data.pagination.totalPages === 1 &&
        paperCategoryBody.data.posts.some((post) => post.id === 'category-probe-arxiv') &&
        paperCategoryBody.data.posts.every((post) => post.platformCategory === 'paper'),
      `category=paper should only return paper posts, got ${JSON.stringify(paperCategoryBody.data)}`,
    );
    const xCategoryResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'GET',
      url: categoryProbeUrl('x'),
    });
    const xCategoryBody = xCategoryResponse.json() as typeof categoryListBody;
    assert(
      xCategoryResponse.statusCode === 200 &&
        xCategoryBody.data.posts.some((post) => post.id === 'category-probe-x') &&
        xCategoryBody.data.posts.every((post) => post.platformCategory === 'x') &&
        !xCategoryBody.data.posts.some((post) =>
          ['category-probe-arxiv', 'category-probe-hn', 'category-probe-youtube'].includes(post.id),
        ),
      `category=x should only return X source posts, got ${JSON.stringify(xCategoryBody.data)}`,
    );
    const communityCategoryResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'GET',
      url: categoryProbeUrl('community'),
    });
    const communityCategoryBody = communityCategoryResponse.json() as typeof categoryListBody;
    assert(
      communityCategoryResponse.statusCode === 200 &&
        communityCategoryBody.data.posts.some((post) => post.id === 'category-probe-hn') &&
        communityCategoryBody.data.posts.every((post) => post.platformCategory === 'community'),
      `category=community should only return community posts, got ${JSON.stringify(communityCategoryBody.data)}`,
    );
    const youtubeCategoryResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'GET',
      url: categoryProbeUrl('youtube'),
    });
    const youtubeCategoryBody = youtubeCategoryResponse.json() as typeof categoryListBody;
    assert(
      youtubeCategoryResponse.statusCode === 200 &&
        youtubeCategoryBody.data.posts.some((post) => post.id === 'category-probe-youtube') &&
        youtubeCategoryBody.data.posts.every((post) => post.platformCategory === 'youtube'),
      `category=youtube should only return YouTube feed posts, got ${JSON.stringify(youtubeCategoryBody.data)}`,
    );
    const blogCategoryResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'GET',
      url: categoryProbeUrl('blog'),
    });
    const blogCategoryBody = blogCategoryResponse.json() as typeof categoryListBody;
    assert(
      blogCategoryResponse.statusCode === 200 &&
        blogCategoryBody.data.posts.some((post) => post.id === 'posts-probe-1') &&
        blogCategoryBody.data.posts.every((post) => post.platformCategory === 'blog') &&
        !blogCategoryBody.data.posts.some((post) =>
          ['category-probe-x', 'category-probe-arxiv', 'category-probe-hn', 'category-probe-youtube'].includes(post.id),
        ),
      `category=blog should include sourceless posts as blog fallback, got ${JSON.stringify(blogCategoryBody.data)}`,
    );
    const invalidCategoryResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'GET',
      url: categoryProbeUrl('zzz-not-a-category'),
    });
    const invalidCategoryBody = invalidCategoryResponse.json() as typeof categoryListBody;
    assert(
      invalidCategoryResponse.statusCode === 200 &&
        invalidCategoryBody.data.pagination.total === categoryListBody.data.pagination.total,
      `invalid category should be ignored, got ${JSON.stringify(invalidCategoryBody.data.pagination)} vs ${JSON.stringify(categoryListBody.data.pagination)}`,
    );
    checks.push({ name: '用户端消息按分类服务端过滤（分页计数正确，非法分类忽略）' });

    const keywordProbeUrl = `/user/api/posts?page=1&pageSize=50&query=${encodeURIComponent('分类探针')}`;
    const keywordOnlyResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'GET',
      url: keywordProbeUrl,
    });
    const keywordOnlyBody = keywordOnlyResponse.json() as typeof categoryListBody;
    const keywordAndCategoryResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'GET',
      url: `${keywordProbeUrl}&category=x`,
    });
    const keywordAndCategoryBody = keywordAndCategoryResponse.json() as typeof categoryListBody;
    assert(
      keywordOnlyBody.data.pagination.total === 4 &&
        keywordAndCategoryBody.data.pagination.total === 1 &&
        keywordAndCategoryBody.data.posts[0]?.id === 'category-probe-x',
      `search + category should combine with AND (4 keyword posts -> 1 for category=x), got ${JSON.stringify({
        keywordOnly: keywordOnlyBody.data.pagination,
        keywordAndCategory: keywordAndCategoryBody.data,
      })}`,
    );
    checks.push({ name: '分类与搜索叠加 AND（翻页由前端携带 category）' });

    const secondBindResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'POST',
      url: '/user/api/wechat/bind',
    });
    assert(
      secondBindResponse.statusCode === 409,
      `second wechat bind should be rejected with 409, got ${secondBindResponse.statusCode}`,
    );
    checks.push({ name: '每个用户只能绑定一个微信号' });

    xApi.setPosts([
      {
        created_at: '2026-04-24T03:00:00.000Z',
        id: '1000000010000000001',
        text: 'Source filter included post',
      },
    ]);
    await runPollingJob({ config, logger, sourceProviders, storage });
    const includedSourceEvent = await storage.deliveryEvents.findByPostAndTarget(
      '1000000010000000001',
      wechatTargetKey,
    );
    assert(
      includedSourceEvent !== null,
      'selected source should create a delivery event for the filtered target',
    );

    const excludedFeedPath = '/excluded-source.xml';
    rssApi.setFeed(excludedFeedPath, {
      body: createRssDocument('Excluded Source', [
        createRssItem({
          description: '<p>Excluded source body</p>',
          guid: 'excluded-item-1',
          link: 'https://example.com/excluded/1',
          pubDate: 'Fri, 24 Apr 2026 03:30:00 GMT',
          title: 'Excluded source post',
        }),
      ]),
      contentType: 'application/rss+xml; charset=utf-8',
      statusCode: 200,
    });
    const excludedCreateResponse = await app.inject({
      method: 'POST',
      payload: { sourceType: 'rss', sourceUrl: `${rssApi.url}${excludedFeedPath}` },
      url: '/admin/api/watch-accounts',
    });
    assert(
      excludedCreateResponse.statusCode === 200,
      `excluded source create returned ${excludedCreateResponse.statusCode}`,
    );
    await runPollingJob({ config, logger, sourceProviders, storage });

    rssApi.setFeed(excludedFeedPath, {
      body: createRssDocument('Excluded Source', [
        createRssItem({
          description: '<p>Excluded source new body</p>',
          guid: 'excluded-item-2',
          link: 'https://example.com/excluded/2',
          pubDate: 'Fri, 24 Apr 2026 04:00:00 GMT',
          title: 'Excluded source new post',
        }),
        createRssItem({
          description: '<p>Excluded source body</p>',
          guid: 'excluded-item-1',
          link: 'https://example.com/excluded/1',
          pubDate: 'Fri, 24 Apr 2026 03:30:00 GMT',
          title: 'Excluded source post',
        }),
      ]),
      contentType: 'application/rss+xml; charset=utf-8',
      statusCode: 200,
    });
    await runPollingJob({ config, logger, sourceProviders, storage });
    const excludedAccountRow = await storage.watchAccounts.findBySource({
      sourceType: 'rss',
      sourceUrl: `${rssApi.url}${excludedFeedPath}`,
    });
    const excludedPosts = await prisma.xPostRaw.findMany({
      where: { authorUserId: excludedAccountRow?.xUserId ?? '' },
    });
    assert(excludedPosts.length === 1, 'excluded source post should still be stored');
    const excludedEvent = await storage.deliveryEvents.findByPostAndTarget(
      excludedPosts[0]?.xPostId ?? '',
      wechatTargetKey,
    );
    assert(
      excludedEvent === null,
      'post from an unselected source must not create a delivery event for the filtered target',
    );
    const unfilteredEvent = await storage.deliveryEvents.findByPostAndTarget(
      excludedPosts[0]?.xPostId ?? '',
      'wechat:wechat-b@im.bot',
    );
    assert(
      unfilteredEvent !== null,
      'wechat target without a source filter should still receive the post',
    );
    checks.push({ name: '源过滤生效：未选源不投递、其它绑定不受影响' });

    // ---- 主题包（source packs）----
    const createPackResponse = await app.inject({
      method: 'POST',
      payload: { name: 'Smoke 主题包', sourceIds: [seededAccount.id] },
      url: '/admin/api/source-packs',
    });
    assert(
      createPackResponse.statusCode === 200,
      `create source pack returned ${createPackResponse.statusCode}`,
    );
    const createdPack = (
      createPackResponse.json() as {
        data: {
          sourcePack: {
            enabled: boolean;
            id: string;
            name: string;
            selectedByUsers: number;
            sourceCount: number;
            sources: Array<{ id: string }>;
          };
        };
      }
    ).data.sourcePack;
    assert(
      createdPack.sourceCount === 1 &&
        createdPack.sources[0]?.id === seededAccount.id &&
        createdPack.enabled === true &&
        createdPack.selectedByUsers === 0,
      `created pack should carry its sources, got ${JSON.stringify(createdPack)}`,
    );

    const duplicatePackResponse = await app.inject({
      method: 'POST',
      payload: { name: 'Smoke 主题包', sourceIds: [] },
      url: '/admin/api/source-packs',
    });
    assert(
      duplicatePackResponse.statusCode === 409,
      `duplicate pack name should return 409, got ${duplicatePackResponse.statusCode}`,
    );

    const packsListResponse = await app.inject({ method: 'GET', url: '/admin/api/source-packs' });
    const packsList = packsListResponse.json() as {
      data: { packs: Array<{ id: string; name: string; sourceCount: number; sources: Array<{ id: string; sourceType: string; sourceUrl: string | null }> }> };
    };
    assert(
      packsListResponse.statusCode === 200 &&
        packsList.data.packs.some(
          (pack) =>
            pack.id === createdPack.id && pack.sourceCount === 1 && Array.isArray(pack.sources),
        ),
      `source-packs list should include the created pack, got ${JSON.stringify(packsList.data)}`,
    );

    const setPacksResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'PUT',
      payload: { mode: 'packs', packs: [createdPack.id] },
      url: `/user/api/wechat/accounts/${encodeURIComponent(boundAccountId)}/sources`,
    });
    assert(
      setPacksResponse.statusCode === 200,
      `setting wechat packs returned ${setPacksResponse.statusCode}`,
    );
    const setPacksResult = (
      setPacksResponse.json() as { data: { mode: string; packs: string[]; sourceIds: string[] } }
    ).data;
    assert(
      setPacksResult.mode === 'packs' &&
        setPacksResult.packs.includes(createdPack.id) &&
        setPacksResult.sourceIds.length === 0,
      `pack mode save should clear sourceIds and keep packs, got ${JSON.stringify(setPacksResult)}`,
    );

    const bindingWithPacks = (
      await rawInject({ headers: { cookie: userCookie }, method: 'GET', url: '/user/api/wechat' })
    ).json() as {
      data: {
        accounts: Array<{ mode: string; packIds: string[] }>;
        sourcePacks: Array<{ description: string | null; enabled: boolean; id: string; name: string; sourceCount: number; sources: Array<{ id: string }> }>;
      };
    };
    assert(
      bindingWithPacks.data.accounts[0]?.mode === 'packs' &&
        bindingWithPacks.data.accounts[0]?.packIds.includes(createdPack.id),
      `binding should report pack mode and packIds, got ${JSON.stringify(bindingWithPacks.data.accounts)}`,
    );
    assert(
      bindingWithPacks.data.sourcePacks.some(
        (pack) =>
          pack.id === createdPack.id && pack.name === 'Smoke 主题包' &&
          pack.enabled && pack.sources.some((source) => source.id === seededAccount.id),
      ),
      `binding should expose source packs with member sources, got ${JSON.stringify(bindingWithPacks.data.sourcePacks)}`,
    );
    checks.push({ name: '管理员建包 + 用户按包订阅（GET 结构与 PUT mode=packs）' });

    // 包内源投递：mock_ai 帖子应创建事件
    xApi.setPosts([
      {
        created_at: '2026-04-24T06:00:00.000Z',
        id: '1000000010000000010',
        text: 'Pack included post',
      },
    ]);
    await runPollingJob({ config, logger, sourceProviders, storage });
    const packIncludedEvent = await storage.deliveryEvents.findByPostAndTarget(
      '1000000010000000010',
      wechatTargetKey,
    );
    assert(
      packIncludedEvent !== null,
      'post from a pack source should be delivered to the pack subscriber',
    );

    // 包内新增源 → 新帖自动投递
    const packAddMemberResponse = await app.inject({
      method: 'PUT',
      payload: { sourceIds: [seededAccount.id, excludedAccountRow.id] },
      url: `/admin/api/source-packs/${createdPack.id}`,
    });
    assert(
      packAddMemberResponse.statusCode === 200,
      `updating pack members returned ${packAddMemberResponse.statusCode}`,
    );
    const packAfterAdd = (
      packAddMemberResponse.json() as { data: { sourcePack: { sourceCount: number } } }
    ).data.sourcePack;
    assert(
      packAfterAdd.sourceCount === 2,
      `pack should have 2 sources after member edit, got ${JSON.stringify(packAfterAdd)}`,
    );

    rssApi.setFeed(excludedFeedPath, {
      body: createRssDocument('Excluded Source', [
        createRssItem({
          description: '<p>Pack auto-added source body</p>',
          guid: 'excluded-item-3',
          link: 'https://example.com/excluded/3',
          pubDate: 'Fri, 24 Apr 2026 06:30:00 GMT',
          title: 'Pack auto-added source post',
        }),
        createRssItem({
          description: '<p>Excluded source body</p>',
          guid: 'excluded-item-1',
          link: 'https://example.com/excluded/1',
          pubDate: 'Fri, 24 Apr 2026 03:30:00 GMT',
          title: 'Excluded source post',
        }),
      ]),
      contentType: 'application/rss+xml; charset=utf-8',
      statusCode: 200,
    });
    await runPollingJob({ config, logger, sourceProviders, storage });
    const autoAddedPosts = await prisma.xPostRaw.findMany({
      where: { authorUserId: excludedAccountRow?.xUserId ?? '' },
    });
    const autoAddedPost = autoAddedPosts.find((post) =>
      post.textContent.includes('Pack auto-added source'),
    );
    assert(autoAddedPost !== undefined, 'newly added pack source post should be stored');
    const autoAddedEvent = await storage.deliveryEvents.findByPostAndTarget(
      autoAddedPost.xPostId,
      wechatTargetKey,
    );
    assert(
      autoAddedEvent !== null,
      'new source added to the pack should be delivered automatically to pack subscribers',
    );
    checks.push({ name: '包内新增源自动投递给选包用户' });

    // 停用包：不投递且用户选择保留
    const disablePackResponse = await app.inject({
      method: 'PUT',
      payload: { enabled: false },
      url: `/admin/api/source-packs/${createdPack.id}`,
    });
    assert(
      disablePackResponse.statusCode === 200 &&
        (disablePackResponse.json() as { data: { sourcePack: { enabled: boolean } } }).data.sourcePack
          .enabled === false,
      `disabling pack should succeed, got ${disablePackResponse.statusCode}`,
    );

    xApi.setPosts([
      {
        created_at: '2026-04-24T07:00:00.000Z',
        id: '1000000010000000011',
        text: 'Disabled pack post',
      },
    ]);
    await runPollingJob({ config, logger, sourceProviders, storage });
    const disabledPackEvent = await storage.deliveryEvents.findByPostAndTarget(
      '1000000010000000011',
      wechatTargetKey,
    );
    assert(
      disabledPackEvent === null,
      'disabled pack must not deliver to its subscribers',
    );
    const disabledUnfilteredEvent = await storage.deliveryEvents.findByPostAndTarget(
      '1000000010000000011',
      'wechat:wechat-b@im.bot',
    );
    assert(
      disabledUnfilteredEvent !== null,
      'unfiltered targets should still receive the post while a pack is disabled',
    );

    const bindingDisabledPack = (
      await rawInject({ headers: { cookie: userCookie }, method: 'GET', url: '/user/api/wechat' })
    ).json() as {
      data: {
        accounts: Array<{ packIds: string[] }>;
        sourcePacks: Array<{ enabled: boolean; id: string }>;
      };
    };
    assert(
      bindingDisabledPack.data.accounts[0]?.packIds.includes(createdPack.id),
      `disabling a pack must keep the user selection, got ${JSON.stringify(bindingDisabledPack.data.accounts)}`,
    );
    assert(
      bindingDisabledPack.data.sourcePacks.some(
        (pack) => pack.id === createdPack.id && pack.enabled === false,
      ),
      'binding should report the disabled pack state for the disabled badge',
    );
    checks.push({ name: '停用包：不投递且用户 packIds 保留' });

    // 重新启用：自动恢复投递
    const enablePackResponse = await app.inject({
      method: 'PUT',
      payload: { enabled: true },
      url: `/admin/api/source-packs/${createdPack.id}`,
    });
    assert(
      enablePackResponse.statusCode === 200 &&
        (enablePackResponse.json() as { data: { sourcePack: { enabled: boolean } } }).data.sourcePack
          .enabled === true,
      `re-enabling pack should succeed, got ${enablePackResponse.statusCode}`,
    );
    xApi.setPosts([
      {
        created_at: '2026-04-24T07:30:00.000Z',
        id: '1000000010000000012',
        text: 'Re-enabled pack post',
      },
    ]);
    await runPollingJob({ config, logger, sourceProviders, storage });
    const reEnabledEvent = await storage.deliveryEvents.findByPostAndTarget(
      '1000000010000000012',
      wechatTargetKey,
    );
    assert(
      reEnabledEvent !== null,
      're-enabling a pack should restore delivery to its subscribers',
    );
    checks.push({ name: '重新启用包后自动恢复投递' });

    // 包模式空集（空包）不推送
    const emptyPackCreateResponse = await app.inject({
      method: 'POST',
      payload: { name: 'Smoke 空包' },
      url: '/admin/api/source-packs',
    });
    assert(
      emptyPackCreateResponse.statusCode === 200,
      `creating an empty pack returned ${emptyPackCreateResponse.statusCode}`,
    );
    const emptyPack = (
      emptyPackCreateResponse.json() as { data: { sourcePack: { id: string; sourceCount: number } } }
    ).data.sourcePack;
    assert(emptyPack.sourceCount === 0, 'empty pack should have no sources');
    const setEmptyPackResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'PUT',
      payload: { mode: 'packs', packs: [emptyPack.id] },
      url: `/user/api/wechat/accounts/${encodeURIComponent(boundAccountId)}/sources`,
    });
    assert(
      setEmptyPackResponse.statusCode === 200,
      `selecting the empty pack returned ${setEmptyPackResponse.statusCode}`,
    );
    xApi.setPosts([
      {
        created_at: '2026-04-24T08:00:00.000Z',
        id: '1000000010000000013',
        text: 'Empty pack post',
      },
    ]);
    await runPollingJob({ config, logger, sourceProviders, storage });
    const emptyPackEvent = await storage.deliveryEvents.findByPostAndTarget(
      '1000000010000000013',
      wechatTargetKey,
    );
    assert(
      emptyPackEvent === null,
      'pack mode with an empty effective source set must not deliver',
    );
    checks.push({ name: '包模式有效源集为空：不推送' });

    // 删除包：级联清理用户选择，无其它包时回退全部接收
    const deletePackResponse = await app.inject({
      method: 'DELETE',
      url: `/admin/api/source-packs/${createdPack.id}`,
    });
    assert(
      deletePackResponse.statusCode === 200,
      `deleting the pack returned ${deletePackResponse.statusCode}`,
    );
    const deletePackResult = (
      deletePackResponse.json() as { data: { affectedUsers: number } }
    ).data;
    assert(
      deletePackResult.affectedUsers === 0,
      `the pack was deselected before deletion, affected users should be 0, got ${JSON.stringify(deletePackResult)}`,
    );
    const deleteEmptyPackResponse = await app.inject({
      method: 'DELETE',
      url: `/admin/api/source-packs/${emptyPack.id}`,
    });
    assert(
      deleteEmptyPackResponse.statusCode === 200 &&
        (deleteEmptyPackResponse.json() as { data: { affectedUsers: number } }).data
          .affectedUsers === 1,
      `deleting the selected empty pack should report one affected user, got ${deleteEmptyPackResponse.statusCode}`,
    );

    const targetAfterDelete = await storage.deliveryTargets.findByTargetKey(wechatTargetKey);
    assert(
      targetAfterDelete !== null && targetAfterDelete.config.packIds === undefined,
      `deleted pack ids must be cleaned from user configs, got ${JSON.stringify(targetAfterDelete?.config)}`,
    );

    xApi.setPosts([
      {
        created_at: '2026-04-24T08:30:00.000Z',
        id: '1000000010000000014',
        text: 'After pack deletion post',
      },
    ]);
    await runPollingJob({ config, logger, sourceProviders, storage });
    const fallbackEvent = await storage.deliveryEvents.findByPostAndTarget(
      '1000000010000000014',
      wechatTargetKey,
    );
    assert(
      fallbackEvent !== null,
      'user with no packs left should fall back to receiving everything',
    );
    checks.push({ name: '删除包级联清理用户选择并回退全部接收' });

    // 旧体兼容：仅 { sourceIds: [...] }（空=全部）
    const legacyFilterResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'PUT',
      payload: { sourceIds: [excludedAccountRow.id] },
      url: `/user/api/wechat/accounts/${encodeURIComponent(boundAccountId)}/sources`,
    });
    assert(
      legacyFilterResponse.statusCode === 200,
      `legacy body sources PUT returned ${legacyFilterResponse.statusCode}`,
    );
    xApi.setPosts([
      {
        created_at: '2026-04-24T09:00:00.000Z',
        id: '1000000010000000015',
        text: 'Legacy filter post',
      },
    ]);
    await runPollingJob({ config, logger, sourceProviders, storage });
    const legacyFilteredEvent = await storage.deliveryEvents.findByPostAndTarget(
      '1000000010000000015',
      wechatTargetKey,
    );
    assert(
      legacyFilteredEvent === null,
      'legacy body should still apply the custom source filter',
    );

    const legacyClearResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'PUT',
      payload: { sourceIds: [] },
      url: `/user/api/wechat/accounts/${encodeURIComponent(boundAccountId)}/sources`,
    });
    assert(
      legacyClearResponse.statusCode === 200,
      `legacy empty sources PUT returned ${legacyClearResponse.statusCode}`,
    );
    const legacyClearResult = (
      legacyClearResponse.json() as { data: { mode: string; packs: string[]; sourceIds: string[] } }
    ).data;
    assert(
      legacyClearResult.mode === 'all' && legacyClearResult.packs.length === 0,
      `legacy empty sources should restore receive-all, got ${JSON.stringify(legacyClearResult)}`,
    );
    xApi.setPosts([
      {
        created_at: '2026-04-24T09:30:00.000Z',
        id: '1000000010000000016',
        text: 'Legacy restore post',
      },
    ]);
    await runPollingJob({ config, logger, sourceProviders, storage });
    const legacyRestoredEvent = await storage.deliveryEvents.findByPostAndTarget(
      '1000000010000000016',
      wechatTargetKey,
    );
    assert(
      legacyRestoredEvent !== null,
      'legacy body with empty sourceIds should restore receive-all delivery',
    );
    checks.push({ name: '旧体兼容：仅 sourceIds 数组仍按现状（空=全部）' });

    const quietReference = new Date('2026-04-24T18:00:00.000Z');
    const quietWindow = findQuietWindow(quietReference, true);
    const openWindow = findQuietWindow(quietReference, false);
    const wechatTargetForQuiet = await storage.deliveryTargets.findByTargetKey(wechatTargetKey);
    assert(wechatTargetForQuiet !== null, 'wechat target should exist for quiet-hour tests');
    await storage.deliveryTargets.update(wechatTargetForQuiet.id, {
      webhookUrl: webhook.urls.wechatBridge,
    });

    const quietOnResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'PUT',
      payload: { enabled: true, ...quietWindow },
      url: `/user/api/wechat/accounts/${encodeURIComponent(boundAccountId)}/quiet-hours`,
    });
    assert(
      quietOnResponse.statusCode === 200,
      `enabling quiet hours returned ${quietOnResponse.statusCode}`,
    );

    xApi.setPosts([
      {
        created_at: '2026-04-24T04:00:00.000Z',
        id: '1000000010000000017',
        text: 'Quiet hours post one',
      },
      {
        created_at: '2026-04-24T04:10:00.000Z',
        id: '1000000010000000018',
        text: 'Quiet hours post two',
      },
    ]);
    await runPollingJob({ config, logger, sourceProviders, storage });
    const quietRequestsBefore = webhook.requests.filter((entry) =>
      entry.url.startsWith('/mock-wechat-bridge'),
    ).length;
    await runDeliveryWorkerJob({ logger, now: () => quietReference, storage });
    const quietRequestsAfter = webhook.requests.filter((entry) =>
      entry.url.startsWith('/mock-wechat-bridge'),
    ).length;
    const quietEventOne = await storage.deliveryEvents.findByPostAndTarget(
      '1000000010000000017',
      wechatTargetKey,
    );
    assert(
      quietRequestsAfter === quietRequestsBefore &&
        quietEventOne !== null &&
        quietEventOne.status === 'pending',
      `quiet hours should hold the event pending without sending, got ${JSON.stringify({ requests: quietRequestsAfter - quietRequestsBefore, status: quietEventOne?.status })}`,
    );
    checks.push({ name: '夜间静默期间新帖暂缓、不产生推送' });

    const quietOffResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'PUT',
      payload: { enabled: true, ...openWindow },
      url: `/user/api/wechat/accounts/${encodeURIComponent(boundAccountId)}/quiet-hours`,
    });
    assert(
      quietOffResponse.statusCode === 200,
      `closing quiet window returned ${quietOffResponse.statusCode}`,
    );
    await runDeliveryWorkerJob({ logger, now: () => quietReference, storage });
    const digestRequests = webhook.requests.filter((entry) =>
      entry.url.startsWith('/mock-wechat-bridge'),
    );
    const digestRequest = digestRequests.at(-1);
    const digestText = JSON.stringify(digestRequest?.body ?? {});
    const quietEventOneAfterFlush = await storage.deliveryEvents.findByPostAndTarget(
      '1000000010000000017',
      wechatTargetKey,
    );
    const quietEventTwoAfterFlush = await storage.deliveryEvents.findByPostAndTarget(
      '1000000010000000018',
      wechatTargetKey,
    );
    assert(
      digestRequests.length === quietRequestsBefore + 1 &&
        digestText.includes('Quiet hours post one') &&
        digestText.includes('Quiet hours post two') &&
        quietEventOneAfterFlush?.status === 'sent' &&
        quietEventTwoAfterFlush?.status === 'sent',
      `digest should combine both posts into one push, got ${JSON.stringify({ total: digestRequests.length, eventOne: quietEventOneAfterFlush?.status, eventTwo: quietEventTwoAfterFlush?.status })}`,
    );
    checks.push({ name: '静默结束后合并为一条汇总推送' });

    const failureTarget = await storage.deliveryTargets.findByTargetKey(wechatTargetKey);
    assert(failureTarget !== null, 'wechat target should exist for digest failure test');
    await storage.deliveryTargets.update(failureTarget.id, {
      webhookUrl: `${webhook.url}/not-mock-fail`,
    });
    xApi.setPosts([
      {
        created_at: '2026-04-24T05:00:00.000Z',
        id: '1000000010000000019',
        text: 'Digest failure post one',
      },
      {
        created_at: '2026-04-24T05:10:00.000Z',
        id: '1000000010000000020',
        text: 'Digest failure post two',
      },
    ]);
    await runPollingJob({ config, logger, sourceProviders, storage });
    await runDeliveryWorkerJob({ logger, now: () => quietReference, storage });
    const failureEventOne = await storage.deliveryEvents.findByPostAndTarget(
      '1000000010000000019',
      wechatTargetKey,
    );
    const failureEventTwo = await storage.deliveryEvents.findByPostAndTarget(
      '1000000010000000020',
      wechatTargetKey,
    );
    assert(
      failureEventOne !== null &&
        failureEventOne.status !== 'sending' &&
        failureEventTwo !== null &&
        failureEventTwo.status !== 'sending',
      `failed digest must not leave events stuck in sending, got ${JSON.stringify({ one: failureEventOne?.status, two: failureEventTwo?.status })}`,
    );
    checks.push({ name: '汇总发送失败不会把其余事件卡在 sending' });

    const expiredSender = createWechatBridgeSender({
      fetchImplementation: async () =>
        new Response(JSON.stringify({ error: 'sendMessage ret=-2 errmsg=prepare failed', ok: false }), {
          headers: { 'content-type': 'application/json' },
          status: 502,
        }),
    });
    const expiredResult = await expiredSender.send({
      config: {},
      message: { author: 't', postedAt: new Date().toISOString(), text: 't', url: 'https://e.com' },
      targetKey: wechatTargetKey,
      webhookUrl: 'http://127.0.0.1:3991/send',
    });
    assert(
      expiredResult.ok === false &&
        expiredResult.error.code === 'WECHAT_SESSION_EXPIRED' &&
        expiredResult.error.retryable === false,
      `expired wechat session must fail fast without retry, got ${JSON.stringify(expiredResult)}`,
    );
    checks.push({ name: '微信会话失效判定为不可重试（避免烧掉重试额度）' });

    const selfDeleteResponse = await app.inject({
      method: 'DELETE',
      url: `/admin/api/users/${mePayload.data.user.id}`,
    });
    assert(selfDeleteResponse.statusCode === 400, 'admin should not delete the current account');
    const lastAdminDeleteResponse = await app.inject({
      method: 'DELETE',
      url: `/admin/api/users/${mePayload.data.user.id}`,
    });
    assert(lastAdminDeleteResponse.statusCode === 400, 'last admin must not be deleted');
    const deleteUserResponse = await app.inject({
      method: 'DELETE',
      url: `/admin/api/users/${createdUser.id}`,
    });
    assert(deleteUserResponse.statusCode === 200, 'admin should delete a regular user');
    const sessionAfterDeleteResponse = await rawInject({
      headers: { cookie: userCookie },
      method: 'GET',
      url: '/auth/me',
    });
    assert(
      sessionAfterDeleteResponse.statusCode === 401,
      'deleted user session should be invalidated immediately',
    );
    const orphanedTargets = await storage.deliveryTargets.listAll();
    assert(
      orphanedTargets.some(
        (target) => target.config.accountId === boundAccountId && target.ownerUserId === null,
      ),
      'deleting a user should release their wechat binding ownership',
    );
    checks.push({ name: '删除用户：拒绝删除自己/最后管理员、会话失效、绑定归属释放' });

    const usersListResponse = await app.inject({ method: 'GET', url: '/admin/api/users' });
    const usersList = (usersListResponse.json() as { data: { users: Array<{ username: string }> } }).data
      .users;
    assert(
      usersListResponse.statusCode === 200 &&
        !usersList.some((user) => user.username === 'smoke-user') &&
        usersList.some((user) => user.username === 'smoke-user-2'),
      `user list should reflect deletions: ${JSON.stringify(usersList.map((user) => user.username))}`,
    );
    checks.push({ name: '用户列表 API 与删除结果一致' });

    const deleteAllWatchResponse = await app.inject({
      method: 'POST',
      url: '/admin/api/watch-accounts/delete-all',
    });
    assert(
      deleteAllWatchResponse.statusCode === 200,
      `delete-all watch accounts returned ${deleteAllWatchResponse.statusCode}`,
    );
    const deleteAllWatchResult = (
      deleteAllWatchResponse.json() as {
        data: { deletedAccounts: number; deletedEvents: number; deletedPosts: number };
      }
    ).data;
    const remainingWatchAccounts = await storage.watchAccounts.listAll();
    assert(
      deleteAllWatchResult.deletedAccounts > 0 && remainingWatchAccounts.length === 0,
      `delete-all should remove every watch account, got ${JSON.stringify({ deleted: deleteAllWatchResult.deletedAccounts, remaining: remainingWatchAccounts.length })}`,
    );
    checks.push({
      detail: `accounts=${deleteAllWatchResult.deletedAccounts}, posts=${deleteAllWatchResult.deletedPosts}, events=${deleteAllWatchResult.deletedEvents}`,
      name: '一键删除全部监听源（级联清理消息与投递记录）',
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
  assert(
    providers.ai2_blog.sourceType === 'ai2_blog' &&
      providers.moonshot_blog.sourceType === 'moonshot_blog' &&
      providers.meta_ai_blog.sourceType === 'meta_ai_blog' &&
      providers.xai_news.sourceType === 'xai_news',
    'runtime source providers should include the new official blog providers',
  );
  checks.push({ name: 'scheduler 会创建 browser X provider、RSS provider 与新增官方源 provider' });
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

interface MockWebhookRequest {
  body: unknown;
  headers: http.IncomingHttpHeaders;
  url: string;
}

async function startMockWebhook(): Promise<{
  close(): Promise<void>;
  requests: MockWebhookRequest[];
  urls: {
    bark: string;
    dingtalk: string;
    feishu: string;
    generic: string;
    wechatBridge: string;
    wecom: string;
  };
}> {
  const requests: MockWebhookRequest[] = [];
  const server = http.createServer(async (request, response) => {
    if (request.method !== 'POST') {
      sendJson(response, { error: 'not found' }, 404);
      return;
    }

    const requestUrl = request.url ?? '';

    if (!requestUrl.startsWith('/mock-')) {
      sendJson(response, { error: 'not found' }, 404);
      return;
    }

    requests.push({
      body: await readJsonBody(request),
      headers: request.headers,
      url: requestUrl,
    });

    if (requestUrl.startsWith('/mock-wechat-bridge')) {
      sendJson(response, {
        messageId: 'mock-bridge-1',
        ok: true,
      });
      return;
    }

    if (requestUrl.startsWith('/mock-wecom') || requestUrl.startsWith('/mock-dingtalk')) {
      sendJson(response, {
        errcode: 0,
        errmsg: 'ok',
      });
      return;
    }

    if (requestUrl.startsWith('/mock-bark')) {
      sendJson(response, {
        code: 200,
        message: 'success',
      });
      return;
    }

    if (requestUrl.startsWith('/mock-generic')) {
      sendJson(response, { ok: true });
      return;
    }

    sendJson(response, {
      code: 0,
      msg: 'success',
    });
  });
  const baseUrl = await listen(server);

  return {
    close: () => closeServer(server),
    requests,
    urls: {
      bark: `${baseUrl}/mock-bark/device-key`,
      dingtalk: `${baseUrl}/mock-dingtalk`,
      feishu: `${baseUrl}/mock-feishu-webhook-secret`,
      generic: `${baseUrl}/mock-generic`,
      wechatBridge: `${baseUrl}/mock-wechat-bridge`,
      wecom: `${baseUrl}/mock-wecom`,
    },
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

function findQuietWindow(
  reference: Date,
  inside: boolean,
): { endHour: number; startHour: number } {
  for (let startHour = 0; startHour < 24; startHour += 1) {
    for (let endHour = 0; endHour < 24; endHour += 1) {
      if (startHour === endHour) {
        continue;
      }

      if (isWithinQuietHours(reference, { endHour, startHour }) === inside) {
        return { endHour, startHour };
      }
    }
  }

  throw new Error('unable to find a quiet-hours window for the reference date');
}

function readSessionCookie(setCookieHeader: string | string[] | undefined): string {
  const header = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;

  if (header === undefined) {
    return '';
  }

  return header.split(';')[0] ?? '';
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
