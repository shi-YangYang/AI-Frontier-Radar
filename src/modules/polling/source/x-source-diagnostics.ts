import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { AppConfig, XBrowserSourceConfig } from '../../../shared/config/types';
import type { SourceProvider, SourceProviderErrorCode } from '../types';
import {
  createBrowserXSourceProvider,
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

export interface XSourceAnonymousCheckResult {
  message: string;
  sourceCode?: SourceProviderErrorCode;
  status: XSourceAnonymousCheckStatus;
  xUsername: string;
}

export interface XSourceDiagnosticsOptions {
  createBrowserProvider?: (options: BrowserXSourceProviderOptions) => SourceProvider;
  getEffectiveAppConfig(): Promise<AppConfig>;
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

export function createXSourceDiagnostics(
  options: XSourceDiagnosticsOptions,
): XSourceDiagnostics {
  return new XSourceDiagnostics(options);
}

export class XSourceDiagnostics {
  private readonly createBrowserProvider: (options: BrowserXSourceProviderOptions) => SourceProvider;

  public constructor(private readonly options: XSourceDiagnosticsOptions) {
    this.createBrowserProvider = options.createBrowserProvider ?? createBrowserXSourceProvider;
  }

  public async testAnonymous(xUsername: string): Promise<XSourceAnonymousCheckResult> {
    const config = await this.getBrowserConfig();
    const tempUserDataDir = await mkdtemp(path.join(tmpdir(), 'ai-news-x-anonymous-'));

    try {
      const provider = this.createBrowserProvider({
        ...toBrowserProviderOptions(config.browser),
        userDataDir: tempUserDataDir,
      });
      const result = await provider.fetchPosts({
        limit: 1,
        source: {
          sourceType: 'x',
          xUsername,
        },
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
