import { createHash } from 'node:crypto';

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

export interface AnthropicNewsSourceProviderOptions {
  fetchImplementation?: FetchImplementation;
  proxyUrl?: string;
  timeoutMs?: number;
  userAgent?: string;
}

interface AnthropicNewsEntry {
  category?: string;
  publishedAt: string;
  slug: string;
  summary?: string;
  title: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_USER_AGENT =
  'AI-Frontier-Radar/0.1 (+https://github.com/shi-YangYang/AI-Frontier-Radar)';
const ANTHROPIC_NEWS_ORIGIN = 'https://www.anthropic.com';
const MAX_POSTS = 100;

export class AnthropicNewsSourceProvider implements SourceProvider {
  public readonly sourceType = 'anthropic_news' as const;
  public readonly firstRunBaseline = 'all' as const;
  private readonly fetchImplementation: FetchImplementation;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  public constructor(options: AnthropicNewsSourceProviderOptions = {}) {
    this.fetchImplementation = options.fetchImplementation ?? createFetchWithProxy(options.proxyUrl);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  }

  public async fetchPosts(input: SourceProviderFetchInput): Promise<SourceProviderFetchResult> {
    const sourceUrl = normalizeSourceUrl(input.source.sourceUrl);
    const fetchedAt = new Date().toISOString();
    const html = await this.fetchHtml(sourceUrl);
    const entries = parseNewsEntries(html);

    if (entries.length === 0) {
      throw new SourceProviderError(
        'SOURCE_RESPONSE_INVALID',
        'Anthropic news page did not contain any articles.',
        {
          endpoint: sourceUrl,
          operation: 'fetch-timeline',
          provider: 'anthropic_news',
          responseBodySnippet: html.slice(0, 500),
          sourceUrl,
        },
      );
    }

    const account = buildNewsAccount(sourceUrl);
    const posts = entries.slice(0, MAX_POSTS).map((entry) => toNewsPost(entry, account, fetchedAt));

    return {
      account,
      meta: {
        newestPostId: posts[0]?.xPostId,
        oldestPostId: posts.at(-1)?.xPostId,
        provider: 'anthropic_news',
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
    const entries = parseNewsEntries(html);

    if (entries.length === 0) {
      throw new SourceProviderError(
        'SOURCE_RESPONSE_INVALID',
        'Anthropic news page did not contain any articles.',
        {
          endpoint: sourceUrl,
          operation: 'resolve-account',
          provider: 'anthropic_news',
          responseBodySnippet: html.slice(0, 500),
          sourceUrl,
        },
      );
    }

    return buildNewsAccount(sourceUrl);
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
          `Anthropic news page was not found (HTTP ${response.status}).`,
          {
            endpoint: sourceUrl,
            operation: 'fetch-timeline',
            provider: 'anthropic_news',
            sourceUrl,
            statusCode: response.status,
          },
        );
      }

      if (!response.ok) {
        throw new SourceProviderError(
          'SOURCE_REQUEST_FAILED',
          `Anthropic news page request failed (HTTP ${response.status}).`,
          {
            endpoint: sourceUrl,
            operation: 'fetch-timeline',
            provider: 'anthropic_news',
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
        'Anthropic news page request failed.',
        {
          causeMessage: error instanceof Error ? error.message : String(error),
          endpoint: sourceUrl,
          operation: 'fetch-timeline',
          provider: 'anthropic_news',
          sourceUrl,
        },
        error,
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

export function createAnthropicNewsSourceProvider(
  options: AnthropicNewsSourceProviderOptions = {},
): SourceProvider {
  return new AnthropicNewsSourceProvider(options);
}

function normalizeSourceUrl(rawUrl: string | undefined): string {
  const value = rawUrl?.trim() ?? '';

  if (value.length === 0) {
    throw new SourceProviderError(
      'SOURCE_INVALID_INPUT',
      'Anthropic news source requires a sourceUrl.',
      {
        operation: 'resolve-account',
        provider: 'anthropic_news',
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
      'Anthropic news source requires a valid http/https URL.',
      {
        operation: 'resolve-account',
        provider: 'anthropic_news',
        sourceUrl: value,
      },
    );
  }
}

function buildNewsAccount(sourceUrl: string): SourceProviderAccount {
  const label = 'Anthropic News';

  return {
    displayName: label,
    sourceId: `anthropic:${toHashDigits(sourceUrl)}`,
    sourceLabel: label,
  };
}

function parseNewsEntries(html: string): AnthropicNewsEntry[] {
  const entries: AnthropicNewsEntry[] = [];
  const seenSlugs = new Set<string>();
  const anchorPattern = /<a[^>]+href="\/news\/([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/gu;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html)) !== null) {
    const slug = match[1] ?? '';
    const block = match[2] ?? '';

    if (slug.length === 0 || seenSlugs.has(slug)) {
      continue;
    }

    const title =
      cleanText(/<h4[^>]*>([\s\S]*?)<\/h4>/u.exec(block)?.[1] ?? '') ||
      cleanText(/<span[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/span>/u.exec(block)?.[1] ?? '');

    if (title.length === 0) {
      continue;
    }

    seenSlugs.add(slug);
    entries.push({
      category:
        cleanText(
          /<span[^>]*class="[^"]*(?:subject|caption)[^"]*"[^>]*>([\s\S]*?)<\/span>/u.exec(block)?.[1] ??
            '',
        ) || undefined,
      publishedAt: resolveEntryDate(cleanText(/<time[^>]*>([\s\S]*?)<\/time>/u.exec(block)?.[1] ?? '')),
      slug,
      summary: cleanText(/<p[^>]*>([\s\S]*?)<\/p>/u.exec(block)?.[1] ?? '') || undefined,
      title,
    });
  }

  return entries.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

function resolveEntryDate(text: string): string {
  if (text.length > 0) {
    const timestamp = Date.parse(text);

    if (Number.isFinite(timestamp)) {
      return new Date(timestamp).toISOString();
    }
  }

  return new Date().toISOString();
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&#x([0-9a-fA-F]+);/gu, (_, hex: string) => toCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/gu, (_, decimal: string) => toCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/\s+/gu, ' ')
    .trim();
}

function toCodePoint(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0x10ffff) {
    return '';
  }

  return String.fromCodePoint(value);
}

function toNewsPost(
  entry: AnthropicNewsEntry,
  account: SourceProviderAccount,
  fetchedAt: string,
): StandardizedPost {
  const sections = [entry.title];

  if (entry.summary !== undefined) {
    sections.push(entry.summary);
  }

  if (entry.category !== undefined) {
    sections.push(entry.category);
  }

  return {
    author: account,
    dedupeKey: `anthropic:news:${entry.slug}`,
    isReply: false,
    isRepost: false,
    permalinkUrl: `${ANTHROPIC_NEWS_ORIGIN}/news/${entry.slug}`,
    postedAt: entry.publishedAt,
    rawPayload: entry,
    textContent: sections.join('\n\n'),
    xPostId: `${String(Date.parse(entry.publishedAt) || Date.now()).padStart(16, '0')}${toHashDigits(entry.slug)}`,
  };
}

function toHashDigits(value: string): string {
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 8);

  return String(Number.parseInt(digest, 16) % 100_000_000).padStart(8, '0');
}
