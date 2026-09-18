import type {
  SourceProvider,
  SourceProviderAccount,
  SourceProviderFetchInput,
  SourceProviderFetchResult,
  SourceProviderValidateSourceInput,
  StandardizedPost,
} from '../types';
import { createFetchWithProxy, type FetchImplementation } from './fetch-with-proxy';
import { SourceProviderError } from './source-provider-error';
import {
  cleanHtmlText,
  resolvePublishedAt,
  toNewsPost,
  type NewsEntry,
} from './source-news-utils';

export interface Ai2BlogSourceProviderOptions {
  fetchImplementation?: FetchImplementation;
  proxyUrl?: string;
  timeoutMs?: number;
  userAgent?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_USER_AGENT =
  'AI-Frontier-Radar/0.1 (+https://github.com/shi-YangYang/AI-Frontier-Radar)';
const AI2_ORIGIN = 'https://allenai.org';
const DEDUPE_PREFIX = 'ai2:blog:';
const MAX_POSTS = 100;
const MONTH_PATTERN =
  '(?:January|February|March|April|May|June|July|August|September|October|November|December)';

export class Ai2BlogSourceProvider implements SourceProvider {
  public readonly sourceType = 'ai2_blog' as const;
  private readonly fetchImplementation: FetchImplementation;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  public constructor(options: Ai2BlogSourceProviderOptions = {}) {
    this.fetchImplementation = options.fetchImplementation ?? createFetchWithProxy(options.proxyUrl);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  }

  public async fetchPosts(input: SourceProviderFetchInput): Promise<SourceProviderFetchResult> {
    const sourceUrl = normalizeSourceUrl(input.source.sourceUrl);
    const fetchedAt = new Date().toISOString();
    const html = await this.fetchHtml(sourceUrl);
    const entries = parseAi2BlogHtml(html, fetchedAt);

    if (entries.length === 0) {
      throw new SourceProviderError(
        'SOURCE_RESPONSE_INVALID',
        'AI2 博客页未解析到文章。',
        {
          endpoint: sourceUrl,
          operation: 'fetch-timeline',
          provider: 'ai2_blog',
          responseBodySnippet: html.slice(0, 500),
          sourceUrl,
        },
      );
    }

    const account = buildBlogAccount();
    const posts = entries.slice(0, MAX_POSTS).map((entry) =>
      toNewsPost(entry, account, `${AI2_ORIGIN}/blog/${entry.slug}`, DEDUPE_PREFIX),
    );

    return {
      account,
      meta: {
        newestPostId: posts[0]?.xPostId,
        oldestPostId: posts.at(-1)?.xPostId,
        provider: 'ai2_blog',
        requestedLimit: input.limit,
        resolvedBy: 'sourceUrl',
        sincePostId: input.sincePostId,
      },
      posts,
    };
  }

  public async validateSource(
    input: SourceProviderValidateSourceInput,
  ): Promise<SourceProviderAccount> {
    const sourceUrl = normalizeSourceUrl(input.source.sourceUrl);
    const html = await this.fetchHtml(sourceUrl);

    if (parseAi2BlogHtml(html, new Date().toISOString()).length === 0) {
      throw new SourceProviderError(
        'SOURCE_RESPONSE_INVALID',
        'AI2 博客页未解析到文章。',
        {
          endpoint: sourceUrl,
          operation: 'resolve-account',
          provider: 'ai2_blog',
          responseBodySnippet: html.slice(0, 500),
          sourceUrl,
        },
      );
    }

    return buildBlogAccount();
  }

  private async fetchHtml(sourceUrl: string): Promise<string> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImplementation(sourceUrl, {
        headers: {
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': this.userAgent,
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      if (response.status === 404 || response.status === 410) {
        throw new SourceProviderError(
          'SOURCE_ACCOUNT_NOT_FOUND',
          `AI2 博客页不存在（HTTP ${response.status}）。`,
          {
            endpoint: sourceUrl,
            operation: 'fetch-timeline',
            provider: 'ai2_blog',
            sourceUrl,
            statusCode: response.status,
          },
        );
      }

      if (!response.ok) {
        throw new SourceProviderError(
          'SOURCE_REQUEST_FAILED',
          `AI2 博客页请求失败（HTTP ${response.status}）。`,
          {
            endpoint: sourceUrl,
            operation: 'fetch-timeline',
            provider: 'ai2_blog',
            sourceUrl,
            statusCode: response.status,
          },
        );
      }

      return await response.text();
    } catch (error) {
      if (error instanceof SourceProviderError) {
        throw error;
      }

      throw new SourceProviderError(
        'SOURCE_REQUEST_FAILED',
        'AI2 博客页请求失败。',
        {
          causeMessage: error instanceof Error ? error.message : String(error),
          endpoint: sourceUrl,
          operation: 'fetch-timeline',
          provider: 'ai2_blog',
          sourceUrl,
        },
        error,
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

export function createAi2BlogSourceProvider(
  options: Ai2BlogSourceProviderOptions = {},
): SourceProvider {
  return new Ai2BlogSourceProvider(options);
}

export function parseAi2BlogHtml(html: string, fetchedAt: string): NewsEntry[] {
  const entries: NewsEntry[] = [];
  const seenSlugs = new Set<string>();
  const chunks = html.split('bd-be-w_2px');

  for (const chunk of chunks) {
    const dateMatch = new RegExp(`>(${MONTH_PATTERN} \\d{1,2}, \\d{4})<`, 'u').exec(chunk);
    const anchorMatch = /href="\/blog\/([a-z0-9-]+)"/u.exec(chunk);
    const titleMatch = /<h2[^>]*>([\s\S]*?)<\/h2>/u.exec(chunk);

    if (dateMatch === null || anchorMatch === null || titleMatch === null) {
      continue;
    }

    const slug = anchorMatch[1] ?? '';
    const title = cleanHtmlText(titleMatch[1] ?? '');

    if (slug.length === 0 || title.length === 0 || seenSlugs.has(slug)) {
      continue;
    }

    seenSlugs.add(slug);
    entries.push({
      publishedAt: resolvePublishedAt(dateMatch[1], fetchedAt),
      slug,
      summary:
        cleanHtmlText(
          /<span class="textStyle_wideCardBlurb[^"]*">([\s\S]*?)<\/span>/u.exec(chunk)?.[1] ?? '',
        ) || undefined,
      title,
    });
  }

  return entries.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

function normalizeSourceUrl(rawUrl: string | undefined): string {
  const value = rawUrl?.trim() ?? '';

  if (value.length === 0) {
    throw new SourceProviderError('SOURCE_INVALID_INPUT', 'AI2 博客源需要 sourceUrl。', {
      operation: 'resolve-account',
      provider: 'ai2_blog',
    });
  }

  try {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }

    return url.toString();
  } catch {
    throw new SourceProviderError(
      'SOURCE_INVALID_INPUT',
      'AI2 博客源需要有效的 http/https URL。',
      {
        operation: 'resolve-account',
        provider: 'ai2_blog',
        sourceUrl: value,
      },
    );
  }
}

function buildBlogAccount(): SourceProviderAccount {
  const label = 'AI2 Blog';

  return {
    displayName: label,
    sourceId: 'ai2:blog',
    sourceLabel: label,
  };
}
