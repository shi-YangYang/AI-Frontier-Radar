import type { Page } from 'playwright';

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
import { resolvePublishedAt, toNewsPost, type NewsEntry } from './source-news-utils';

export interface MetaAiBlogSourceProviderOptions extends BrowserSessionOptions {
  navigationTimeoutMs?: number;
  postLoadTimeoutMs?: number;
  renderSettleTimeoutMs?: number;
  session?: BrowserSession;
}

export interface MetaBlogRawEntry {
  dateText?: string;
  href: string;
  title: string;
}

const DEFAULT_NAVIGATION_TIMEOUT_MS = 45_000;
const DEFAULT_POST_LOAD_TIMEOUT_MS = 20_000;
const DEFAULT_RENDER_SETTLE_TIMEOUT_MS = 2_000;
const META_ORIGIN = 'https://ai.meta.com';
const DEDUPE_PREFIX = 'meta:blog:';
const MAX_POSTS = 100;

export class MetaAiBlogSourceProvider implements SourceProvider {
  public readonly sourceType = 'meta_ai_blog' as const;
  public readonly firstRunBaseline = 'all' as const;
  private readonly navigationTimeoutMs: number;
  private readonly postLoadTimeoutMs: number;
  private readonly renderSettleTimeoutMs: number;
  private readonly session: BrowserSession;

  public constructor(options: MetaAiBlogSourceProviderOptions = {}) {
    this.navigationTimeoutMs = options.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS;
    this.postLoadTimeoutMs = options.postLoadTimeoutMs ?? DEFAULT_POST_LOAD_TIMEOUT_MS;
    this.renderSettleTimeoutMs = options.renderSettleTimeoutMs ?? DEFAULT_RENDER_SETTLE_TIMEOUT_MS;
    this.session = options.session ?? new BrowserSession(options);
  }

  public async fetchPosts(input: SourceProviderFetchInput): Promise<SourceProviderFetchResult> {
    const sourceUrl = normalizeSourceUrl(input.source.sourceUrl);
    const fetchedAt = new Date().toISOString();
    const { bodySnippet, rawEntries } = await this.renderBlogPage(sourceUrl);
    const entries = normalizeMetaBlogRawEntries(rawEntries, fetchedAt);

    if (entries.length === 0) {
      throw new SourceProviderError(
        'SOURCE_RESPONSE_INVALID',
        'AI at Meta blog page did not render any posts.',
        {
          endpoint: sourceUrl,
          operation: 'fetch-timeline',
          provider: 'meta_ai_blog',
          responseBodySnippet: bodySnippet,
          sourceUrl,
        },
      );
    }

    const account = buildBlogAccount();
    const posts = entries.slice(0, MAX_POSTS).map((entry) =>
      toNewsPost(entry, account, `${META_ORIGIN}/blog/${entry.slug}/`, DEDUPE_PREFIX),
    );

    return {
      account,
      meta: {
        newestPostId: posts[0]?.xPostId,
        oldestPostId: posts.at(-1)?.xPostId,
        provider: 'meta_ai_blog',
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
    const { bodySnippet, rawEntries } = await this.renderBlogPage(sourceUrl);

    if (normalizeMetaBlogRawEntries(rawEntries, new Date().toISOString()).length === 0) {
      throw new SourceProviderError(
        'SOURCE_RESPONSE_INVALID',
        'AI at Meta blog page did not render any posts.',
        {
          endpoint: sourceUrl,
          operation: 'resolve-account',
          provider: 'meta_ai_blog',
          responseBodySnippet: bodySnippet,
          sourceUrl,
        },
      );
    }

    return buildBlogAccount();
  }

  private async renderBlogPage(
    sourceUrl: string,
  ): Promise<{ bodySnippet: string; rawEntries: MetaBlogRawEntry[] }> {
    try {
      return await this.session.withPage(async (page) => {
        await page.goto(sourceUrl, {
          timeout: this.navigationTimeoutMs,
          waitUntil: 'domcontentloaded',
        });
        await page
          .waitForSelector('a[href*="/blog/"]', { timeout: this.postLoadTimeoutMs })
          .catch(() => undefined);
        await page.waitForTimeout(this.renderSettleTimeoutMs);

        const rawEntries = await page.evaluate(extractMetaBlogEntriesInPage);
        const bodySnippet = await readBodySnippet(page);

        return { bodySnippet, rawEntries };
      });
    } catch (error) {
      if (error instanceof SourceProviderError) {
        throw error;
      }

      throw new SourceProviderError(
        'SOURCE_REQUEST_FAILED',
        'AI at Meta blog page render failed.',
        {
          causeMessage: error instanceof Error ? error.message : String(error),
          endpoint: sourceUrl,
          operation: 'fetch-timeline',
          provider: 'meta_ai_blog',
          sourceUrl,
        },
        error,
      );
    }
  }
}

export function createMetaAiBlogSourceProvider(
  options: MetaAiBlogSourceProviderOptions = {},
): SourceProvider {
  return new MetaAiBlogSourceProvider(options);
}

export function normalizeMetaBlogRawEntries(
  rawEntries: MetaBlogRawEntry[],
  fetchedAt: string,
): NewsEntry[] {
  const bySlug = new Map<string, NewsEntry>();

  for (const rawEntry of rawEntries) {
    const slug = normalizeSlug(rawEntry.href);
    const title = rawEntry.title.trim();

    if (slug === undefined || title.length === 0) {
      continue;
    }

    const previous = bySlug.get(slug);
    const publishedAt = resolvePublishedAt(rawEntry.dateText ?? previous?.publishedAt, fetchedAt);

    if (previous === undefined || title.length > previous.title.length) {
      bySlug.set(slug, { publishedAt, slug, title });
      continue;
    }

    previous.publishedAt = publishedAt;
  }

  return [...bySlug.values()].sort((left, right) =>
    right.publishedAt.localeCompare(left.publishedAt),
  );
}

async function readBodySnippet(page: Page): Promise<string> {
  const text = await page
    .locator('body')
    .innerText({ timeout: 2_000 })
    .then((value) => value ?? '')
    .catch(() => '');

  return text.replace(/\s+/gu, ' ').slice(0, 500);
}

function normalizeSlug(href: string): string | undefined {
  const match = /^https:\/\/ai\.meta\.com\/blog\/([a-z0-9-]+)\/?$/u.exec(href.trim());

  return match?.[1];
}

function normalizeSourceUrl(rawUrl: string | undefined): string {
  const value = rawUrl?.trim() ?? '';

  if (value.length === 0) {
    throw new SourceProviderError(
      'SOURCE_INVALID_INPUT',
      'AI at Meta blog source requires a sourceUrl.',
      {
        operation: 'resolve-account',
        provider: 'meta_ai_blog',
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
      'AI at Meta blog source requires a valid http/https URL.',
      {
        operation: 'resolve-account',
        provider: 'meta_ai_blog',
        sourceUrl: value,
      },
    );
  }
}

function buildBlogAccount(): SourceProviderAccount {
  const label = 'AI at Meta';

  return {
    displayName: label,
    sourceId: 'meta:blog',
    sourceLabel: label,
  };
}

function extractMetaBlogEntriesInPage(): MetaBlogRawEntry[] {
  const documentNode = (globalThis as any).document;
  const dateRe =
    /(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}, \d{4}/;
  const results: MetaBlogRawEntry[] = [];

  for (const anchor of Array.from(
    documentNode.querySelectorAll('a[href*="/blog/"]'),
  ) as any[]) {
    const href = String(anchor.href ?? '');

    if (!/^https:\/\/ai\.meta\.com\/blog\/[a-z0-9-]+\/?$/.test(href)) {
      continue;
    }

    const label = String(anchor.getAttribute('aria-label') ?? '').trim();
    const title = (label.startsWith('Read ') ? label.slice(5) : String(anchor.textContent ?? ''))
      .replace(/\s+/g, ' ')
      .trim();

    if (title.length < 8) {
      continue;
    }

    let node: any = anchor;
    let dateText: string | undefined;

    for (let depth = 0; depth < 6 && node !== null && dateText === undefined; depth += 1) {
      const text = String(node.innerText ?? '').replace(/\s+/g, ' ');

      if (text.length > 700) {
        break;
      }

      const match = dateRe.exec(text);

      if (match !== null && text.includes(title.slice(0, 24))) {
        dateText = match[0];
      }

      node = node.parentElement;
    }

    results.push({ ...(dateText === undefined ? {} : { dateText }), href, title });
  }

  return results;
}
