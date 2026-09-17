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

export interface HfDailyPapersSourceProviderOptions {
  fetchImplementation?: FetchImplementation;
  proxyUrl?: string;
  timeoutMs?: number;
  userAgent?: string;
}

interface HfPaperEntry {
  paper?: {
    authors?: Array<{ name?: string }>;
    id?: string;
    publishedAt?: string;
    submittedOnDailyAt?: string;
    summary?: string;
    title?: string;
    upvotes?: number;
  };
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_USER_AGENT =
  'AI-Frontier-Radar/0.1 (+https://github.com/shi-YangYang/AI-Frontier-Radar)';
const MAX_SUMMARY_LENGTH = 4_000;
const MAX_AUTHORS = 3;
const MAX_PAPERS = 100;

export class HfDailyPapersSourceProvider implements SourceProvider {
  public readonly firstRunBaseline = 'all' as const;
  public readonly sourceType = 'hf_papers' as const;
  private readonly fetchImplementation: FetchImplementation;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  public constructor(options: HfDailyPapersSourceProviderOptions = {}) {
    this.fetchImplementation = options.fetchImplementation ?? createFetchWithProxy(options.proxyUrl);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  }

  public async fetchPosts(input: SourceProviderFetchInput): Promise<SourceProviderFetchResult> {
    const sourceUrl = normalizeApiUrl(input.source.sourceUrl);
    const fetchedAt = new Date().toISOString();
    const entries = await this.fetchEntries(sourceUrl);
    const account = buildPapersAccount(sourceUrl);

    if (entries.length === 0) {
      throw new SourceProviderError(
        'SOURCE_RESPONSE_INVALID',
        'Hugging Face Daily Papers API returned no papers.',
        {
          endpoint: sourceUrl,
          operation: 'fetch-timeline',
          provider: 'hf_papers',
          sourceUrl,
        },
      );
    }

    const posts = entries
      .slice(0, MAX_PAPERS)
      .map((entry) => toPaperPost(entry, account, fetchedAt))
      .filter((post): post is StandardizedPost => post !== null);

    if (posts.length === 0) {
      throw new SourceProviderError(
        'SOURCE_RESPONSE_INVALID',
        'Hugging Face Daily Papers API entries could not be normalized.',
        {
          endpoint: sourceUrl,
          operation: 'fetch-timeline',
          provider: 'hf_papers',
          sourceUrl,
        },
      );
    }

    return {
      account,
      meta: {
        newestPostId: posts[0]?.xPostId,
        oldestPostId: posts.at(-1)?.xPostId,
        provider: 'hf_papers',
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
    const sourceUrl = normalizeApiUrl(input.source.sourceUrl);
    const entries = await this.fetchEntries(sourceUrl);

    if (entries.length === 0) {
      throw new SourceProviderError(
        'SOURCE_RESPONSE_INVALID',
        'Hugging Face Daily Papers API returned no papers.',
        {
          endpoint: sourceUrl,
          operation: 'resolve-account',
          provider: 'hf_papers',
          sourceUrl,
        },
      );
    }

    return buildPapersAccount(sourceUrl);
  }

  private async fetchEntries(sourceUrl: string): Promise<HfPaperEntry[]> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImplementation(sourceUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': this.userAgent,
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      if (response.status === 404 || response.status === 410) {
        throw new SourceProviderError(
          'SOURCE_ACCOUNT_NOT_FOUND',
          `Hugging Face Daily Papers API was not found (HTTP ${response.status}).`,
          {
            endpoint: sourceUrl,
            operation: 'fetch-timeline',
            provider: 'hf_papers',
            sourceUrl,
            statusCode: response.status,
          },
        );
      }

      if (!response.ok) {
        throw new SourceProviderError(
          'SOURCE_REQUEST_FAILED',
          `Hugging Face Daily Papers API request failed (HTTP ${response.status}).`,
          {
            endpoint: sourceUrl,
            operation: 'fetch-timeline',
            provider: 'hf_papers',
            sourceUrl,
            statusCode: response.status,
          },
        );
      }

      const payload: unknown = await response.json();

      if (!Array.isArray(payload)) {
        throw new SourceProviderError(
          'SOURCE_RESPONSE_INVALID',
          'Hugging Face Daily Papers API did not return a JSON array.',
          {
            endpoint: sourceUrl,
            operation: 'fetch-timeline',
            provider: 'hf_papers',
            sourceUrl,
          },
        );
      }

      return payload.filter(isHfPaperEntry);
    } catch (error) {
      if (error instanceof SourceProviderError) {
        throw error;
      }

      throw new SourceProviderError(
        'SOURCE_REQUEST_FAILED',
        'Hugging Face Daily Papers API request failed.',
        {
          causeMessage: error instanceof Error ? error.message : String(error),
          endpoint: sourceUrl,
          operation: 'fetch-timeline',
          provider: 'hf_papers',
          sourceUrl,
        },
        error,
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

export function createHfDailyPapersSourceProvider(
  options: HfDailyPapersSourceProviderOptions = {},
): SourceProvider {
  return new HfDailyPapersSourceProvider(options);
}

function normalizeApiUrl(rawUrl: string | undefined): string {
  const value = rawUrl?.trim() ?? '';

  if (value.length === 0) {
    throw new SourceProviderError(
      'SOURCE_INVALID_INPUT',
      'Hugging Face Daily Papers source requires a sourceUrl.',
      {
        operation: 'resolve-account',
        provider: 'hf_papers',
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
      'Hugging Face Daily Papers source requires a valid http/https URL.',
      {
        operation: 'resolve-account',
        provider: 'hf_papers',
        sourceUrl: value,
      },
    );
  }
}

function buildPapersAccount(sourceUrl: string): SourceProviderAccount {
  const label = 'HF Daily Papers';

  return {
    displayName: label,
    sourceId: `hf:${toHashDigits(sourceUrl)}`,
    sourceLabel: label,
  };
}

function isHfPaperEntry(value: unknown): value is HfPaperEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const paper = (value as { paper?: unknown }).paper;

  return typeof paper === 'object' && paper !== null;
}

function toPaperPost(
  entry: HfPaperEntry,
  account: SourceProviderAccount,
  fetchedAt: string,
): StandardizedPost | null {
  const paper = entry.paper;
  const paperId = paper?.id?.trim();
  const title = paper?.title?.trim();

  if (paperId === undefined || paperId.length === 0 || title === undefined || title.length === 0) {
    return null;
  }

  const sections = [title];
  const summary = truncateText(normalizeWhitespace(paper?.summary), MAX_SUMMARY_LENGTH);

  if (summary !== undefined) {
    sections.push(summary);
  }

  const meta: string[] = [];
  const upvotes = paper?.upvotes;

  if (typeof upvotes === 'number' && Number.isFinite(upvotes)) {
    meta.push(`👍 ${upvotes}`);
  }

  const authorNames = (paper?.authors ?? [])
    .map((author) => author?.name?.trim())
    .filter((name): name is string => name !== undefined && name.length > 0);

  if (authorNames.length > 0) {
    const shown = authorNames.slice(0, MAX_AUTHORS).join(', ');
    const suffix = authorNames.length > MAX_AUTHORS ? ' 等' : '';
    meta.push(`${shown}${suffix}`);
  }

  if (meta.length > 0) {
    sections.push(meta.join(' · '));
  }

  return {
    author: account,
    dedupeKey: `hf:papers:${paperId}`,
    isReply: false,
    isRepost: false,
    permalinkUrl: `https://huggingface.co/papers/${paperId}`,
    postedAt: resolvePostedAt(paper?.submittedOnDailyAt, paper?.publishedAt, fetchedAt),
    rawPayload: entry,
    textContent: sections.join('\n\n'),
    xPostId: `${String(Date.parse(fetchedAt) || Date.now()).padStart(16, '0')}${toHashDigits(paperId)}`,
  };
}

function resolvePostedAt(
  submittedOnDailyAt: string | undefined,
  publishedAt: string | undefined,
  fetchedAt: string,
): string {
  for (const candidate of [submittedOnDailyAt, publishedAt]) {
    if (candidate === undefined) {
      continue;
    }

    const timestamp = Date.parse(candidate);

    if (Number.isFinite(timestamp)) {
      return new Date(timestamp).toISOString();
    }
  }

  return fetchedAt;
}

function normalizeWhitespace(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/gu, ' ').trim();

  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}

function truncateText(value: string | undefined, maxLength: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`;
}

function toHashDigits(value: string): string {
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 8);

  return String(Number.parseInt(digest, 16) % 100_000_000).padStart(8, '0');
}
