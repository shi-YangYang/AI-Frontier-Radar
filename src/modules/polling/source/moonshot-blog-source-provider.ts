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

export interface MoonshotBlogSourceProviderOptions {
  fetchImplementation?: FetchImplementation;
  proxyUrl?: string;
  timeoutMs?: number;
  userAgent?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_USER_AGENT =
  'AI-Frontier-Radar/0.1 (+https://github.com/shi-YangYang/AI-Frontier-Radar)';
const MOONSHOT_ORIGIN = 'https://platform.moonshot.cn';
const DEDUPE_PREFIX = 'moonshot:blog:';
const MAX_POSTS = 100;

export class MoonshotBlogSourceProvider implements SourceProvider {
  public readonly sourceType = 'moonshot_blog' as const;
  private readonly fetchImplementation: FetchImplementation;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  public constructor(options: MoonshotBlogSourceProviderOptions = {}) {
    this.fetchImplementation = options.fetchImplementation ?? createFetchWithProxy(options.proxyUrl);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  }

  public async fetchPosts(input: SourceProviderFetchInput): Promise<SourceProviderFetchResult> {
    const sourceUrl = normalizeSourceUrl(input.source.sourceUrl);
    const fetchedAt = new Date().toISOString();
    const html = await this.fetchHtml(sourceUrl);
    const entries = parseMoonshotBlogHtml(html, fetchedAt);

    if (entries.length === 0) {
      throw new SourceProviderError(
        'SOURCE_RESPONSE_INVALID',
        'Moonshot blog page did not contain any posts.',
        {
          endpoint: sourceUrl,
          operation: 'fetch-timeline',
          provider: 'moonshot_blog',
          responseBodySnippet: html.slice(0, 500),
          sourceUrl,
        },
      );
    }

    const account = buildBlogAccount();
    const posts = entries.slice(0, MAX_POSTS).map((entry) =>
      toNewsPost(entry, account, `${MOONSHOT_ORIGIN}/blog/posts/${entry.slug}`, DEDUPE_PREFIX),
    );

    return {
      account,
      meta: {
        newestPostId: posts[0]?.xPostId,
        oldestPostId: posts.at(-1)?.xPostId,
        provider: 'moonshot_blog',
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

    if (parseMoonshotBlogHtml(html, new Date().toISOString()).length === 0) {
      throw new SourceProviderError(
        'SOURCE_RESPONSE_INVALID',
        'Moonshot blog page did not contain any posts.',
        {
          endpoint: sourceUrl,
          operation: 'resolve-account',
          provider: 'moonshot_blog',
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
          `Moonshot blog page was not found (HTTP ${response.status}).`,
          {
            endpoint: sourceUrl,
            operation: 'fetch-timeline',
            provider: 'moonshot_blog',
            sourceUrl,
            statusCode: response.status,
          },
        );
      }

      if (!response.ok) {
        throw new SourceProviderError(
          'SOURCE_REQUEST_FAILED',
          `Moonshot blog page request failed (HTTP ${response.status}).`,
          {
            endpoint: sourceUrl,
            operation: 'fetch-timeline',
            provider: 'moonshot_blog',
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
        'Moonshot blog page request failed.',
        {
          causeMessage: error instanceof Error ? error.message : String(error),
          endpoint: sourceUrl,
          operation: 'fetch-timeline',
          provider: 'moonshot_blog',
          sourceUrl,
        },
        error,
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

export function createMoonshotBlogSourceProvider(
  options: MoonshotBlogSourceProviderOptions = {},
): SourceProvider {
  return new MoonshotBlogSourceProvider(options);
}

export function parseMoonshotBlogHtml(html: string, fetchedAt: string): NewsEntry[] {
  const entries: NewsEntry[] = [];
  const seenSlugs = new Set<string>();
  const chunks = html.split('class="post-item"');

  for (const chunk of chunks.slice(1)) {
    const anchorMatch =
      /<h3>\s*<a[^>]*href="\/blog\/posts\/([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h3>/u.exec(chunk);
    const timeMatch = /<time[^>]*dateTime="([^"]+)"[^>]*>/u.exec(chunk);
    const slug = anchorMatch?.[1] ?? '';
    const title = cleanHtmlText(anchorMatch?.[2] ?? '');

    if (slug.length === 0 || title.length === 0 || seenSlugs.has(slug)) {
      continue;
    }

    seenSlugs.add(slug);
    entries.push({
      publishedAt: resolvePublishedAt(timeMatch?.[1], fetchedAt),
      slug,
      title,
    });
  }

  return entries.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

function normalizeSourceUrl(rawUrl: string | undefined): string {
  const value = rawUrl?.trim() ?? '';

  if (value.length === 0) {
    throw new SourceProviderError(
      'SOURCE_INVALID_INPUT',
      'Moonshot blog source requires a sourceUrl.',
      {
        operation: 'resolve-account',
        provider: 'moonshot_blog',
      },
    );
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
      'Moonshot blog source requires a valid http/https URL.',
      {
        operation: 'resolve-account',
        provider: 'moonshot_blog',
        sourceUrl: value,
      },
    );
  }
}

function buildBlogAccount(): SourceProviderAccount {
  const label = 'Moonshot Blog';

  return {
    displayName: label,
    sourceId: 'moonshot:blog',
    sourceLabel: label,
  };
}
