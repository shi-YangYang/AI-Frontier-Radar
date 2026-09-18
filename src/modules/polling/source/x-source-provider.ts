import type {
  SourceProvider,
  SourceProviderAccount,
  SourceProviderFetchInput,
  SourceProviderFetchResult,
  SourceProviderValidateSourceInput,
  StandardizedPost,
} from '../types';
import type { XApiTimelineResponse, XApiTweet } from '../types/x-api';
import { SourceProviderError } from './source-provider-error';
import { XTimelineClient, type XTimelineClientOptions } from './x-timeline-client';

export interface XSourceProviderOptions extends XTimelineClientOptions {}

export class XSourceProvider implements SourceProvider {
  public readonly sourceType = 'x' as const;
  private readonly timelineClient: XTimelineClient;

  public constructor(options: XSourceProviderOptions) {
    this.timelineClient = new XTimelineClient(options);
  }

  public async fetchPosts(input: SourceProviderFetchInput): Promise<SourceProviderFetchResult> {
    validateFetchInput(input);

    const account = await this.timelineClient.resolveAccount({
      xUserId: input.source.xUserId,
      xUsername: input.source.xUsername,
    });
    const timelineResponse = await this.timelineClient.fetchTimeline({
      limit: input.limit,
      sincePostId: input.sincePostId,
      xUserId: account.xUserId,
      xUsername: account.xUsername,
    });
    const standardizedAccount: SourceProviderAccount = {
      displayName: account.displayName,
      sourceId: account.xUserId,
      sourceLabel: account.xUsername,
    };
    const posts = normalizeTimelinePosts(timelineResponse, standardizedAccount);

    return {
      account: standardizedAccount,
      meta: {
        newestPostId: timelineResponse.meta?.newest_id,
        oldestPostId: timelineResponse.meta?.oldest_id,
        provider: 'x',
        requestedLimit: input.limit,
        resolvedBy: account.resolvedBy,
        sincePostId: input.sincePostId,
      },
      posts,
    };
  }

  public async validateSource(
    input: SourceProviderValidateSourceInput,
  ): Promise<SourceProviderAccount> {
    validateSourceInput(input);

    const account = await this.timelineClient.resolveAccount({
      xUsername: input.source.xUsername,
    });

    return {
      displayName: account.displayName,
      sourceId: account.xUserId,
      sourceLabel: account.xUsername,
    };
  }
}

export function createXSourceProvider(options: XSourceProviderOptions): SourceProvider {
  return new XSourceProvider(options);
}

function validateFetchInput(input: SourceProviderFetchInput): void {
  if (!isPresent(input.source.xUsername) && !isPresent(input.source.xUserId)) {
    throw new SourceProviderError(
      'SOURCE_INVALID_INPUT',
      'X 源需要 xUsername 或 xUserId。',
      {
        limit: input.limit,
        operation: 'resolve-account',
        provider: 'x',
        sincePostId: input.sincePostId,
        xUserId: input.source.xUserId,
        xUsername: input.source.xUsername,
      },
    );
  }

  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
    throw new SourceProviderError(
      'SOURCE_INVALID_INPUT',
      'X 源 limit 必须是 1-100 的整数。',
      {
        limit: input.limit,
        operation: 'fetch-timeline',
        provider: 'x',
        sincePostId: input.sincePostId,
        xUserId: input.source.xUserId,
        xUsername: input.source.xUsername,
      },
    );
  }
}

function validateSourceInput(input: SourceProviderValidateSourceInput): void {
  if (!isPresent(input.source.xUsername)) {
    throw new SourceProviderError(
      'SOURCE_INVALID_INPUT',
      'X 源需要 xUsername。',
      {
        operation: 'resolve-account',
        provider: 'x',
        xUsername: input.source.xUsername,
      },
    );
  }
}

function normalizeTimelinePosts(
  response: XApiTimelineResponse,
  account: SourceProviderAccount,
): StandardizedPost[] {
  if (response.data === undefined) {
    return [];
  }

  return response.data.map((tweet) => normalizeTweet(tweet, account));
}

function normalizeTweet(tweet: XApiTweet, account: SourceProviderAccount): StandardizedPost {
  if (!isPresent(tweet.id) || !isPresent(tweet.text) || !isPresent(tweet.created_at)) {
    throw new SourceProviderError(
      'SOURCE_RESPONSE_INVALID',
      'X 时间线响应缺少必要字段。',
      {
        operation: 'fetch-timeline',
        provider: 'x',
        xUserId: account.sourceId,
        xUsername: account.sourceLabel,
      },
    );
  }

  return {
    author: account,
    isReply: hasReferenceType(tweet, 'replied_to'),
    isRepost: hasReferenceType(tweet, 'retweeted'),
    permalinkUrl: `https://x.com/${account.sourceLabel}/status/${tweet.id}`,
    postedAt: tweet.created_at,
    rawPayload: tweet,
    textContent: tweet.text,
    xPostId: tweet.id,
  };
}

function hasReferenceType(tweet: XApiTweet, type: 'replied_to' | 'retweeted'): boolean {
  return tweet.referenced_tweets?.some((reference) => reference.type === type) ?? false;
}

function isPresent(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
