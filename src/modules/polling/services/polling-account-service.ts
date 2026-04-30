import type { DeliveryTarget, WatchAccount, XPostRepository } from '../../storage';
import type { DeliveryEventRepository } from '../../storage';
import type { SourceProvider, StandardizedPost } from '../types';

export interface PollingAccountServiceOptions {
  deliveryEvents: DeliveryEventRepository;
  excludeReplies?: boolean;
  excludeReposts?: boolean;
  fetchLimitPerAccount: number;
  sourceProvider: SourceProvider;
  xPosts: XPostRepository;
}

export interface PollingAccountResult {
  baselinePostId: string | null;
  eventsCreated: number;
  lastSeenPostId: string | null;
  newPostsDetected: number;
  resolvedDisplayName: string | null;
  resolvedXUserId: string;
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
  ): Promise<PollingAccountResult> {
    if (deliveryTargets.length === 0) {
      throw new Error('No enabled delivery targets are configured.');
    }

    const fetchCursor = account.lastSeenPostId ?? account.baselinePostId ?? undefined;
    const fetchResult = await this.options.sourceProvider.fetchPosts({
      limit: this.options.fetchLimitPerAccount,
      sincePostId: fetchCursor,
      xUserId: account.xUserId ?? undefined,
      xUsername: account.xUsername,
    });
    const newestFetchedPostId = resolveNewestPostId(fetchResult.posts, fetchResult.meta.newestPostId);
    const filteredPosts = applyPostFilters(fetchResult.posts, {
      excludeReplies: this.excludeReplies,
      excludeReposts: this.excludeReposts,
    });
    const eligiblePosts = resolveEligiblePosts({
      cursor: fetchCursor,
      posts: filteredPosts,
    });

    const persistResult = await this.persistPosts(eligiblePosts, deliveryTargets);

    return {
      baselinePostId: account.baselinePostId ?? newestFetchedPostId ?? null,
      eventsCreated: persistResult.eventsCreated,
      lastSeenPostId: pickHigherPostId(fetchCursor ?? null, newestFetchedPostId ?? null),
      newPostsDetected: persistResult.newPostsDetected,
      resolvedDisplayName: fetchResult.account.displayName ?? null,
      resolvedXUserId: fetchResult.account.xUserId,
    };
  }

  private async persistPosts(
    posts: StandardizedPost[],
    deliveryTargets: DeliveryTarget[],
  ): Promise<{
    eventsCreated: number;
    newPostsDetected: number;
  }> {
    let eventsCreated = 0;
    let newPostsDetected = 0;

    for (const post of posts) {
      const createdForPost = await this.persistPost(post, deliveryTargets);

      if (createdForPost > 0) {
        newPostsDetected += 1;
        eventsCreated += createdForPost;
      }
    }

    return {
      eventsCreated,
      newPostsDetected,
    };
  }

  private async persistPost(
    post: StandardizedPost,
    deliveryTargets: DeliveryTarget[],
  ): Promise<number> {
    await this.options.xPosts.upsertByXPostId({
      authorUserId: post.author.xUserId,
      authorUsername: post.author.xUsername,
      detectedAt: new Date().toISOString(),
      isReply: post.isReply,
      isRepost: post.isRepost,
      permalinkUrl: post.permalinkUrl,
      postedAt: post.postedAt,
      rawPayloadJson: serializeRawPayload(post.rawPayload),
      textContent: post.textContent,
      xPostId: post.xPostId,
    });

    let createdForPost = 0;

    for (const deliveryTarget of deliveryTargets) {
      const deliveryEvent = await this.options.deliveryEvents.createIfAbsent({
        status: 'pending',
        targetKey: deliveryTarget.targetKey,
        xPostId: post.xPostId,
      });

      if (deliveryEvent.created) {
        createdForPost += 1;
      }
    }

    return createdForPost;
  }
}

function resolveEligiblePosts(input: {
  cursor: string | undefined;
  posts: StandardizedPost[];
}): StandardizedPost[] {
  if (input.cursor === undefined) {
    const newestPost = pickNewestPost(input.posts);

    return newestPost === undefined ? [] : [newestPost];
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

function pickNewestPost(posts: StandardizedPost[]): StandardizedPost | undefined {
  return posts.reduce<StandardizedPost | undefined>((newestPost, post) => {
    if (newestPost === undefined || comparePostIds(post.xPostId, newestPost.xPostId) > 0) {
      return post;
    }

    return newestPost;
  }, undefined);
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
      `Failed to serialize raw X payload: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function sortPostsAscending(posts: StandardizedPost[]): StandardizedPost[] {
  return [...posts].sort((left, right) => comparePostIds(left.xPostId, right.xPostId));
}
