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

export interface GithubTrendingSourceProviderOptions {
  fetchImplementation?: FetchImplementation;
  proxyUrl?: string;
  timeoutMs?: number;
  userAgent?: string;
}

interface TrendingRepo {
  description?: string;
  language?: string;
  repoFullName: string;
  stars?: string;
  starsToday?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_USER_AGENT =
  'AI-Frontier-Radar/0.1 (+https://github.com/shi-YangYang/AI-Frontier-Radar)';
const MAX_TRENDING_REPOS = 50;

export class GithubTrendingSourceProvider implements SourceProvider {
  public readonly sourceType = 'github' as const;
  public readonly firstRunBaseline = 'all' as const;
  private readonly fetchImplementation: FetchImplementation;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  public constructor(options: GithubTrendingSourceProviderOptions = {}) {
    this.fetchImplementation = options.fetchImplementation ?? createFetchWithProxy(options.proxyUrl);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  }

  public async fetchPosts(input: SourceProviderFetchInput): Promise<SourceProviderFetchResult> {
    const sourceUrl = normalizeTrendingUrl(input.source.sourceUrl);
    const fetchedAt = new Date().toISOString();
    const html = await this.fetchHtml(sourceUrl);
    const repos = parseTrendingRepos(html).slice(0, MAX_TRENDING_REPOS);
    const account = buildTrendingAccount(sourceUrl);

    if (repos.length === 0) {
      throw new SourceProviderError(
        'SOURCE_RESPONSE_INVALID',
        'GitHub Trending page did not contain any repositories.',
        {
          endpoint: sourceUrl,
          operation: 'fetch-timeline',
          provider: 'github',
          responseBodySnippet: html.slice(0, 500),
          sourceUrl,
        },
      );
    }

    const posts = repos.map((repo) => toTrendingPost(repo, account, fetchedAt));

    return {
      account,
      meta: {
        newestPostId: posts[0]?.xPostId,
        oldestPostId: posts.at(-1)?.xPostId,
        provider: 'github',
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
    const sourceUrl = normalizeTrendingUrl(input.source.sourceUrl);
    const html = await this.fetchHtml(sourceUrl);
    const repos = parseTrendingRepos(html);

    if (repos.length === 0) {
      throw new SourceProviderError(
        'SOURCE_RESPONSE_INVALID',
        'GitHub Trending page did not contain any repositories.',
        {
          endpoint: sourceUrl,
          operation: 'resolve-account',
          provider: 'github',
          responseBodySnippet: html.slice(0, 500),
          sourceUrl,
        },
      );
    }

    return buildTrendingAccount(sourceUrl);
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
          `GitHub Trending page was not found (HTTP ${response.status}).`,
          {
            endpoint: sourceUrl,
            operation: 'fetch-timeline',
            provider: 'github',
            sourceUrl,
            statusCode: response.status,
          },
        );
      }

      if (!response.ok) {
        throw new SourceProviderError(
          'SOURCE_REQUEST_FAILED',
          `GitHub Trending page request failed (HTTP ${response.status}).`,
          {
            endpoint: sourceUrl,
            operation: 'fetch-timeline',
            provider: 'github',
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
        'GitHub Trending page request failed.',
        {
          causeMessage: error instanceof Error ? error.message : String(error),
          endpoint: sourceUrl,
          operation: 'fetch-timeline',
          provider: 'github',
          sourceUrl,
        },
        error,
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

export function createGithubTrendingSourceProvider(
  options: GithubTrendingSourceProviderOptions = {},
): SourceProvider {
  return new GithubTrendingSourceProvider(options);
}

function normalizeTrendingUrl(rawUrl: string | undefined): string {
  const value = rawUrl?.trim() ?? '';

  if (value.length === 0) {
    throw new SourceProviderError(
      'SOURCE_INVALID_INPUT',
      'GitHub Trending source requires a sourceUrl.',
      {
        operation: 'resolve-account',
        provider: 'github',
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
      'GitHub Trending source requires a valid http/https URL.',
      {
        operation: 'resolve-account',
        provider: 'github',
        sourceUrl: value,
      },
    );
  }
}

function buildTrendingAccount(sourceUrl: string): SourceProviderAccount {
  const url = new URL(sourceUrl);
  const since = url.searchParams.get('since');
  const language =
    url.pathname.startsWith('/trending/') && url.pathname.length > '/trending/'.length
      ? decodeURIComponent(url.pathname.slice('/trending/'.length))
      : undefined;
  const periodLabel = since === 'weekly' ? '每周' : since === 'monthly' ? '每月' : '每日';
  const suffix = language === undefined || language.length === 0 ? '' : ` · ${language}`;
  const label = `GitHub Trending · ${periodLabel}${suffix}`;

  return {
    displayName: label,
    sourceId: `github:${toHashDigits(sourceUrl)}`,
    sourceLabel: label,
  };
}

function parseTrendingRepos(html: string): TrendingRepo[] {
  const repos: TrendingRepo[] = [];
  const seenRepos = new Set<string>();
  const articlePattern = /<article[^>]*class="[^"]*Box-row[^"]*"[^>]*>([\s\S]*?)<\/article>/gu;
  let match: RegExpExecArray | null;

  while ((match = articlePattern.exec(html)) !== null) {
    const block = match[1] ?? '';
    const repoMatch = /<h2[^>]*>[\s\S]*?<a[^>]*href="\/([^"?#]+)"/u.exec(block);
    const repoFullName = repoMatch?.[1]?.trim();

    if (repoFullName === undefined || !/^[\w.-]+\/[\w.-]+$/u.test(repoFullName)) {
      continue;
    }

    const normalizedRepo = repoFullName.toLowerCase();

    if (seenRepos.has(normalizedRepo)) {
      continue;
    }

    seenRepos.add(normalizedRepo);
    repos.push({
      description: extractDescription(block),
      language: extractText(block, /itemprop="programmingLanguage"[^>]*>([^<]+)</u),
      repoFullName,
      stars: extractStars(block),
      starsToday: extractText(block, /([\d,]+)\s+stars today/u),
    });
  }

  return repos;
}

function extractDescription(block: string): string | undefined {
  const match =
    /<p[^>]*class="[^"]*col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/u.exec(block) ??
    /<p[^>]*>([\s\S]*?)<\/p>/u.exec(block);
  const text = cleanDescriptionText(stripTags(match?.[1] ?? ''));

  return text.length === 0 ? undefined : text;
}

function cleanDescriptionText(value: string): string {
  return value
    .replace(/^Star\s+[\w.-]+\s*\/\s*[\w.-]+\s*/u, '')
    .replace(/^Star\s+/u, '')
    .trim();
}

function extractStars(block: string): string | undefined {
  const match = /href="\/[^"]+\/stargazers"[^>]*>([\s\S]*?)<\/a>/u.exec(block);
  const text = stripTags(match?.[1] ?? '');
  const digits = /[\d,]+/u.exec(text)?.[0];

  return digits;
}

function extractText(block: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(block);
  const text = stripTags(match?.[1] ?? '');

  return text.length === 0 ? undefined : text;
}

function stripTags(value: string): string {
  return value
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/\s+/gu, ' ')
    .trim();
}

function toTrendingPost(
  repo: TrendingRepo,
  account: SourceProviderAccount,
  fetchedAt: string,
): StandardizedPost {
  const sections = [repo.repoFullName];
  const meta: string[] = [];

  if (repo.stars !== undefined) {
    meta.push(`⭐ ${repo.stars}`);
  }

  if (repo.starsToday !== undefined) {
    meta.push(`今日 +${repo.starsToday}`);
  }

  if (repo.language !== undefined) {
    meta.push(repo.language);
  }

  if (repo.description !== undefined) {
    sections.push(repo.description);
  }

  if (meta.length > 0) {
    sections.push(meta.join(' · '));
  }

  return {
    author: account,
    dedupeKey: `github:trending:${repo.repoFullName.toLowerCase()}`,
    isReply: false,
    isRepost: false,
    permalinkUrl: `https://github.com/${repo.repoFullName}`,
    postedAt: fetchedAt,
    rawPayload: repo,
    textContent: sections.join('\n\n'),
    xPostId: createStablePostId(fetchedAt, repo.repoFullName),
  };
}

function createStablePostId(postedAt: string, guid: string): string {
  const timestamp = Date.parse(postedAt);
  const timestampMs = Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();

  return `${String(timestampMs).padStart(16, '0')}${toHashDigits(guid)}`;
}

function toHashDigits(value: string): string {
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 8);

  return String(Number.parseInt(digest, 16) % 100_000_000).padStart(8, '0');
}
