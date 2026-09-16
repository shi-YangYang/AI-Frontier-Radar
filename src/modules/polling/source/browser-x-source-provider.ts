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
  authorUsername: string;
  dateText?: string;
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
const RATE_LIMIT_PATTERN =
  /(?:\b(?:Rate limit exceeded|rate limited|Too many requests)\b|超出速率限制|请求过于频繁)/iu;
const ACCOUNT_NOT_FOUND_PATTERN =
  /(?:\b(?:This account doesn.?t exist|This account does not exist|Account suspended|User not found)\b|此账号不存在|账号不存在|帐号不存在|账号已被暂停|用户不存在)/iu;

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
      const posts = normalizeParsedPosts(parsedPosts, account, input, new Date());

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
    'article',
    (articles, targetUsername) => {
      const target = String(targetUsername).toLowerCase();

      const toPathname = (href: string): string => {
        try {
          return new URL(href, 'https://x.com').pathname;
        } catch {
          return '';
        }
      };

      return articles
        .map((article) => {
          const articleNode = article as any;
          const articleText = (articleNode.textContent ?? '') as string;
          const statusAnchors = Array.from(articleNode.querySelectorAll('a[href*="/status/"]')).map(
            (anchor) => {
              const anchorNode = anchor as any;
              const match = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)(?:\/.*)?$/u.exec(
                toPathname(String(anchorNode.getAttribute('href') ?? '')),
              );

              return {
                authorUsername: match?.[1] as string | undefined,
                text: ((anchorNode.textContent ?? '') as string).trim(),
                xPostId: match?.[2] as string | undefined,
              };
            },
          );
          const targetAnchors = statusAnchors.filter(
            (anchor) =>
              anchor.authorUsername !== undefined &&
              anchor.xPostId !== undefined &&
              anchor.authorUsername.toLowerCase() === target,
          );

          if (targetAnchors.length === 0) {
            return undefined;
          }

          const primaryAnchor = targetAnchors[0] as {
            authorUsername: string;
            text: string;
            xPostId: string;
          };
          const dateText =
            targetAnchors.map((anchor) => anchor.text).find((text) => text.length > 0) ?? undefined;
          const textBlocks = Array.from(articleNode.querySelectorAll('[dir="auto"]'))
            .filter((node: any) => node.querySelectorAll('div').length === 0)
            .map((node: any) => ((node.textContent ?? '') as string).replace(/\s+/gu, ' ').trim())
            .filter(
              (value: string) => value.length > 0 && value !== 'Show more' && value !== '显示更多',
            )
            .filter((value: string, index: number, all: string[]) => all.indexOf(value) === index);
          const textContent =
            textBlocks.join('\n').replace(/\s*(?:Show more|显示更多)$/u, '').trim() ||
            articleText.trim();

          return {
            authorUsername: primaryAnchor.authorUsername,
            dateText,
            isPinned:
              articleNode.querySelector('svg[data-icon="icon-pin-fill"]') !== null ||
              /\bPinned\b|已置顶/u.test(articleText),
            isPromoted: /\bPromoted\b|推广/u.test(articleText),
            isReply: /\bReplying to\b|回复/u.test(articleText),
            isRepost: /\bReposted\b|转推/u.test(articleText),
            permalinkUrl: `https://x.com/${primaryAnchor.authorUsername}/status/${primaryAnchor.xPostId}`,
            rawText: articleText,
            textContent,
            xPostId: primaryAnchor.xPostId,
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
    await page.waitForSelector('article, h1', {
      timeout: options.postLoadTimeoutMs,
    });
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

  if (
    /\/i\/flow\/login/u.test(currentUrl) ||
    /\/i\/jf\/onboarding/u.test(currentUrl) ||
    /\b(Log in|Sign in) to X\b/u.test(pageText)
  ) {
    throw new SourceProviderError(
      'SOURCE_AUTH_FAILED',
      'Browser X source is not logged in. Open with headless=false and sign in with the user account.',
      buildDiagnostics(options.input, options.operation, {
        endpoint: options.profileUrl,
        xUsername: options.xUsername,
      }),
    );
  }

  if (RATE_LIMIT_PATTERN.test(pageText)) {
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

  if (ACCOUNT_NOT_FOUND_PATTERN.test(pageText)) {
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
  if (RATE_LIMIT_PATTERN.test(pageText)) {
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

  if (ACCOUNT_NOT_FOUND_PATTERN.test(pageText)) {
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
  const displayName = await resolveDisplayNameFromPage(page, xUsername);
  const xUserId =
    ('xUserId' in input ? input.xUserId : undefined) ??
    (await findXUserIdInPageScripts(page, xUsername)) ??
    `x:${xUsername}`;

  return {
    displayName,
    xUserId,
    xUsername,
  };
}

async function resolveDisplayNameFromPage(
  page: Page,
  xUsername: string,
): Promise<string | undefined> {
  const title = await page.title().catch(() => '');
  const titleMatch = /^(.+?)\s*\(@([A-Za-z0-9_]{1,15})\)\s*\/\s*X$/u.exec(title.trim());

  if (titleMatch !== null && titleMatch[2].toLowerCase() === xUsername.toLowerCase()) {
    return normalizeOptionalString(titleMatch[1]);
  }

  const heading = await page
    .locator('h1')
    .first()
    .textContent({ timeout: 1_000 })
    .catch(() => null);

  if (heading === null || /\bLog in\b|Sign up|登录|注册/u.test(heading)) {
    return undefined;
  }

  return normalizeOptionalString(heading);
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
  now: Date,
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

    const postedAt = resolvePostedAtFromText(parsedPost.dateText, now) ?? now.toISOString();

    if (input.sincePostId !== undefined && comparePostIds(parsedPost.xPostId, input.sincePostId) <= 0) {
      continue;
    }

    seenPostIds.add(parsedPost.xPostId);
    posts.push({
      author: {
        displayName: account.displayName,
        xUserId: account.xUserId,
        xUsername: account.xUsername,
      },
      isReply: parsedPost.isReply,
      isRepost: parsedPost.isRepost,
      permalinkUrl: parsedPost.permalinkUrl,
      postedAt,
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

const ENGLISH_MONTH_INDEX: Record<string, number> = {
  apr: 4,
  aug: 8,
  dec: 12,
  feb: 2,
  jan: 1,
  jul: 7,
  jun: 6,
  mar: 3,
  may: 5,
  nov: 11,
  oct: 10,
  sep: 9,
};

const RELATIVE_UNIT_MS: Record<string, number> = {
  d: 86_400_000,
  h: 3_600_000,
  m: 60_000,
  s: 1_000,
  天: 86_400_000,
  小时: 3_600_000,
  分: 60_000,
  分钟: 60_000,
  秒: 1_000,
};

export function resolvePostedAtFromText(dateText: string | undefined, now: Date): string | null {
  const value = dateText?.trim() ?? '';
  if (value.length === 0) {
    return null;
  }

  if (/^(?:now|刚刚)$/iu.test(value)) {
    return now.toISOString();
  }

  if (/^(?:yesterday|昨天)$/iu.test(value)) {
    return new Date(now.getTime() - 86_400_000).toISOString();
  }

  const relativeMatch = /^(\d+)\s*(s|m|h|d|秒|分钟|分|小时|天)前?$/u.exec(value);
  if (relativeMatch !== null) {
    const amount = Number(relativeMatch[1]);
    const unitMs = RELATIVE_UNIT_MS[relativeMatch[2]];

    if (Number.isFinite(amount) && unitMs !== undefined) {
      return new Date(now.getTime() - amount * unitMs).toISOString();
    }
  }

  const zhFullMatch = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/u.exec(value);
  if (zhFullMatch !== null) {
    return toIsoDateFromParts(
      Number(zhFullMatch[1]),
      Number(zhFullMatch[2]),
      Number(zhFullMatch[3]),
    );
  }

  const zhShortMatch = /^(\d{1,2})月(\d{1,2})日$/u.exec(value);
  if (zhShortMatch !== null) {
    return toIsoDateFromParts(
      now.getFullYear(),
      Number(zhShortMatch[1]),
      Number(zhShortMatch[2]),
      now,
    );
  }

  const enFullMatch = /^([A-Za-z]{3}) (\d{1,2}),\s*(\d{4})$/u.exec(value);
  if (enFullMatch !== null) {
    const month = ENGLISH_MONTH_INDEX[enFullMatch[1].toLowerCase()];

    if (month !== undefined) {
      return toIsoDateFromParts(Number(enFullMatch[3]), month, Number(enFullMatch[2]));
    }
  }

  const enShortMatch = /^([A-Za-z]{3}) (\d{1,2})$/u.exec(value);
  if (enShortMatch !== null) {
    const month = ENGLISH_MONTH_INDEX[enShortMatch[1].toLowerCase()];

    if (month !== undefined) {
      return toIsoDateFromParts(now.getFullYear(), month, Number(enShortMatch[2]), now);
    }
  }

  const zhClockMatch = /^(上午|下午|凌晨)?\s*(\d{1,2}):(\d{2})$/u.exec(value);
  if (zhClockMatch !== null) {
    const meridiem = zhClockMatch[1];
    let hour = Number(zhClockMatch[2]);
    const minute = Number(zhClockMatch[3]);

    if (meridiem === '下午' && hour < 12) {
      hour += 12;
    }

    if ((meridiem === '上午' || meridiem === '凌晨') && hour === 12) {
      hour = 0;
    }

    return toIsoDateTime(now, hour, minute);
  }

  const enClockMatch = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/iu.exec(value);
  if (enClockMatch !== null) {
    let hour = Number(enClockMatch[1]);
    const minute = Number(enClockMatch[2]);
    const meridiem = enClockMatch[3].toUpperCase();

    if (meridiem === 'PM' && hour < 12) {
      hour += 12;
    }

    if (meridiem === 'AM' && hour === 12) {
      hour = 0;
    }

    return toIsoDateTime(now, hour, minute);
  }

  return null;
}

function toIsoDateFromParts(year: number, month: number, day: number, now?: Date): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }

  if (now !== undefined && date.getTime() > now.getTime() + 86_400_000) {
    return toIsoDateFromParts(year - 1, month, day);
  }

  return date.toISOString();
}

function toIsoDateTime(now: Date, hour: number, minute: number): string | null {
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);

  if (date.getTime() > now.getTime() + 5 * 60_000) {
    date.setDate(date.getDate() - 1);
  }

  return date.toISOString();
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
