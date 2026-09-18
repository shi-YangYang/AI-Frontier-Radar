export type SourceType =
  | 'ai2_blog'
  | 'anthropic_news'
  | 'github'
  | 'hf_papers'
  | 'meta_ai_blog'
  | 'moonshot_blog'
  | 'rss'
  | 'x'
  | 'xai_news';

export interface SourceDescriptor {
  sourceType: SourceType;
  sourceUrl?: string;
  xUserId?: string;
  xUsername?: string;
}

export interface SourceProviderFetchInput {
  limit: number;
  sincePostId?: string;
  source: SourceDescriptor;
}

export interface SourceProviderValidateSourceInput {
  source: SourceDescriptor;
}

export interface SourceProviderAccount {
  displayName?: string;
  sourceId: string;
  sourceLabel: string;
}

export interface StandardizedPost {
  author: SourceProviderAccount;
  dedupeKey?: string;
  title?: string;
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
  provider: SourceType;
  requestedLimit: number;
  resolvedBy: 'sourceUrl' | 'xUserId' | 'xUsername';
  sincePostId?: string;
}

export interface SourceProviderFetchResult {
  account: SourceProviderAccount;
  meta: SourceProviderFetchMeta;
  posts: StandardizedPost[];
}

export interface SourceProvider {
  readonly firstRunBaseline?: 'all';
  readonly sourceType: SourceType;
  fetchPosts(input: SourceProviderFetchInput): Promise<SourceProviderFetchResult>;
  validateSource(input: SourceProviderValidateSourceInput): Promise<SourceProviderAccount>;
}

export interface SourceProviderRegistry {
  get(sourceType: SourceType): SourceProvider;
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
  provider: SourceType;
  responseBodySnippet?: string;
  sincePostId?: string;
  sourceUrl?: string;
  statusCode?: number;
  xUserId?: string;
  xUsername?: string;
}
