import type { DeliveryTarget, WatchAccount, XPostRepository } from '../../storage';
import type { DeliveryEventRepository } from '../../storage';
import type { SourceDescriptor, SourceProviderRegistry, StandardizedPost } from '../types';
import type { SubscriptionRuleMatcher } from './subscription-rule-matcher';

export type EffectiveSourceSet = ReadonlySet<string> | 'all';

export interface PollingAccountServiceOptions {
  deliveryEvents: DeliveryEventRepository;
  excludeReplies?: boolean;
  excludeReposts?: boolean;
  fetchLimitPerAccount: number;
  sourceProviders: SourceProviderRegistry;
  subscriptionRuleMatcher?: SubscriptionRuleMatcher;
  xPosts: XPostRepository;
}

export interface PollingAccountResult {
  baselinePostId: string | null;
  eventsCreated: number;
  lastSeenPostId: string | null;
  newPostsDetected: number;
  resolvedDisplayName: string | null;
  resolvedSourceId: string;
}

export class PollingAccountService {
  private readonly excludeReplies: boolean;
  private readonly excludeReposts: boolean;

  public constructor(private readonly options: PollingAccountServiceOptions) {
    this.excludeReplies = options.excludeReplies ?? true;
    this.excludeReposts = options.excludeReposts ?? true;
  }

  public async pollAccount(
    account: WatchAccount,
    deliveryTargets: DeliveryTarget[],
    effectiveSourceSets: Map<string, EffectiveSourceSet>,
  ): Promise<PollingAccountResult> {
    const fetchCursor = account.lastSeenPostId ?? account.baselinePostId ?? undefined;
    const sourceProvider = this.options.sourceProviders.get(account.sourceType);
    const fetchResult = await sourceProvider.fetchPosts({
      limit: this.options.fetchLimitPerAccount,
      sincePostId: fetchCursor,
      source: toSourceDescriptor(account),
    });
    const newestFetchedPostId = resolveNewestPostId(fetchResult.posts, fetchResult.meta.newestPostId);
    const filteredPosts = applyPostFilters(fetchResult.posts, {
      excludeReplies: this.excludeReplies,
      excludeReposts: this.excludeReposts,
    });
    const isFirstRun = fetchCursor === undefined;
    const baselineAllOnFirstRun = isFirstRun && sourceProvider.firstRunBaseline === 'all';
    const anchorOnlyOnFirstRun = isFirstRun && !baselineAllOnFirstRun;
    const eligiblePosts = anchorOnlyOnFirstRun
      ? []
      : resolveEligiblePosts({
          cursor: fetchCursor,
          includeAllWithoutCursor: baselineAllOnFirstRun,
          posts: filteredPosts,
        });

    const persistResult = await this.persistPosts(eligiblePosts, deliveryTargets, {
      createEvents: !baselineAllOnFirstRun,
      effectiveSourceSets,
      sourceId: account.id,
    });

    return {
      baselinePostId: account.baselinePostId ?? newestFetchedPostId ?? null,
      eventsCreated: persistResult.eventsCreated,
      lastSeenPostId: pickHigherPostId(fetchCursor ?? null, newestFetchedPostId ?? null),
      newPostsDetected: persistResult.newPostsDetected,
      resolvedDisplayName: fetchResult.account.displayName ?? null,
      resolvedSourceId: fetchResult.account.sourceId,
    };
  }

  private async persistPosts(
    posts: StandardizedPost[],
    deliveryTargets: DeliveryTarget[],
    options: {
      createEvents: boolean;
      effectiveSourceSets: Map<string, EffectiveSourceSet>;
      sourceId: string;
    },
  ): Promise<{
    eventsCreated: number;
    newPostsDetected: number;
  }> {
    let eventsCreated = 0;
    let newPostsDetected = 0;

    for (const post of posts) {
      const persistResult = await this.persistPost(post, deliveryTargets, options);

      if (persistResult.isNewPost) {
        newPostsDetected += 1;
      }

      eventsCreated += persistResult.eventsCreated;
    }

    return {
      eventsCreated,
      newPostsDetected,
    };
  }

  private async persistPost(
    post: StandardizedPost,
    deliveryTargets: DeliveryTarget[],
    options: {
      createEvents: boolean;
      effectiveSourceSets: Map<string, EffectiveSourceSet>;
      sourceId: string;
    },
  ): Promise<{
    eventsCreated: number;
    isNewPost: boolean;
  }> {
    const existingPost =
      post.dedupeKey === undefined
        ? await this.options.xPosts.findByXPostId(post.xPostId)
        : await this.options.xPosts.findByDedupeKey(post.dedupeKey);

    if (existingPost !== null) {
      return {
        eventsCreated: 0,
        isNewPost: false,
      };
    }

    await this.options.xPosts.upsertByXPostId({
      authorUserId: post.author.sourceId,
      authorUsername: post.author.sourceLabel,
      dedupeKey: post.dedupeKey,
      detectedAt: new Date().toISOString(),
      isReply: post.isReply,
      isRepost: post.isRepost,
      permalinkUrl: post.permalinkUrl,
      postedAt: post.postedAt,
      rawPayloadJson: serializeRawPayload(post.rawPayload),
      textContent: post.textContent,
      ...(post.title === undefined ? {} : { title: post.title }),
      xPostId: post.xPostId,
    });

    let eventsCreated = 0;

    if (options.createEvents) {
      const allowedTargetKeys = this.resolveDeliveryTargets(post, deliveryTargets);

      for (const deliveryTarget of deliveryTargets) {
        if (!allowedTargetKeys.has(deliveryTarget.targetKey)) {
          continue;
        }

        if (!acceptsSource(deliveryTarget, options.sourceId, options.effectiveSourceSets)) {
          continue;
        }

        const deliveryEvent = await this.options.deliveryEvents.createIfAbsent({
          status: 'pending',
          targetKey: deliveryTarget.targetKey,
          xPostId: post.xPostId,
        });

        if (deliveryEvent.created) {
          eventsCreated += 1;
        }
      }
    }

    return {
      eventsCreated,
      isNewPost: true,
    };
  }

  private resolveDeliveryTargets(post: StandardizedPost, deliveryTargets: DeliveryTarget[]): Set<string> {
    const matcher = this.options.subscriptionRuleMatcher;

    if (matcher === undefined) {
      return new Set(deliveryTargets.map((target) => target.targetKey));
    }

    return matcher.resolveTargetKeys(
      post.textContent,
      deliveryTargets.map((target) => target.targetKey),
    );
  }
}

function resolveEligiblePosts(input: {
  cursor: string | undefined;
  includeAllWithoutCursor?: boolean;
  posts: StandardizedPost[];
}): StandardizedPost[] {
  if (input.cursor === undefined) {
    return input.includeAllWithoutCursor === true ? sortPostsAscending(input.posts) : [];
  }

  return sortPostsAscending(
    input.posts.filter((post) => isPostIdGreaterThan(post.xPostId, input.cursor)),
  );
}

function applyPostFilters(
  posts: StandardizedPost[],
  options: {
    excludeReplies: boolean;
    excludeReposts: boolean;
  },
): StandardizedPost[] {
  return posts.filter((post) => {
    if (options.excludeReplies && post.isReply) {
      return false;
    }

    if (options.excludeReposts && post.isRepost) {
      return false;
    }

    return true;
  });
}

function comparePostIds(left: string | null | undefined, right: string | null | undefined): number {
  if (!isPresent(left) && !isPresent(right)) {
    return 0;
  }

  if (!isPresent(left)) {
    return -1;
  }

  if (!isPresent(right)) {
    return 1;
  }

  try {
    const leftValue = BigInt(left);
    const rightValue = BigInt(right);

    if (leftValue === rightValue) {
      return 0;
    }

    return leftValue > rightValue ? 1 : -1;
  } catch {
    return left.localeCompare(right);
  }
}

function isPostIdGreaterThan(xPostId: string, cursor: string | undefined): boolean {
  return comparePostIds(xPostId, cursor) > 0;
}

function isPresent(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

function pickHigherPostId(
  firstPostId: string | null | undefined,
  secondPostId: string | null | undefined,
): string | null {
  if (comparePostIds(firstPostId, secondPostId) >= 0) {
    return firstPostId ?? null;
  }

  return secondPostId ?? null;
}

function resolveNewestPostId(posts: StandardizedPost[], newestPostId?: string): string | undefined {
  let resolvedNewestPostId = newestPostId;

  for (const post of posts) {
    if (comparePostIds(post.xPostId, resolvedNewestPostId) > 0) {
      resolvedNewestPostId = post.xPostId;
    }
  }

  return resolvedNewestPostId;
}

function serializeRawPayload(rawPayload: unknown): string {
  try {
    return JSON.stringify(rawPayload);
  } catch (error) {
    throw new Error(
      `Failed to serialize raw source payload: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function toSourceDescriptor(account: WatchAccount): SourceDescriptor {
  return {
    sourceType: account.sourceType,
    ...(account.sourceUrl === null ? {} : { sourceUrl: account.sourceUrl }),
    ...(account.xUserId === null ? {} : { xUserId: account.xUserId }),
    ...(account.xUsername === null ? {} : { xUsername: account.xUsername }),
  };
}

function sortPostsAscending(posts: StandardizedPost[]): StandardizedPost[] {
  return [...posts].sort((left, right) => comparePostIds(left.xPostId, right.xPostId));
}

function acceptsSource(
  target: DeliveryTarget,
  sourceId: string,
  effectiveSourceSets: Map<string, EffectiveSourceSet>,
): boolean {
  const effectiveSet = effectiveSourceSets.get(target.id);

  if (effectiveSet === undefined) {
    return true;
  }

  if (effectiveSet === 'all') {
    return true;
  }

  return effectiveSet.has(sourceId);
}

type SourcePackMemberReader = {
  listMemberSourceIdsByPackIds(
    packIds: string[],
    options?: { enabledOnly?: boolean },
  ): Promise<Map<string, string[]>>;
};

/**
 * 解析每个投递通道本次轮询周期的生效源集合：
 * - config.packIds 存在（数组）：启用包成员 ∪ sourceIds（并存数据层 union 兼容）；解析为空 → 不推送
 * - 否则 config.sourceIds 非空 → 按列表（空数组 = 全部，现状不变）
 * - 均无 → 'all'
 */
export async function resolveEffectiveSourceSets(
  sourcePacks: SourcePackMemberReader,
  deliveryTargets: DeliveryTarget[],
): Promise<Map<string, EffectiveSourceSet>> {
  const targetPackIds = new Map<string, string[]>();
  const allPackIds = new Set<string>();

  for (const target of deliveryTargets) {
    const packIds = target.config.packIds;

    if (Array.isArray(packIds)) {
      const normalizedPackIds = packIds.filter(
        (packId) => typeof packId === 'string' && packId.length > 0,
      );

      targetPackIds.set(target.id, normalizedPackIds);

      for (const packId of normalizedPackIds) {
        allPackIds.add(packId);
      }
    }
  }

  const membersByPackId =
    allPackIds.size > 0
      ? await sourcePacks.listMemberSourceIdsByPackIds([...allPackIds], { enabledOnly: true })
      : new Map<string, string[]>();

  const result = new Map<string, EffectiveSourceSet>();

  for (const target of deliveryTargets) {
    const packIds = targetPackIds.get(target.id);

    if (packIds === undefined) {
      const sourceIds = target.config.sourceIds;

      if (sourceIds === undefined || sourceIds.length === 0) {
        result.set(target.id, 'all');
      } else {
        result.set(target.id, new Set(sourceIds));
      }

      continue;
    }

    const effectiveSet = new Set<string>();

    for (const packId of packIds) {
      for (const sourceId of membersByPackId.get(packId) ?? []) {
        effectiveSet.add(sourceId);
      }
    }

    const sourceIds = target.config.sourceIds;

    if (sourceIds !== undefined) {
      for (const sourceId of sourceIds) {
        effectiveSet.add(sourceId);
      }
    }

    result.set(target.id, effectiveSet);
  }

  return result;
}
