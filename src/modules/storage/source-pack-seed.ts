import {
  BUILT_IN_SOURCE_PACK_SEEDS,
  LEGACY_SOURCE_PACK_NAME,
  type SourcePackSeedDefinition,
  type SourcePackSeedSource,
} from '../../config/source-pack-seeds';
import { SOURCE_GROUPS } from '../../config/source-groups';
import type { AppLogger } from '../../lib/logger';
import { resolveYoutubeChannel } from '../polling/source/youtube-channel-resolver';
import type { SourcePackRepository } from './source-pack-repository';
import type { WatchAccountRepository } from './watch-account-repository';

export interface SourcePackSeedSkippedSource {
  packName: string;
  reason: string;
  source: string;
}

export interface SourcePackSeedResult {
  createdPackNames: string[];
  createdSourceCount: number;
  paperPackCreated: boolean;
  paperPackId: string | null;
  paperPackName: string;
  renamedFromLegacy: boolean;
  repairedPackNames: string[];
  skippedSources: SourcePackSeedSkippedSource[];
}

export type YoutubeChannelSeedResolver = (
  handle: string,
) => Promise<{ feedUrl: string; label?: string }>;

function createEmptySeedResult(): SourcePackSeedResult {
  return {
    createdPackNames: [],
    createdSourceCount: 0,
    paperPackCreated: false,
    paperPackId: null,
    paperPackName: '',
    renamedFromLegacy: false,
    repairedPackNames: [],
    skippedSources: [],
  };
}

/**
 * 首启种子（幂等，可重复执行）：
 * 1. 存量「AI 消息」包改名「论文包」（保留 id / 成员 / 描述；论文包已存在则跳过改名）；
 * 2. 确保论文包预设源存在，缺包则创建论文包并挂载全部命中源；
 * 3. 逐条确保内置包种子源（X / RSS 直接幂等创建，YouTube 先解析为 feed URL，失败记日志跳过、下次启动重试）；
 * 4. 逐个创建内置主题包并挂载成员（同名包已存在则跳过创建，改为补挂缺失的种子成员）。
 *
 * 容错约定：任何单条源或单个包的失败（含 YouTube 解析失败）只记日志并跳过，不中断其余种子；
 * 建包允许部分成员（缺失成员下次启动重试后补挂）。整个种子顶层兜底：异常只记日志不抛出，
 * 服务启动不因种子失败被拖垮。
 *
 * 补挂语义：已存在的内置包会在每次启动时补挂缺失的种子成员——内置包跟随种子收敛到完整成员，
 * 因此管理员从内置包删除的种子成员会在重启后被重新补挂；管理员自建的非内置包完全不受影响。
 */
export async function seedSourcePacks(input: {
  logger?: AppLogger;
  sourcePacks: SourcePackRepository;
  watchAccounts: WatchAccountRepository;
  youtubeChannelResolver?: YoutubeChannelSeedResolver;
}): Promise<SourcePackSeedResult> {
  const result = createEmptySeedResult();

  try {
    await runSeedSourcePacks(input, result);
  } catch (error) {
    input.logger?.error(
      { err: error },
      '内置主题包种子执行中断，本次已跳过剩余种子（不影响服务启动，下次启动重试）',
    );
  }

  return result;
}

async function runSeedSourcePacks(
  input: {
    logger?: AppLogger;
    sourcePacks: SourcePackRepository;
    watchAccounts: WatchAccountRepository;
    youtubeChannelResolver?: YoutubeChannelSeedResolver;
  },
  result: SourcePackSeedResult,
): Promise<void> {
  const group = SOURCE_GROUPS[0];

  if (group === undefined) {
    return;
  }

  let paperPackSortOrder = 0;

  try {
    const legacyPack = await input.sourcePacks.findByName(LEGACY_SOURCE_PACK_NAME);

    if (legacyPack !== null) {
      const paperPack = await input.sourcePacks.findByName(group.name);

      if (paperPack === null) {
        const renamed = await input.sourcePacks.update(legacyPack.id, { name: group.name });

        if (renamed !== null) {
          result.renamedFromLegacy = true;
        }
      }
    }
  } catch (error) {
    input.logger?.warn({ err: error }, '存量「AI 消息」包改名失败，已跳过（下次启动重试）');
  }

  try {
    for (const source of group.sources) {
      try {
        await input.watchAccounts.createIfAbsentBySource({ ...source, enabled: true });
      } catch (error) {
        input.logger?.warn(
          { err: error, sourceUrl: source.sourceUrl },
          '论文包种子源确保失败，已跳过（下次启动重试）',
        );
      }
    }

    let paperPack = await input.sourcePacks.findByName(group.name);

    if (paperPack === null) {
      const memberSourceIds: string[] = [];

      for (const source of group.sources) {
        try {
          const watchAccount = await input.watchAccounts.findBySource(source);

          if (watchAccount !== null) {
            memberSourceIds.push(watchAccount.id);
          }
        } catch (error) {
          input.logger?.warn(
            { err: error, sourceUrl: source.sourceUrl },
            '论文包种子成员查询失败，已跳过该成员（下次启动重试）',
          );
        }
      }

      paperPack = await input.sourcePacks.create({
        description: group.description,
        name: group.name,
        sourceIds: memberSourceIds,
      });
      result.paperPackCreated = true;
    }

    result.paperPackId = paperPack.id;
    result.paperPackName = paperPack.name;
    paperPackSortOrder = paperPack.sortOrder;
  } catch (error) {
    input.logger?.warn({ err: error }, '论文包种子执行失败，已跳过（下次启动重试）');
  }

  const ensuredSourceIds = new Map<string, string | null>();

  for (const [index, definition] of BUILT_IN_SOURCE_PACK_SEEDS.entries()) {
    try {
      for (const source of definition.sources) {
        const cacheKey = toSeedSourceCacheKey(source);

        if (!ensuredSourceIds.has(cacheKey)) {
          ensuredSourceIds.set(
            cacheKey,
            await ensureSeedSourceSafely({
              logger: input.logger,
              packName: definition.name,
              resolveYoutubeChannel: input.youtubeChannelResolver,
              result,
              source,
              watchAccounts: input.watchAccounts,
            }),
          );
        }
      }

      await ensureBuiltInPack({
        definition,
        ensuredSourceIds,
        index,
        logger: input.logger,
        paperPackSortOrder,
        result,
        sourcePacks: input.sourcePacks,
      });
    } catch (error) {
      input.logger?.warn(
        { err: error, pack: definition.name },
        '内置主题包种子执行失败，已跳过该包（下次启动重试）',
      );
    }
  }
}

/**
 * 建包或补挂：包不存在则按当前已确保的成员创建（允许部分成员，缺失成员已逐条 warn）；
 * 包已存在则补挂缺失的种子成员（内置包跟随种子收敛到完整成员，管理员自建包不受影响）。
 */
async function ensureBuiltInPack(input: {
  definition: SourcePackSeedDefinition;
  ensuredSourceIds: Map<string, string | null>;
  index: number;
  logger?: AppLogger;
  paperPackSortOrder: number;
  result: SourcePackSeedResult;
  sourcePacks: SourcePackRepository;
}): Promise<void> {
  const memberSourceIds = input.definition.sources
    .map((source) => input.ensuredSourceIds.get(toSeedSourceCacheKey(source)) ?? null)
    .filter((watchAccountId): watchAccountId is string => watchAccountId !== null);

  const existingPack = await input.sourcePacks.findByName(input.definition.name);

  if (existingPack === null) {
    const createdPack = await input.sourcePacks.create({
      description: input.definition.description,
      name: input.definition.name,
      sortOrder: input.paperPackSortOrder + input.index + 1,
      sourceIds: memberSourceIds,
    });

    input.result.createdPackNames.push(createdPack.name);
    return;
  }

  const existingMemberIds = new Set(existingPack.memberSourceIds);
  const missingIds = memberSourceIds.filter((watchAccountId) => !existingMemberIds.has(watchAccountId));

  if (missingIds.length === 0) {
    return;
  }

  await input.sourcePacks.update(existingPack.id, {
    sourceIds: [...existingPack.memberSourceIds, ...missingIds],
  });
  input.result.repairedPackNames.push(existingPack.name);
  input.logger?.info(
    { pack: existingPack.name, reattached: missingIds.length },
    '内置包已补挂缺失的种子成员',
  );
}

function toSeedSourceCacheKey(source: SourcePackSeedSource): string {
  if (source.kind === 'x') {
    return `x:${source.xUsername.toLowerCase()}`;
  }

  if (source.kind === 'feed') {
    return `feed:${source.sourceType}:${new URL(source.sourceUrl).toString()}`;
  }

  return `youtube:${source.handle.toLowerCase()}`;
}

function describeSeedSource(source: SourcePackSeedSource): string {
  if (source.kind === 'x') {
    return `@${source.xUsername}`;
  }

  if (source.kind === 'feed') {
    return source.sourceUrl;
  }

  return source.handle;
}

async function ensureSeedSourceSafely(input: {
  logger?: AppLogger;
  packName: string;
  resolveYoutubeChannel: YoutubeChannelSeedResolver | undefined;
  result: SourcePackSeedResult;
  source: SourcePackSeedSource;
  watchAccounts: WatchAccountRepository;
}): Promise<string | null> {
  try {
    return await ensureSeedSource(input);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    input.logger?.warn(
      { err: error, pack: input.packName, source: describeSeedSource(input.source) },
      '种子源确保失败，已跳过该源（下次启动重试）',
    );
    input.result.skippedSources.push({
      packName: input.packName,
      reason,
      source: describeSeedSource(input.source),
    });

    return null;
  }
}

async function ensureSeedSource(input: {
  logger?: AppLogger;
  packName: string;
  resolveYoutubeChannel: YoutubeChannelSeedResolver | undefined;
  result: SourcePackSeedResult;
  source: SourcePackSeedSource;
  watchAccounts: WatchAccountRepository;
}): Promise<string | null> {
  if (input.source.kind === 'x') {
    const { created, watchAccount } = await input.watchAccounts.createIfAbsentByUsername({
      displayName: input.source.displayName,
      enabled: true,
      xUsername: input.source.xUsername,
    });

    if (created) {
      input.result.createdSourceCount += 1;
    }

    return watchAccount.id;
  }

  if (input.source.kind === 'feed') {
    const { created, watchAccount } = await input.watchAccounts.createIfAbsentBySource({
      displayName: input.source.displayName,
      enabled: true,
      sourceType: input.source.sourceType,
      sourceUrl: new URL(input.source.sourceUrl).toString(),
    });

    if (created) {
      input.result.createdSourceCount += 1;
    }

    return watchAccount.id;
  }

  try {
    const resolveChannel =
      input.resolveYoutubeChannel ?? ((handle: string) => resolveYoutubeChannel(handle));
    const resolved = await resolveChannel(input.source.handle);
    const { created, watchAccount } = await input.watchAccounts.createIfAbsentBySource({
      displayName: resolved.label ?? input.source.displayName,
      enabled: true,
      sourceType: 'rss',
      sourceUrl: resolved.feedUrl,
    });

    if (created) {
      input.result.createdSourceCount += 1;
    }

    return watchAccount.id;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    input.logger?.warn(
      { err: error, handle: input.source.handle },
      'YouTube 频道解析失败，种子源已跳过，将在下次启动时重试',
    );
    input.result.skippedSources.push({
      packName: input.packName,
      reason,
      source: input.source.handle,
    });

    return null;
  }
}
