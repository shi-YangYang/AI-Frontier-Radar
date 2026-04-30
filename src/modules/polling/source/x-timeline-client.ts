import { createJsonHttpClient, HttpRequestError, type JsonHttpClient } from '../../../lib/http';
import type { XApiTimelineResponse, XApiUserLookupResponse } from '../types/x-api';
import { SourceProviderError } from './source-provider-error';

interface ResolveAccountInput {
  xUserId?: string;
  xUsername?: string;
}

export interface XResolvedAccount {
  displayName?: string;
  resolvedBy: 'xUserId' | 'xUsername';
  xUserId: string;
  xUsername: string;
}

export interface XTimelineClientOptions {
  apiBaseUrl: string;
  bearerToken: string;
  httpClient?: JsonHttpClient;
  timeoutMs?: number;
}

interface FetchTimelineInput {
  limit: number;
  sincePostId?: string;
  xUserId: string;
  xUsername: string;
}

const USER_FIELDS = 'id,name,username';
const TWEET_FIELDS = 'author_id,conversation_id,created_at,referenced_tweets';

export class XTimelineClient {
  private readonly httpClient: JsonHttpClient;
  private readonly timeoutMs?: number;

  public constructor(options: XTimelineClientOptions) {
    this.timeoutMs = options.timeoutMs;
    this.httpClient =
      options.httpClient ??
      createJsonHttpClient({
        baseUrl: options.apiBaseUrl,
        defaultHeaders: {
          Authorization: `Bearer ${options.bearerToken}`,
        },
        timeoutMs: options.timeoutMs,
      });
  }

  public async resolveAccount(input: ResolveAccountInput): Promise<XResolvedAccount> {
    const normalizedUsername = normalizeUsername(input.xUsername);

    if (normalizedUsername !== undefined) {
      try {
        const response = await this.httpClient.requestJson<XApiUserLookupResponse>({
          path: `/2/users/by/username/${encodeURIComponent(normalizedUsername)}`,
          query: {
            'user.fields': USER_FIELDS,
          },
          timeoutMs: this.timeoutMs,
        });

        return normalizeResolvedAccount(response, {
          operation: 'resolve-account',
          xUsername: normalizedUsername,
        });
      } catch (error) {
        throw mapXRequestError(error, {
          operation: 'resolve-account',
          xUsername: normalizedUsername,
        });
      }
    }

    if (isPresent(input.xUserId)) {
      try {
        const response = await this.httpClient.requestJson<XApiUserLookupResponse>({
          path: `/2/users/${encodeURIComponent(input.xUserId)}`,
          query: {
            'user.fields': USER_FIELDS,
          },
          timeoutMs: this.timeoutMs,
        });

        return normalizeResolvedAccount(response, {
          operation: 'resolve-account',
          xUserId: input.xUserId,
        });
      } catch (error) {
        throw mapXRequestError(error, {
          operation: 'resolve-account',
          xUserId: input.xUserId,
        });
      }
    }

    throw new SourceProviderError(
      'SOURCE_INVALID_INPUT',
      'SourceProvider requires xUsername or xUserId.',
      {
        operation: 'resolve-account',
        provider: 'x',
      },
    );
  }

  public async fetchTimeline(input: FetchTimelineInput): Promise<XApiTimelineResponse> {
    try {
      return await this.httpClient.requestJson<XApiTimelineResponse>({
        path: `/2/users/${encodeURIComponent(input.xUserId)}/tweets`,
        query: {
          max_results: input.limit,
          since_id: input.sincePostId,
          'tweet.fields': TWEET_FIELDS,
        },
        timeoutMs: this.timeoutMs,
      });
    } catch (error) {
      throw mapXRequestError(error, {
        limit: input.limit,
        operation: 'fetch-timeline',
        sincePostId: input.sincePostId,
        xUserId: input.xUserId,
        xUsername: input.xUsername,
      });
    }
  }
}

function normalizeResolvedAccount(
  response: XApiUserLookupResponse,
  context: {
    operation: 'resolve-account';
    xUserId?: string;
    xUsername?: string;
  },
): XResolvedAccount {
  if (response.data === undefined) {
    throw new SourceProviderError(
      'SOURCE_RESPONSE_INVALID',
      'X account lookup response did not include account data.',
      {
        ...context,
        provider: 'x',
      },
    );
  }

  if (!isPresent(response.data.id) || !isPresent(response.data.username)) {
    throw new SourceProviderError(
      'SOURCE_RESPONSE_INVALID',
      'X account lookup response did not include id and username.',
      {
        ...context,
        provider: 'x',
      },
    );
  }

  return {
    displayName: normalizeOptionalString(response.data.name),
    resolvedBy: context.xUsername !== undefined ? 'xUsername' : 'xUserId',
    xUserId: response.data.id,
    xUsername: response.data.username,
  };
}

function mapXRequestError(
  error: unknown,
  context: {
    limit?: number;
    operation: 'fetch-timeline' | 'resolve-account';
    sincePostId?: string;
    xUserId?: string;
    xUsername?: string;
  },
): SourceProviderError {
  if (error instanceof SourceProviderError) {
    return error;
  }

  if (error instanceof HttpRequestError) {
    if (error.statusCode === 401 || error.statusCode === 403) {
      return new SourceProviderError(
        'SOURCE_AUTH_FAILED',
        'X source authentication failed.',
        {
          ...context,
          endpoint: error.url,
          limit: context.limit,
          provider: 'x',
          responseBodySnippet: error.bodySnippet,
          sincePostId: context.sincePostId,
          statusCode: error.statusCode,
          xUserId: context.xUserId,
          xUsername: context.xUsername,
        },
        error,
      );
    }

    if (error.statusCode === 404) {
      return new SourceProviderError(
        'SOURCE_ACCOUNT_NOT_FOUND',
        'The requested X account was not found.',
        {
          ...context,
          endpoint: error.url,
          limit: context.limit,
          provider: 'x',
          responseBodySnippet: error.bodySnippet,
          sincePostId: context.sincePostId,
          statusCode: error.statusCode,
          xUserId: context.xUserId,
          xUsername: context.xUsername,
        },
        error,
      );
    }

    if (error.statusCode === 429) {
      return new SourceProviderError(
        'SOURCE_RATE_LIMITED',
        'The X source rate limited the request.',
        {
          ...context,
          endpoint: error.url,
          limit: context.limit,
          provider: 'x',
          responseBodySnippet: error.bodySnippet,
          sincePostId: context.sincePostId,
          statusCode: error.statusCode,
          xUserId: context.xUserId,
          xUsername: context.xUsername,
        },
        error,
      );
    }

    return new SourceProviderError(
      'SOURCE_REQUEST_FAILED',
      'The X source request failed.',
      {
        ...context,
        causeMessage: error.message,
        endpoint: error.url,
        limit: context.limit,
        provider: 'x',
        responseBodySnippet: error.bodySnippet,
        sincePostId: context.sincePostId,
        statusCode: error.statusCode,
        xUserId: context.xUserId,
        xUsername: context.xUsername,
      },
      error,
    );
  }

  return new SourceProviderError(
    'SOURCE_REQUEST_FAILED',
    'The X source request failed.',
    {
      ...context,
      causeMessage: error instanceof Error ? error.message : String(error),
      provider: 'x',
    },
    error,
  );
}

function normalizeUsername(value: string | undefined): string | undefined {
  if (!isPresent(value)) {
    return undefined;
  }

  return value.replace(/^@/u, '');
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  return isPresent(value) ? value : undefined;
}

function isPresent(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
