import type {
  SourceProvider,
  SourceProviderAccount,
  SourceProviderFetchInput,
  SourceProviderFetchResult,
  SourceProviderValidateAccountInput,
  StandardizedPost,
} from '../types';
import type { XApiTimelineResponse, XApiTweet } from '../types/x-api';
import { SourceProviderError } from './source-provider-error';
import { XTimelineClient, type XTimelineClientOptions } from './x-timeline-client';

export interface XSourceProviderOptions extends XTimelineClientOptions {}

export class XSourceProvider implements SourceProvider {
  private readonly timelineClient: XTimelineClient;

  public constructor(options: XSourceProviderOptions) {
    this.timelineClient = new XTimelineClient(options);
  }

  public async fetchPosts(input: SourceProviderFetchInput): Promise<SourceProviderFetchResult> {
    validateFetchInput(input);

    const account = await this.timelineClient.resolveAccount({
      xUserId: input.xUserId,
      xUsername: input.xUsername,
    });
    const timelineResponse = await this.timelineClient.fetchTimeline({
      limit: input.limit,
      sincePostId: input.sincePostId,
      xUserId: account.xUserId,
      xUsername: account.xUsername,
    });
    const standardizedAccount: SourceProviderAccount = {
      displayName: account.displayName,
      xUserId: account.xUserId,
      xUsername: account.xUsername,
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

  public async validateAccount(
    input: SourceProviderValidateAccountInput,
  ): Promise<SourceProviderAccount> {
    validateAccountInput(input);

    const account = await this.timelineClient.resolveAccount({
      xUsername: input.xUsername,
    });

    return {
      displayName: account.displayName,
      xUserId: account.xUserId,
      xUsername: account.xUsername,
    };
  }
}

export function createXSourceProvider(options: XSourceProviderOptions): SourceProvider {
  return new XSourceProvider(options);
}

function validateFetchInput(input: SourceProviderFetchInput): void {
  if (!isPresent(input.xUsername) && !isPresent(input.xUserId)) {
    throw new SourceProviderError(
      'SOURCE_INVALID_INPUT',
      'SourceProvider requires xUsername or xUserId.',
      {
        limit: input.limit,
        operation: 'resolve-account',
        provider: 'x',
        sincePostId: input.sincePostId,
        xUserId: input.xUserId,
        xUsername: input.xUsername,
      },
    );
  }

  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
    throw new SourceProviderError(
      'SOURCE_INVALID_INPUT',
      'SourceProvider limit must be an integer between 1 and 100.',
      {
        limit: input.limit,
        operation: 'fetch-timeline',
        provider: 'x',
        sincePostId: input.sincePostId,
        xUserId: input.xUserId,
        xUsername: input.xUsername,
      },
    );
  }
}

function validateAccountInput(input: SourceProviderValidateAccountInput): void {
  if (!isPresent(input.xUsername)) {
    throw new SourceProviderError(
      'SOURCE_INVALID_INPUT',
      'SourceProvider requires xUsername.',
      {
        operation: 'resolve-account',
        provider: 'x',
        xUsername: input.xUsername,
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
      'X timeline response did not include required tweet fields.',
      {
        operation: 'fetch-timeline',
        provider: 'x',
        xUserId: account.xUserId,
        xUsername: account.xUsername,
      },
    );
  }

  return {
    author: account,
    isReply: hasReferenceType(tweet, 'replied_to'),
    isRepost: hasReferenceType(tweet, 'retweeted'),
    permalinkUrl: `https://x.com/${account.xUsername}/status/${tweet.id}`,
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
