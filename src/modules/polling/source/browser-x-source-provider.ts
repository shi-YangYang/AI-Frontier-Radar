import { chromium, type BrowserContext, type Page } from 'playwright';
import path from 'node:path';
import type {
  SourceProvider,
  SourceProviderAccount,
  SourceProviderFetchInput,
  SourceProviderFetchResult,
  SourceProviderValidateAccountInput,
  StandardizedPost,
} from '../types';
import { SourceProviderError } from './source-provider-error';

export interface BrowserXSourceProviderOptions {
  baseUrl?: string;
  headless?: boolean;
  navigationTimeoutMs?: number;
  postLoadTimeoutMs?: number;
  proxyUrl?: string;
  userDataDir?: string;
}

export interface BrowserXProxySettings {
  password?: string;
  server: string;
  username?: string;
}

interface BrowserXParsedPost {
  authorDisplayName?: string;
  authorUsername: string;
  datetime?: string;
  isPinned: boolean;
  isPromoted: boolean;
  isReply: boolean;
  isRepost: boolean;
  permalinkUrl: string;
  rawText: string;
  textContent: string;
  xPostId: string;
}

interface BrowserXResolvedAccount {
  displayName?: string;
  xUserId: string;
  xUsername: string;
}

const DEFAULT_BASE_URL = 'https://x.com';
const DEFAULT_POST_LOAD_TIMEOUT_MS = 15_000;
const DEFAULT_NAVIGATION_TIMEOUT_MS = 30_000;
const DEFAULT_RENDER_SETTLE_TIMEOUT_MS = 3_000;
const DEFAULT_USER_DATA_DIR = path.resolve(process.cwd(), '.x-browser-profile');

export class BrowserXSourceProvider implements SourceProvider {
  private readonly baseUrl: string;
  private readonly headless: boolean;
  private readonly navigationTimeoutMs: number;
  private readonly postLoadTimeoutMs: number;
  private readonly proxyUrl?: string;
  private readonly userDataDir: string;
  private browserOperationQueue: Promise<void> = Promise.resolve();

  public constructor(options: BrowserXSourceProviderOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.headless = options.headless ?? false;
    this.navigationTimeoutMs = options.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS;
    this.postLoadTimeoutMs = options.postLoadTimeoutMs ?? DEFAULT_POST_LOAD_TIMEOUT_MS;
    this.proxyUrl = options.proxyUrl;
    this.userDataDir = options.userDataDir ?? DEFAULT_USER_DATA_DIR;
  }

  public async fetchPosts(input: SourceProviderFetchInput): Promise<SourceProviderFetchResult> {
    validateBrowserFetchInput(input);

    return this.runBrowserOperation(() => this.fetchPostsExclusive(input));
  }

  public async validateAccount(
    input: SourceProviderValidateAccountInput,
  ): Promise<SourceProviderAccount> {
    return this.runBrowserOperation(() => this.validateAccountExclusive(input));
  }

  private async fetchPostsExclusive(
    input: SourceProviderFetchInput,
  ): Promise<SourceProviderFetchResult> {

    const xUsername = normalizeUsername(input.xUsername);
    if (xUsername === undefined) {
      throw new SourceProviderError(
        'SOURCE_INVALID_INPUT',
        'BrowserXSourceProvider requires xUsername because X profile URLs are username based.',
        buildDiagnostics(input, 'resolve-account'),
      );
    }

    let context: BrowserContext | undefined;
    try {
      context = await chromium.launchPersistentContext(this.userDataDir, {
        headless: this.headless,
        ...toLaunchProxyOption(this.proxyUrl),
      });
      const page = context.pages()[0] ?? (await context.newPage());
      const profileUrl = `${this.baseUrl.replace(/\/$/u, '')}/${encodeURIComponent(xUsername)}`;

      await page.goto(profileUrl, {
        timeout: this.navigationTimeoutMs,
        waitUntil: 'domcontentloaded',
      });
      await waitForProfileOrKnownFailure(page, {
        input,
        operation: 'fetch-timeline',
        postLoadTimeoutMs: this.postLoadTimeoutMs,
        profileUrl,
        xUsername,
      });
      await page.waitForTimeout(DEFAULT_RENDER_SETTLE_TIMEOUT_MS);

      const account = await resolveAccountFromPage(page, input, xUsername);
      const parsedPosts = await parseXTimelineFromPage(page, xUsername);
      const posts = normalizeParsedPosts(parsedPosts, account, input);

      return {
        account,
        meta: {
          newestPostId: posts[0]?.xPostId,
          oldestPostId: posts.at(-1)?.xPostId,
          provider: 'x',
          requestedLimit: input.limit,
          resolvedBy: 'xUsername',
          sincePostId: input.sincePostId,
        },
        posts,
      };
    } catch (error) {
      if (error instanceof SourceProviderError) {
        throw error;
      }

      throw new SourceProviderError(
        'SOURCE_REQUEST_FAILED',
        'Browser X source request failed.',
        buildDiagnostics(input, 'fetch-timeline', {
          causeMessage: error instanceof Error ? error.message : String(error),
        }),
        error,
      );
    } finally {
      await context?.close();
    }
  }

  private async validateAccountExclusive(
    input: SourceProviderValidateAccountInput,
  ): Promise<SourceProviderAccount> {
    const xUsername = normalizeUsername(input.xUsername);
    if (xUsername === undefined) {
      throw new SourceProviderError(
        'SOURCE_INVALID_INPUT',
        'BrowserXSourceProvider requires xUsername.',
        buildDiagnostics(input, 'resolve-account'),
      );
    }

    let context: BrowserContext | undefined;
    try {
      context = await chromium.launchPersistentContext(this.userDataDir, {
        headless: this.headless,
        ...toLaunchProxyOption(this.proxyUrl),
      });
      const page = context.pages()[0] ?? (await context.newPage());
      const profileUrl = `${this.baseUrl.replace(/\/$/u, '')}/${encodeURIComponent(xUsername)}`;

      await page.goto(profileUrl, {
        timeout: this.navigationTimeoutMs,
        waitUntil: 'domcontentloaded',
      });
      await waitForProfileOrKnownFailure(page, {
        input,
        operation: 'resolve-account',
        postLoadTimeoutMs: this.postLoadTimeoutMs,
        profileUrl,
        xUsername,
      });
      await page.waitForTimeout(DEFAULT_RENDER_SETTLE_TIMEOUT_MS);

      return await resolveAccountFromPage(page, input, xUsername);
    } catch (error) {
      if (error instanceof SourceProviderError) {
        throw error;
      }

      throw new SourceProviderError(
        'SOURCE_REQUEST_FAILED',
        'Browser X source account validation failed.',
        buildDiagnostics(input, 'resolve-account', {
          causeMessage: error instanceof Error ? error.message : String(error),
          xUsername,
        }),
        error,
      );
    } finally {
      await context?.close();
    }
  }

  private async runBrowserOperation<T>(operation: () => Promise<T>): Promise<T> {
    const previousOperation = this.browserOperationQueue;
    let releaseCurrentOperation!: () => void;
    this.browserOperationQueue = new Promise((resolve) => {
      releaseCurrentOperation = resolve;
    });

    await previousOperation.catch(() => undefined);

    try {
      return await operation();
    } finally {
      releaseCurrentOperation();
    }
  }
}

export function createBrowserXSourceProvider(
  options: BrowserXSourceProviderOptions = {},
): SourceProvider {
  return new BrowserXSourceProvider(options);
}

export function toBrowserXProxySettings(
  proxyUrl: string | undefined,
): BrowserXProxySettings | undefined {
  if (proxyUrl === undefined || proxyUrl.trim().length === 0) {
    return undefined;
  }

  const url = new URL(proxyUrl);
  const username = url.username.length === 0 ? undefined : decodeURIComponent(url.username);
  const password = url.password.length === 0 ? undefined : decodeURIComponent(url.password);
  url.username = '';
  url.password = '';

  return {
    ...(password === undefined ? {} : { password }),
    server: url.toString(),
    ...(username === undefined ? {} : { username }),
  };
}

function toLaunchProxyOption(
  proxyUrl: string | undefined,
): { proxy?: BrowserXProxySettings } {
  const proxy = toBrowserXProxySettings(proxyUrl);
  return proxy === undefined ? {} : { proxy };
}

export async function parseXTimelineFromPage(
  page: Page,
  xUsername: string,
): Promise<BrowserXParsedPost[]> {
  const normalizedUsername = normalizeUsername(xUsername);
  if (normalizedUsername === undefined) {
    throw new SourceProviderError(
      'SOURCE_INVALID_INPUT',
      'Browser X parser requires xUsername.',
      {
        operation: 'fetch-timeline',
        provider: 'x',
        xUsername,
      },
    );
  }

  const posts = await page.$$eval(
    'article[data-testid="tweet"]',
    (articles, targetUsername) => {
      const target = String(targetUsername).toLowerCase();

      return articles
        .map((article) => {
          const articleNode = article as any;
          const articleText = articleNode.textContent ?? '';
          const statusLink = Array.from(articleNode.querySelectorAll('a[href*="/status/"]'))
            .map((anchor) => (anchor as any).href as string)
            .find((href) => {
              try {
                const url = new URL(href);
                const [, username, statusSegment, postId] = url.pathname.split('/');
                return (
                  username?.toLowerCase() === target &&
                  statusSegment === 'status' &&
                  /^\d+$/u.test(postId ?? '')
                );
              } catch {
                return false;
              }
            });

          if (statusLink === undefined) {
            return undefined;
          }

          const statusUrl = new URL(statusLink);
          const [, authorUsername, , xPostId] = statusUrl.pathname.split('/');
          const datetime = articleNode.querySelector('time[datetime]')?.dateTime as string | undefined;
          const authorNameText =
            (articleNode.querySelector('[data-testid="User-Name"]')?.textContent as string | undefined) ??
            undefined;
          const promoted = /\bPromoted\b/u.test(articleText);
          const pinned = /\bPinned\b|已置顶/u.test(articleText);
          const repost = /\bReposted\b/u.test(articleText);
          const reply = /\bReplying to\b/u.test(articleText);
          const tweetText =
            Array.from(articleNode.querySelectorAll('[data-testid="tweetText"]'))
              .map((node) => ((node as any).innerText as string).trim())
              .filter(Boolean)
              .join('\n') || articleText.trim();

          return {
            authorDisplayName: authorNameText?.split('@')[0]?.trim() || undefined,
            authorUsername,
            datetime,
            isPinned: pinned,
            isPromoted: promoted,
            isReply: reply,
            isRepost: repost,
            permalinkUrl: `https://x.com/${authorUsername}/status/${xPostId}`,
            rawText: articleText,
            textContent: tweetText,
            xPostId,
          };
        })
        .filter((post): post is NonNullable<typeof post> => post !== undefined);
    },
    normalizedUsername,
  );

  return posts;
}

function validateBrowserFetchInput(input: SourceProviderFetchInput): void {
  if (!isPresent(input.xUsername)) {
    throw new SourceProviderError(
      'SOURCE_INVALID_INPUT',
      'BrowserXSourceProvider requires xUsername.',
      buildDiagnostics(input, 'resolve-account'),
    );
  }

  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
    throw new SourceProviderError(
      'SOURCE_INVALID_INPUT',
      'BrowserXSourceProvider limit must be an integer between 1 and 100.',
      buildDiagnostics(input, 'fetch-timeline'),
    );
  }
}

async function waitForProfileOrKnownFailure(
  page: Page,
  options: {
    input: SourceProviderFetchInput | SourceProviderValidateAccountInput;
    operation: 'fetch-timeline' | 'resolve-account';
    postLoadTimeoutMs: number;
    profileUrl: string;
    xUsername: string;
  },
): Promise<void> {
  try {
    await page.waitForSelector(
      '[data-testid="UserName"], article[data-testid="tweet"], a[href="/login"], [data-testid="emptyState"]',
      {
        timeout: options.postLoadTimeoutMs,
      },
    );
  } catch (error) {
    const pageText = await getBodyText(page);
    throw classifyBrowserPageError(pageText, options.input, {
      cause: error,
      endpoint: options.profileUrl,
      operation: options.operation,
      xUsername: options.xUsername,
    });
  }

  const pageText = await getBodyText(page);
  const currentUrl = page.url();

  if (/\/i\/flow\/login/u.test(currentUrl) || /\b(Log in|Sign in) to X\b/u.test(pageText)) {
    throw new SourceProviderError(
      'SOURCE_AUTH_FAILED',
      'Browser X source is not logged in. Open with headless=false and sign in with the user account.',
      buildDiagnostics(options.input, options.operation, {
        endpoint: options.profileUrl,
        xUsername: options.xUsername,
      }),
    );
  }

  if (/\b(Rate limit exceeded|rate limited|Too many requests)\b/iu.test(pageText)) {
    throw new SourceProviderError(
      'SOURCE_RATE_LIMITED',
      'Browser X source was rate limited.',
      buildDiagnostics(options.input, options.operation, {
        endpoint: options.profileUrl,
        responseBodySnippet: pageText.slice(0, 500),
        xUsername: options.xUsername,
      }),
    );
  }

  if (/\b(This account doesn.?t exist|This account does not exist|Account suspended|User not found)\b/iu.test(pageText)) {
    throw new SourceProviderError(
      'SOURCE_ACCOUNT_NOT_FOUND',
      'The requested X account was not found.',
      buildDiagnostics(options.input, 'resolve-account', {
        endpoint: options.profileUrl,
        responseBodySnippet: pageText.slice(0, 500),
        xUsername: options.xUsername,
      }),
    );
  }
}

function classifyBrowserPageError(
  pageText: string,
  input: SourceProviderFetchInput | SourceProviderValidateAccountInput,
  context: {
    cause: unknown;
    endpoint: string;
    operation: 'fetch-timeline' | 'resolve-account';
    xUsername: string;
  },
): SourceProviderError {
  if (/\b(Rate limit exceeded|rate limited|Too many requests)\b/iu.test(pageText)) {
    return new SourceProviderError(
      'SOURCE_RATE_LIMITED',
      'Browser X source was rate limited.',
      buildDiagnostics(input, context.operation, {
        endpoint: context.endpoint,
        responseBodySnippet: pageText.slice(0, 500),
        xUsername: context.xUsername,
      }),
      context.cause,
    );
  }

  if (/\b(This account doesn.?t exist|This account does not exist|Account suspended|User not found)\b/iu.test(pageText)) {
    return new SourceProviderError(
      'SOURCE_ACCOUNT_NOT_FOUND',
      'The requested X account was not found.',
      buildDiagnostics(input, 'resolve-account', {
        endpoint: context.endpoint,
        responseBodySnippet: pageText.slice(0, 500),
        xUsername: context.xUsername,
      }),
      context.cause,
    );
  }

  return new SourceProviderError(
    'SOURCE_RESPONSE_INVALID',
    'Browser X source did not render a readable profile.',
    buildDiagnostics(input, context.operation, {
      endpoint: context.endpoint,
      responseBodySnippet: pageText.slice(0, 500),
      xUsername: context.xUsername,
    }),
    context.cause,
  );
}

async function resolveAccountFromPage(
  page: Page,
  input: SourceProviderFetchInput | SourceProviderValidateAccountInput,
  xUsername: string,
): Promise<BrowserXResolvedAccount> {
  const displayName = await page
    .locator('[data-testid="UserName"]')
    .first()
    .textContent({ timeout: 1_000 })
    .catch(() => undefined);
  const xUserId =
    ('xUserId' in input ? input.xUserId : undefined) ??
    (await findXUserIdInPageScripts(page, xUsername)) ??
    `x:${xUsername}`;

  return {
    displayName: normalizeOptionalString(displayName?.split('@')[0]),
    xUserId,
    xUsername,
  };
}

async function findXUserIdInPageScripts(page: Page, xUsername: string): Promise<string | undefined> {
  const scriptTexts = await page
    .locator('script')
    .evaluateAll((scripts) => scripts.map((script) => script.textContent ?? '').join('\n'))
    .catch(() => '');
  const escapedUsername = escapeRegExp(xUsername);
  const userPattern = new RegExp(
    `"screen_name"\\s*:\\s*"${escapedUsername}"[\\s\\S]{0,1000}?"rest_id"\\s*:\\s*"(\\d+)"`,
    'iu',
  );
  const reversedPattern = new RegExp(
    `"rest_id"\\s*:\\s*"(\\d+)"[\\s\\S]{0,1000}?"screen_name"\\s*:\\s*"${escapedUsername}"`,
    'iu',
  );

  return userPattern.exec(scriptTexts)?.[1] ?? reversedPattern.exec(scriptTexts)?.[1];
}

function normalizeParsedPosts(
  parsedPosts: BrowserXParsedPost[],
  account: SourceProviderAccount,
  input: SourceProviderFetchInput,
): StandardizedPost[] {
  const posts: StandardizedPost[] = [];
  const seenPostIds = new Set<string>();

  for (const parsedPost of parsedPosts) {
    if (posts.length >= input.limit) {
      break;
    }

    if (seenPostIds.has(parsedPost.xPostId)) {
      continue;
    }

    if (parsedPost.isPromoted || parsedPost.isPinned) {
      continue;
    }

    if (parsedPost.authorUsername.toLowerCase() !== account.xUsername.toLowerCase()) {
      continue;
    }

    if (!isPresent(parsedPost.datetime)) {
      throw new SourceProviderError(
        'SOURCE_RESPONSE_INVALID',
        'Browser X source found a post without a stable time datetime.',
        buildDiagnostics(input, 'fetch-timeline', {
          xUserId: account.xUserId,
          xUsername: account.xUsername,
        }),
      );
    }

    if (input.sincePostId !== undefined && comparePostIds(parsedPost.xPostId, input.sincePostId) <= 0) {
      continue;
    }

    seenPostIds.add(parsedPost.xPostId);
    posts.push({
      author: {
        displayName: account.displayName ?? parsedPost.authorDisplayName,
        xUserId: account.xUserId,
        xUsername: account.xUsername,
      },
      isReply: parsedPost.isReply,
      isRepost: parsedPost.isRepost,
      permalinkUrl: parsedPost.permalinkUrl,
      postedAt: parsedPost.datetime,
      rawPayload: parsedPost,
      textContent: parsedPost.textContent,
      xPostId: parsedPost.xPostId,
    });
  }

  return posts;
}

async function getBodyText(page: Page): Promise<string> {
  return page
    .locator('body')
    .textContent({ timeout: 1_000 })
    .then((text) => text ?? '')
    .catch(() => '');
}

function buildDiagnostics(
  input: SourceProviderFetchInput | SourceProviderValidateAccountInput,
  operation: 'fetch-timeline' | 'resolve-account',
  extra: Partial<{
    causeMessage: string;
    endpoint: string;
    responseBodySnippet: string;
    statusCode: number;
    xUserId: string;
    xUsername: string;
  }> = {},
) {
  return {
    causeMessage: extra.causeMessage,
    endpoint: extra.endpoint,
    limit: 'limit' in input ? input.limit : undefined,
    operation,
    provider: 'x' as const,
    responseBodySnippet: extra.responseBodySnippet,
    sincePostId: 'sincePostId' in input ? input.sincePostId : undefined,
    statusCode: extra.statusCode,
    xUserId: extra.xUserId ?? ('xUserId' in input ? input.xUserId : undefined),
    xUsername: extra.xUsername ?? input.xUsername,
  };
}

function comparePostIds(left: string, right: string): number {
  try {
    const leftBigInt = BigInt(left);
    const rightBigInt = BigInt(right);
    if (leftBigInt === rightBigInt) {
      return 0;
    }

    return leftBigInt > rightBigInt ? 1 : -1;
  } catch {
    return left.localeCompare(right);
  }
}

function normalizeUsername(value: string | undefined): string | undefined {
  if (!isPresent(value)) {
    return undefined;
  }

  return value.trim().replace(/^@/u, '');
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}

function isPresent(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
