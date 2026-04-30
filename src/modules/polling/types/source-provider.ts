export interface SourceProviderFetchInput {
  limit: number;
  sincePostId?: string;
  xUserId?: string;
  xUsername?: string;
}

export interface SourceProviderAccount {
  displayName?: string;
  xUserId: string;
  xUsername: string;
}

export interface StandardizedPost {
  author: SourceProviderAccount;
  isReply: boolean;
  isRepost: boolean;
  permalinkUrl: string;
  postedAt: string;
  rawPayload: unknown;
  textContent: string;
  xPostId: string;
}

export interface SourceProviderFetchMeta {
  newestPostId?: string;
  oldestPostId?: string;
  provider: 'x';
  requestedLimit: number;
  resolvedBy: 'xUserId' | 'xUsername';
  sincePostId?: string;
}

export interface SourceProviderFetchResult {
  account: SourceProviderAccount;
  meta: SourceProviderFetchMeta;
  posts: StandardizedPost[];
}

export interface SourceProvider {
  fetchPosts(input: SourceProviderFetchInput): Promise<SourceProviderFetchResult>;
}

export type SourceProviderErrorCode =
  | 'SOURCE_ACCOUNT_NOT_FOUND'
  | 'SOURCE_AUTH_FAILED'
  | 'SOURCE_INVALID_INPUT'
  | 'SOURCE_RATE_LIMITED'
  | 'SOURCE_REQUEST_FAILED'
  | 'SOURCE_RESPONSE_INVALID';

export interface SourceProviderErrorDiagnostics {
  causeMessage?: string;
  endpoint?: string;
  limit?: number;
  operation: 'fetch-timeline' | 'resolve-account';
  provider: 'x';
  responseBodySnippet?: string;
  sincePostId?: string;
  statusCode?: number;
  xUserId?: string;
  xUsername?: string;
}
