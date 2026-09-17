import type {
  SourceProvider,
  SourceProviderAccount,
  SourceProviderFetchInput,
  SourceProviderFetchResult,
  SourceProviderValidateSourceInput,
  StandardizedPost,
} from '../types';
import { BrowserSession, type BrowserSessionOptions } from './browser-session';
import { SourceProviderError } from './source-provider-error';
import {
  cleanHtmlText,
  resolvePublishedAt,
  toNewsPost,
  type NewsEntry,
} from './source-news-utils';

export interface XaiNewsSourceProviderOptions extends BrowserSessionOptions {
  navigationTimeoutMs?: number;
  postLoadTimeoutMs?: number;
  renderSettleTimeoutMs?: number;
  session?: BrowserSession;
}

const DEFAULT_NAVIGATION_TIMEOUT_MS = 45_000;
const DEFAULT_POST_LOAD_TIMEOUT_MS = 20_000;
const DEFAULT_RENDER_SETTLE_TIMEOUT_MS = 2_000;
const XAI_ORIGIN = 'https://x.ai';
const DEDUPE_PREFIX = 'xai:news:';
const MAX_POSTS = 100;
const DATE_PATTERN = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}, \d{4}/u;

export class XaiNewsSourceProvider implements SourceProvider {
  public readonly sourceType = 'xai_news' as const;
  public readonly firstRunBaseline = 'all' as const;
  private readonly navigationTimeoutMs: number;
  private readonly postLoadTimeoutMs: number;
  private readonly renderSettleTimeoutMs: number;
  private readonly session: BrowserSession;

  public constructor(options: XaiNewsSourceProviderOptions = {}) {
    this.navigationTimeoutMs = options.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS;
    this.postLoadTimeoutMs = options.postLoadTimeoutMs ?? DEFAULT_POST_LOAD_TIMEOUT_MS;
    this.renderSettleTimeoutMs = options.renderSettleTimeoutMs ?? DEFAULT_RENDER_SETTLE_TIMEOUT_MS;
    this.session = options.session ?? new BrowserSession(options);
  }

  public async fetchPosts(input: SourceProviderFetchInput): Promise<SourceProviderFetchResult> {
    const sourceUrl = normalizeSourceUrl(input.source.sourceUrl);
    const fetchedAt = new Date().toISOString();
    const { bodySnippet, html } = await this.renderNewsPage(sourceUrl);
    const entries = parseXaiNewsHtml(html, fetchedAt);

    if (entries.length === 0) {
      throw new SourceProviderError(
        'SOURCE_RESPONSE_INVALID',
        'xAI news page did not render any posts.',
        {
          endpoint: sourceUrl,
          operation: 'fetch-timeline',
          provider: 'xai_news',
          responseBodySnippet: bodySnippet,
          sourceUrl,
        },
      );
    }

    const account = buildNewsAccount();
    const posts = entries.slice(0, MAX_POSTS).map((entry) =>
      toNewsPost(entry, account, `${XAI_ORIGIN}/news/${entry.slug}`, DEDUPE_PREFIX),
    );

    return {
      account,
      meta: {
        newestPostId: posts[0]?.xPostId,
        oldestPostId: posts.at(-1)?.xPostId,
        provider: 'xai_news',
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
    const { bodySnippet, html } = await this.renderNewsPage(sourceUrl);

    if (parseXaiNewsHtml(html, new Date().toISOString()).length === 0) {
      throw new SourceProviderError(
        'SOURCE_RESPONSE_INVALID',
        'xAI news page did not render any posts.',
        {
          endpoint: sourceUrl,
          operation: 'resolve-account',
          provider: 'xai_news',
          responseBodySnippet: bodySnippet,
          sourceUrl,
        },
      );
    }

    return buildNewsAccount();
  }

  private async renderNewsPage(
    sourceUrl: string,
  ): Promise<{ bodySnippet: string; html: string }> {
    try {
      return await this.session.withPage(async (page) => {
        await page.goto(sourceUrl, {
          timeout: this.navigationTimeoutMs,
          waitUntil: 'domcontentloaded',
        });
        await page
          .waitForSelector('a[href^="/news/"]', { timeout: this.postLoadTimeoutMs })
          .catch(() => undefined);
        await page.waitForTimeout(this.renderSettleTimeoutMs);

        const html = await page.content();
        const bodyText = await page
          .locator('body')
          .innerText({ timeout: 2_000 })
          .then((value) => value ?? '')
          .catch(() => '');

        return { bodySnippet: bodyText.replace(/\s+/gu, ' ').slice(0, 500), html };
      });
    } catch (error) {
      if (error instanceof SourceProviderError) {
        throw error;
      }

      throw new SourceProviderError(
        'SOURCE_REQUEST_FAILED',
        'xAI news page render failed.',
        {
          causeMessage: error instanceof Error ? error.message : String(error),
          endpoint: sourceUrl,
          operation: 'fetch-timeline',
          provider: 'xai_news',
          sourceUrl,
        },
        error,
      );
    }
  }
}

export function createXaiNewsSourceProvider(
  options: XaiNewsSourceProviderOptions = {},
): SourceProvider {
  return new XaiNewsSourceProvider(options);
}

export function parseXaiNewsHtml(html: string, fetchedAt: string): NewsEntry[] {
  const entries: NewsEntry[] = [];
  const seenSlugs = new Set<string>();
  const anchorPattern = /<a[^>]+href="\/news\/([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/gu;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html)) !== null) {
    const slug = match[1] ?? '';
    const block = match[2] ?? '';

    if (slug.length === 0 || seenSlugs.has(slug)) {
      continue;
    }

    const title = cleanHtmlText(
      /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/u.exec(block)?.[1] ?? '',
    );

    if (title.length === 0) {
      continue;
    }

    seenSlugs.add(slug);
    const dateText =
      cleanHtmlText(/<time[^>]*>([\s\S]*?)<\/time>/u.exec(block)?.[1] ?? '') ||
      cleanHtmlText(firstMatchingParagraph(block, DATE_PATTERN));
    const summary = firstMatchingParagraph(block, DATE_PATTERN, true);

    entries.push({
      category: resolveCategory(block, title),
      publishedAt: resolvePublishedAt(dateText, fetchedAt),
      slug,
      summary: summary.length > 0 ? summary : undefined,
      title,
    });
  }

  return entries.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

function firstMatchingParagraph(
  block: string,
  pattern: RegExp | undefined,
  invert = false,
): string {
  const paragraphPattern = /<p[^>]*>([\s\S]*?)<\/p>/gu;
  let match: RegExpExecArray | null;

  while ((match = paragraphPattern.exec(block)) !== null) {
    const text = cleanHtmlText(match[1] ?? '');

    if (text.length === 0) {
      continue;
    }

    const matches = pattern === undefined ? true : pattern.test(text);

    if (invert ? !matches : matches) {
      return text;
    }
  }

  return '';
}

function resolveCategory(block: string, title: string): string | undefined {
  const spanPattern = /<span[^>]*>([\s\S]*?)<\/span>/gu;
  let match: RegExpExecArray | null;

  while ((match = spanPattern.exec(block)) !== null) {
    const text = cleanHtmlText(match[1] ?? '');

    if (
      text.length === 0 ||
      text === '·' ||
      text === 'Read More' ||
      text === title ||
      DATE_PATTERN.test(text)
    ) {
      continue;
    }

    return text;
  }

  return undefined;
}

function normalizeSourceUrl(rawUrl: string | undefined): string {
  const value = rawUrl?.trim() ?? '';

  if (value.length === 0) {
    throw new SourceProviderError('SOURCE_INVALID_INPUT', 'xAI news source requires a sourceUrl.', {
      operation: 'resolve-account',
      provider: 'xai_news',
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
      'xAI news source requires a valid http/https URL.',
      {
        operation: 'resolve-account',
        provider: 'xai_news',
        sourceUrl: value,
      },
    );
  }
}

function buildNewsAccount(): SourceProviderAccount {
  const label = 'xAI News';

  return {
    displayName: label,
    sourceId: 'xai:news',
    sourceLabel: label,
  };
}
