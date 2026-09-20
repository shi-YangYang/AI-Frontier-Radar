import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import type { AppLogger } from '../../lib/logger';

export interface WechatBridgeServiceOptions {
  logger?: AppLogger;
  port?: number;
  rootDir?: string;
}

export interface WechatBridgeStatus {
  installed: boolean;
  port: number;
  running: boolean;
}

export interface WechatLoginState {
  accountId?: string;
  loggedIn: boolean;
  message?: string;
  qrcodeDataUrl?: string;
  qrcodeUrl?: string;
  status: 'connected' | 'failed' | 'idle' | 'need-code' | 'pending' | 'scanned' | 'unavailable';
  userId?: string;
}

export interface WechatAccount {
  accountId: string;
  baseUrl: string;
  hasContextToken?: boolean;
  sendCount?: number;
  sendLimit?: number;
  tokenMasked: string;
  userId: string | null;
}

export interface WechatTarget {
  accountId?: string;
  firstSeenAt?: string;
  id: string;
  lastSeenAt?: string;
  preview?: string;
}

const DEFAULT_PORT = 3_991;
const MAX_RESTART_ATTEMPTS = 5;
const REQUEST_TIMEOUT_MS = 15_000;
const LOGIN_REQUEST_TIMEOUT_MS = 60_000;

export class WechatBridgeService {
  private readonly logger?: AppLogger;
  private readonly port: number;
  private readonly rootDir: string;
  private child: ChildProcessWithoutNullStreams | null = null;
  private restartAttempts = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private stopping = false;

  public constructor(options: WechatBridgeServiceOptions = {}) {
    this.logger = options.logger;
    this.port = options.port ?? DEFAULT_PORT;
    this.rootDir = options.rootDir ?? findWechatBridgeRoot();
  }

  public isInstalled(): boolean {
    return (
      this.rootDir.length > 0 &&
      existsSync(path.join(this.rootDir, 'wechat-bridge', 'src', 'bridge.mjs')) &&
      existsSync(path.join(this.rootDir, 'wechat-bridge', 'node_modules'))
    );
  }

  public isRunning(): boolean {
    return this.child !== null && this.child.exitCode === null && !this.child.killed;
  }

  public getStatus(): WechatBridgeStatus {
    return {
      installed: this.isInstalled(),
      port: this.port,
      running: this.isRunning(),
    };
  }

  public start(): void {
    if (!this.isInstalled()) {
      this.logger?.warn?.(
        { rootDir: this.rootDir },
        '微信桥未安装：运行 npm run wechat:install 后生效',
      );

      return;
    }

    if (this.isRunning()) {
      return;
    }

    this.stopping = false;
    const bridgeEntry = path.join(this.rootDir, 'wechat-bridge', 'src', 'bridge.mjs');
    const child = spawn(
      process.execPath,
      [bridgeEntry, 'serve', '--port', String(this.port)],
      {
        cwd: path.join(this.rootDir, 'wechat-bridge'),
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    this.child = child;
    child.stdout.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        const text = line.trim().replace(/^\[wechat-bridge\]\s*/u, '');

        if (text.length > 0) {
          this.logger?.debug?.({ module: 'wechat-bridge' }, text.slice(0, 500));
        }
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        const text = line.trim();

        if (text.length > 0) {
          this.logger?.warn?.({ module: 'wechat-bridge' }, text.slice(0, 500));
        }
      }
    });
    child.on('exit', (code, signal) => {
      this.child = null;

      if (this.stopping) {
        return;
      }

      this.logger?.warn?.(
        { code, signal },
        '微信桥进程已退出，计划重启',
      );

      if (this.restartAttempts >= MAX_RESTART_ATTEMPTS) {
        this.logger?.error?.({ attempts: this.restartAttempts }, '微信桥重启次数已达上限');

        return;
      }

      this.restartAttempts += 1;
      const delayMs = Math.min(30_000, 1_000 * 2 ** (this.restartAttempts - 1));
      this.restartTimer = setTimeout(() => this.start(), delayMs);
    });

    this.logger?.info?.({ port: this.port }, '微信桥进程已启动');
  }

  public async stop(): Promise<void> {
    this.stopping = true;

    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    const child = this.child;

    if (child === null) {
      return;
    }

    this.child = null;

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 3_000);

      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
      child.kill('SIGTERM');
    });
  }

  public async getLoginState(): Promise<WechatLoginState> {
    if (!this.isInstalled()) {
      return { loggedIn: false, status: 'unavailable', message: '未安装微信桥依赖，请先运行 npm run wechat:install。' };
    }

    if (!this.isRunning()) {
      return { loggedIn: false, status: 'unavailable', message: '微信桥进程未运行。' };
    }

    try {
      const state = await this.request<{
        accountId?: string;
        loggedIn?: boolean;
        message?: string;
        qrcodeDataUrl?: string;
        status?: string;
        userId?: string;
      }>('/login/status');

      return {
        accountId: state.accountId,
        loggedIn: state.loggedIn === true,
        message: state.message,
        qrcodeDataUrl: state.qrcodeDataUrl,
        status: (state.status ?? 'idle') as WechatLoginState['status'],
        userId: state.userId,
      };
    } catch (error) {
      return {
        loggedIn: false,
        message: error instanceof Error ? error.message : String(error),
        status: 'unavailable',
      };
    }
  }

  public async startLogin(force = false): Promise<WechatLoginState> {
    const response = await this.request<{
      message?: string;
      ok?: boolean;
      qrcodeDataUrl?: string;
      qrcodeUrl?: string;
      status?: string;
    }>('/login/start', {
      body: JSON.stringify({ force }),
      method: 'POST',
      timeoutMs: LOGIN_REQUEST_TIMEOUT_MS,
    });

    return {
      loggedIn: false,
      message: response.message,
      qrcodeDataUrl: response.qrcodeDataUrl,
      qrcodeUrl: response.qrcodeUrl,
      status: (response.status ?? 'pending') as WechatLoginState['status'],
    };
  }

  public async submitLoginCode(code: string): Promise<void> {
    if (!this.isRunning() || this.child === null) {
      throw new Error('微信桥进程未运行。');
    }

    this.child.stdin.write(`${code.trim()}\n`);
  }

  public async getAccounts(): Promise<WechatAccount[]> {
    const response = await this.request<{ accounts?: WechatAccount[] }>('/accounts');

    return Array.isArray(response.accounts) ? response.accounts : [];
  }

  public async removeAccount(accountId: string): Promise<boolean> {
    const response = await this.request<{ deleted?: boolean }>(
      `/accounts/${encodeURIComponent(accountId)}`,
      { method: 'DELETE' },
    );

    return response.deleted === true;
  }

  public async getTargets(): Promise<WechatTarget[]> {
    const response = await this.request<{ targets?: WechatTarget[] }>('/targets');

    return Array.isArray(response.targets) ? response.targets : [];
  }

  public async sendMessage(input: {
    accountId?: string;
    author?: string;
    postedAt?: string;
    text: string;
    title?: string;
    to?: string;
    url?: string;
  }): Promise<{ messageId?: string; ok: boolean }> {
    const response = await this.request<{ error?: string; messageId?: string; ok?: boolean }>('/send', {
      body: JSON.stringify(input),
      method: 'POST',
    });

    return { messageId: response.messageId, ok: response.ok !== false };
  }

  private async request<T>(
    endpoint: string,
    options: { body?: string; method?: string; timeoutMs?: number } = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? REQUEST_TIMEOUT_MS,
    );

    try {
      const response = await fetch(`http://127.0.0.1:${this.port}${endpoint}`, {
        body: options.body,
        headers: {
          Accept: 'application/json',
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        method: options.method ?? 'GET',
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => ({}))) as T & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? `微信桥请求失败（HTTP ${response.status}）。`);
      }

      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createWechatBridgeService(
  options: WechatBridgeServiceOptions = {},
): WechatBridgeService {
  return new WechatBridgeService(options);
}

export function findWechatBridgeRoot(startDir = process.cwd()): string {
  let dir = path.resolve(startDir);

  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(path.join(dir, 'wechat-bridge', 'src', 'bridge.mjs'))) {
      return dir;
    }

    const parent = path.dirname(dir);

    if (parent === dir) {
      break;
    }

    dir = parent;
  }

  return '';
}
