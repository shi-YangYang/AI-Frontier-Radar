import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { chromium, type BrowserContext } from 'playwright';

import type { AppConfig, XBrowserSourceConfig } from '../../../shared/config/types';
import type { SourceProvider, SourceProviderErrorCode } from '../types';
import {
  createBrowserXSourceProvider,
  toBrowserXProxySettings,
  type BrowserXSourceProviderOptions,
} from './browser-x-source-provider';
import { SourceProviderError } from './source-provider-error';

export type XSourceAnonymousCheckStatus =
  | 'available'
  | 'account_not_found'
  | 'login_required'
  | 'network_error'
  | 'page_unreadable'
  | 'rate_limited';

export type XSourceLoginCheckStatus =
  | 'logged_in_or_public_available'
  | 'login_required'
  | 'network_error'
  | 'page_unreadable'
  | 'rate_limited';

export interface XSourceAnonymousCheckResult {
  message: string;
  sourceCode?: SourceProviderErrorCode;
  status: XSourceAnonymousCheckStatus;
  xUsername: string;
}

export interface XSourceLoginCheckResult {
  message: string;
  sourceCode?: SourceProviderErrorCode;
  status: XSourceLoginCheckStatus;
  xUsername: string;
}

export interface XSourceOpenLoginResult {
  loginUrl: string;
  message: string;
  status: 'opened';
  userDataDir: string;
}

export interface XSourceDiagnosticsOptions {
  createBrowserProvider?: (options: BrowserXSourceProviderOptions) => SourceProvider;
  getEffectiveAppConfig(): Promise<AppConfig>;
  isGraphicalEnvironmentAvailable?: () => boolean;
}

export class XSourceDiagnosticError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;
  public readonly statusCode: number;

  public constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'XSourceDiagnosticError';
    this.code = code;
    this.details = details;
    this.statusCode = statusCode;
  }
}

let activeLoginContext: BrowserContext | undefined;

export function createXSourceDiagnostics(
  options: XSourceDiagnosticsOptions,
): XSourceDiagnostics {
  return new XSourceDiagnostics(options);
}

export class XSourceDiagnostics {
  private readonly createBrowserProvider: (options: BrowserXSourceProviderOptions) => SourceProvider;
  private readonly isGraphicalEnvironmentAvailable: () => boolean;

  public constructor(private readonly options: XSourceDiagnosticsOptions) {
    this.createBrowserProvider = options.createBrowserProvider ?? createBrowserXSourceProvider;
    this.isGraphicalEnvironmentAvailable =
      options.isGraphicalEnvironmentAvailable ?? hasGraphicalEnvironment;
  }

  public async testAnonymous(xUsername: string): Promise<XSourceAnonymousCheckResult> {
    const config = await this.getBrowserConfig();
    const tempUserDataDir = await mkdtemp(path.join(tmpdir(), 'ai-news-x-anonymous-'));

    try {
      const provider = this.createBrowserProvider({
        ...toBrowserProviderOptions(config.browser),
        headless: true,
        userDataDir: tempUserDataDir,
      });
      const result = await provider.fetchPosts({
        limit: 1,
        xUsername,
      });

      if (result.posts.length === 0) {
        return {
          message: 'X 页面可访问，但没有读取到可用帖子节点。',
          status: 'page_unreadable',
          xUsername,
        };
      }

      return {
        message: '匿名 browser 抓取可用。',
        status: 'available',
        xUsername,
      };
    } catch (error) {
      return toAnonymousCheckResult(error, xUsername);
    } finally {
      await rm(tempUserDataDir, { force: true, recursive: true }).catch(() => undefined);
    }
  }

  public async checkLogin(xUsername: string): Promise<XSourceLoginCheckResult> {
    const config = await this.getBrowserConfig();
    const provider = this.createBrowserProvider({
      ...toBrowserProviderOptions(config.browser),
      headless: true,
    });

    try {
      await provider.validateAccount({ xUsername });

      return {
        message: '当前 browser profile 可访问 X 页面；这可能是已登录，也可能是公开页面匿名可读。',
        status: 'logged_in_or_public_available',
        xUsername,
      };
    } catch (error) {
      return toLoginCheckResult(error, xUsername);
    }
  }

  public async openLoginWindow(): Promise<XSourceOpenLoginResult> {
    const config = await this.getBrowserConfig();
    const loginUrl = `${config.browser.baseUrl.replace(/\/$/u, '')}/home`;

    if (!this.isGraphicalEnvironmentAvailable()) {
      throw new XSourceDiagnosticError(
        409,
        'GRAPHICAL_ENV_UNAVAILABLE',
        '当前运行环境没有可用图形界面，无法打开 X 登录窗口。',
        {
          platform: process.platform,
        },
      );
    }

    let nextContext: BrowserContext | undefined;

    try {
      nextContext = await chromium.launchPersistentContext(config.browser.userDataDir, {
        headless: false,
        ...toLaunchProxyOption(config.browser.proxyUrl),
      });
      const page = nextContext.pages()[0] ?? (await nextContext.newPage());

      await page.goto(loginUrl, {
        timeout: config.browser.navigationTimeoutMs,
        waitUntil: 'domcontentloaded',
      });

      await replaceActiveLoginContext(nextContext);
      nextContext = undefined;

      return {
        loginUrl,
        message: 'X 登录窗口已打开，请在浏览器中手动完成登录。',
        status: 'opened',
        userDataDir: config.browser.userDataDir,
      };
    } catch (error) {
      await nextContext?.close().catch(() => undefined);

      if (isGraphicalLaunchError(error)) {
        throw new XSourceDiagnosticError(
          409,
          'GRAPHICAL_ENV_UNAVAILABLE',
          '当前运行环境没有可用图形界面，无法打开 X 登录窗口。',
          {
            platform: process.platform,
          },
        );
      }

      throw new XSourceDiagnosticError(
        502,
        'X_LOGIN_WINDOW_OPEN_FAILED',
        'X 登录窗口打开失败。',
      );
    }
  }

  private async getBrowserConfig(): Promise<{ browser: XBrowserSourceConfig }> {
    const config = await this.options.getEffectiveAppConfig();

    if (config.source.mode !== 'browser') {
      throw new XSourceDiagnosticError(
        409,
        'X_SOURCE_MODE_NOT_BROWSER',
        '当前 X source mode 不是 browser，无法执行 browser 诊断。',
        {
          sourceMode: config.source.mode,
        },
      );
    }

    return {
      browser: config.source.x.browser,
    };
  }
}

function toBrowserProviderOptions(browser: XBrowserSourceConfig): BrowserXSourceProviderOptions {
  return {
    baseUrl: browser.baseUrl,
    headless: browser.headless,
    navigationTimeoutMs: browser.navigationTimeoutMs,
    postLoadTimeoutMs: browser.postLoadTimeoutMs,
    proxyUrl: browser.proxyUrl,
    userDataDir: browser.userDataDir,
  };
}

function toAnonymousCheckResult(
  error: unknown,
  xUsername: string,
): XSourceAnonymousCheckResult {
  if (error instanceof SourceProviderError) {
    const status = toAnonymousStatus(error.code);

    return {
      message: toAnonymousMessage(status),
      sourceCode: error.code,
      status,
      xUsername,
    };
  }

  return {
    message: 'X 页面请求失败，请检查网络或代理配置。',
    status: 'network_error',
    xUsername,
  };
}

function toLoginCheckResult(error: unknown, xUsername: string): XSourceLoginCheckResult {
  if (error instanceof SourceProviderError) {
    const status = toLoginStatus(error.code);

    return {
      message: toLoginMessage(status),
      sourceCode: error.code,
      status,
      xUsername,
    };
  }

  return {
    message: 'X 页面请求失败，请检查网络或代理配置。',
    status: 'network_error',
    xUsername,
  };
}

function toAnonymousStatus(code: SourceProviderErrorCode): XSourceAnonymousCheckStatus {
  if (code === 'SOURCE_AUTH_FAILED') {
    return 'login_required';
  }

  if (code === 'SOURCE_RATE_LIMITED') {
    return 'rate_limited';
  }

  if (code === 'SOURCE_ACCOUNT_NOT_FOUND') {
    return 'account_not_found';
  }

  if (code === 'SOURCE_RESPONSE_INVALID' || code === 'SOURCE_INVALID_INPUT') {
    return 'page_unreadable';
  }

  return 'network_error';
}

function toLoginStatus(code: SourceProviderErrorCode): XSourceLoginCheckStatus {
  if (code === 'SOURCE_AUTH_FAILED') {
    return 'login_required';
  }

  if (code === 'SOURCE_RATE_LIMITED') {
    return 'rate_limited';
  }

  if (code === 'SOURCE_RESPONSE_INVALID' || code === 'SOURCE_ACCOUNT_NOT_FOUND') {
    return 'page_unreadable';
  }

  return 'network_error';
}

function toAnonymousMessage(status: XSourceAnonymousCheckStatus): string {
  if (status === 'available') {
    return '匿名 browser 抓取可用。';
  }

  if (status === 'login_required') {
    return 'X 当前要求登录后才能读取该页面。';
  }

  if (status === 'rate_limited') {
    return 'X 当前返回限流，请稍后再试。';
  }

  if (status === 'account_not_found') {
    return 'X 账号不存在或不可访问。';
  }

  if (status === 'page_unreadable') {
    return 'X 页面已打开，但页面结构不可解析。';
  }

  return 'X 页面请求失败，请检查网络或代理配置。';
}

function toLoginMessage(status: XSourceLoginCheckStatus): string {
  if (status === 'logged_in_or_public_available') {
    return '当前 browser profile 可访问 X 页面；这可能是已登录，也可能是公开页面匿名可读。';
  }

  if (status === 'login_required') {
    return '当前 browser profile 访问 X 时需要登录。';
  }

  if (status === 'rate_limited') {
    return 'X 当前返回限流，请稍后再试。';
  }

  if (status === 'page_unreadable') {
    return 'X 页面已打开，但页面结构不可解析。';
  }

  return 'X 页面请求失败，请检查网络或代理配置。';
}

function toLaunchProxyOption(proxyUrl: string | undefined): { proxy?: ReturnType<typeof toBrowserXProxySettings> } {
  const proxy = toBrowserXProxySettings(proxyUrl);
  return proxy === undefined ? {} : { proxy };
}

async function replaceActiveLoginContext(nextContext: BrowserContext): Promise<void> {
  const previousContext = activeLoginContext;
  activeLoginContext = nextContext;

  await previousContext?.close().catch(() => undefined);
}

function hasGraphicalEnvironment(): boolean {
  if (process.platform !== 'linux') {
    return true;
  }

  return Boolean(process.env.DISPLAY ?? process.env.WAYLAND_DISPLAY);
}

function isGraphicalLaunchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return /\b(no x server|missing x server|cannot open display|headless.*false)\b/iu.test(message);
}
