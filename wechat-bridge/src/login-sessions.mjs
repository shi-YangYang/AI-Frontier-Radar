import { fork } from 'node:child_process';

import { saveWechatBinding } from './account-bindings.mjs';

const ACTIVE = new Set(['pending', 'scanned', 'need-code']);
const LOGIN_TTL_MS = 8 * 60_000;
const RESULT_TTL_MS = 10 * 60_000;

export class LoginSessions {
  constructor(accounts, { spawnWorker = () => fork(new URL('./login-worker.mjs', import.meta.url), [], {
    execArgv: [], stdio: ['pipe', 'ignore', 'ignore', 'ipc'],
  }), timeoutMs = LOGIN_TTL_MS, onRemoveAccount } = {}) {
    this.accounts = accounts;
    this.spawnWorker = spawnWorker;
    this.timeoutMs = timeoutMs;
    this.onRemoveAccount = onRemoveAccount;
    this.sessions = new Map();
  }

  get(sessionId) {
    return this.sessions.get(sessionId)?.state ?? { status: 'idle' };
  }

  start(sessionId) {
    const existing = this.sessions.get(sessionId);
    if (existing && ACTIVE.has(existing.state.status)) return existing.ready;
    this.cancel(sessionId);
    const entry = { state: { status: 'pending' }, child: null, timer: null, resolve: null };
    entry.ready = new Promise((resolve) => { entry.resolve = resolve; });
    this.sessions.set(sessionId, entry);
    const finish = (state) => {
      if (this.sessions.get(sessionId) !== entry) return;
      entry.state = state;
      entry.resolve(state);
      clearTimeout(entry.timer);
      entry.child?.kill();
      entry.child = null;
      entry.timer = setTimeout(() => {
        if (this.sessions.get(sessionId) === entry) this.sessions.delete(sessionId);
      }, RESULT_TTL_MS);
      entry.timer.unref();
    };
    try {
      const child = this.spawnWorker();
      entry.child = child;
      entry.timer = setTimeout(() => finish({ status: 'failed', message: '扫码已超时，请重新生成二维码。' }), this.timeoutMs);
      entry.timer.unref();
      child.stdin.on('error', () => {});
      child.on('message', (message) => {
        if (this.sessions.get(sessionId) !== entry || entry.child !== child) return;
        if (message.type === 'result') {
          const result = message.result;
          if (result.connected === true && result.accountId && result.botToken) {
            try {
              // Only this parent writes the shared account index, in event-loop order.
              saveWechatBinding(this.accounts, result, this.onRemoveAccount);
              finish({ accountId: result.accountId, userId: result.userId, status: 'connected', message: '登录成功。请给微信里的 ClawBot 发一条消息以登记会话。' });
            } catch (error) {
              finish({ status: 'failed', message: error instanceof Error ? error.message : String(error) });
            }
          } else {
            // An "already connected" result without an account ID cannot establish ownership.
            finish({ status: 'failed', message: result.message ?? '登录未完成，请重新扫码。' });
          }
        } else if (message.status === 'failed') {
          finish({ status: 'failed', message: message.message });
        } else if (ACTIVE.has(message.status)) {
          entry.state = { ...entry.state, ...message };
          if (entry.state.qrcodeUrl) entry.resolve(entry.state);
        }
      });
      child.on('error', (error) => finish({ status: 'failed', message: error.message }));
      child.on('exit', () => {
        if (entry.child === child) finish({ status: 'failed', message: '扫码进程已退出，请重新扫码。' });
      });
    } catch (error) {
      finish({ status: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
    return entry.ready;
  }

  submitCode(sessionId, code) {
    const entry = this.sessions.get(sessionId);
    if (!entry?.child || entry.state.status !== 'need-code') throw new Error('当前扫码流程无需验证码，请刷新状态后重试。');
    if (typeof code !== 'string' || !/^\d{1,16}$/u.test(code.trim())) throw new Error('请输入手机微信显示的数字。');
    entry.child.stdin.write(`${code.trim()}\n`);
    entry.state = { ...entry.state, status: 'scanned', message: '正在验证，请稍候。' };
  }

  cancel(sessionId) {
    const entry = this.sessions.get(sessionId);
    if (!entry) return false;
    this.sessions.delete(sessionId);
    clearTimeout(entry.timer);
    entry.child?.kill();
    entry.child = null;
    entry.resolve({ status: 'idle' });
    return true;
  }

  close() {
    for (const sessionId of this.sessions.keys()) this.cancel(sessionId);
  }
}
