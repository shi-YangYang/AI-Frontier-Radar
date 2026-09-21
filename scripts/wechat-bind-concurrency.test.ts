import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

import { createApp } from '../src/app/create-app';
import { loadAppConfig } from '../src/config';
import { createLogger } from '../src/lib/logger';
import { createAuthService } from '../src/modules/auth';
import { createStorage } from '../src/modules/storage';
import { WechatBindCoordinator, type WechatAccount, type WechatBridgeService, type WechatLoginState } from '../src/modules/wechat';
import { LoginSessions } from '../wechat-bridge/src/login-sessions.mjs';

async function until(check: () => boolean, message: string) {
  for (let i = 0; i < 250; i++) {
    if (check()) return;
    await delay(20);
  }
  assert.fail(message);
}

test('concurrent API binding keeps QR, code, cancellation and confirmed ownership per user', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'radar-bind-api-'));
  const config = await loadAppConfig({ cwd: dir, env: { NODE_ENV: 'test', WATCH_ACCOUNTS_SOURCE: 'env', WATCH_ACCOUNTS: 'test_source' } });
  const storage = createStorage({ databaseUrl: config.storage.prisma.databaseUrl, sqlitePath: config.storage.sqlite.path });
  const auth = createAuthService({ storage });
  const coordinator = new WechatBindCoordinator();
  const states = new Map<string, WechatLoginState>();
  const accounts: WechatAccount[] = [{ accountId: 'legacy', baseUrl: 'https://example.test', tokenMasked: 'test', userId: 'legacy-user' }];
  const codes: Array<[string, string]> = [];
  let starts = 0;
  let unavailable = false;
  const bridge = {
    getAccounts: async () => { if (unavailable) throw new Error('offline'); return [...accounts]; },
    getLoginState: async (id: string) => states.get(id) ?? { loggedIn: false, status: 'idle' },
    getStatus: () => ({ installed: true, running: true, port: 3991 }),
    getTargets: async () => [], isRunning: () => true, isInstalled: () => true,
    startLogin: async (_force: boolean, id: string) => {
      starts++;
      states.set(id, { loggedIn: false, status: 'pending' });
      await delay(15);
      const state: WechatLoginState = { loggedIn: false, status: 'pending', qrcodeUrl: `https://qr.example.test/${id}` };
      states.set(id, state);
      return state;
    },
    submitLoginCode: async (code: string, id: string) => { codes.push([id, code]); },
    cancelLogin: async (id: string) => {
      if (states.get(id)?.status === 'connected') return false;
      return states.delete(id);
    },
    removeAccount: async (id: string) => { const index = accounts.findIndex(a => a.accountId === id); if (index < 0) return false; accounts.splice(index, 1); return true; },
  };
  const app = createApp({ config, storage, auth, logger: createLogger({ level: 'silent' }), wechatBindCoordinator: coordinator, wechatBridge: bridge as unknown as WechatBridgeService });
  try {
    await storage.initialize();
    const users = await Promise.all(['alice', 'bob', 'charlie', 'admin'].map(username => auth.createUser({ username, password: 'test-password', role: username === 'admin' ? 'admin' : 'user' })));
    const cookies = new Map<string, string>();
    for (const user of users) {
      const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { username: user.username, password: 'test-password' } });
      assert.equal(login.statusCode, 200);
      cookies.set(user.username, String(login.headers['set-cookie']).split(';')[0]);
    }
    const request = (who: string, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) => app.inject({ method, url, headers: { cookie: cookies.get(who)! }, ...(payload ? { payload } : {}) });
    const userId = (who: string) => users.find(u => u.username === who)!.id;
    const session = (who: string) => coordinator.getSessionId(userId(who))!;
    const complete = (who: string, accountId: string) => {
      if (!accounts.some(a => a.accountId === accountId)) accounts.push({ accountId, baseUrl: 'https://example.test', tokenMasked: 'test', userId: `${accountId}-user`, hasContextToken: true });
      states.set(session(who), { loggedIn: true, status: 'connected', accountId });
    };
    const startResults = await Promise.all([
      request('alice', 'POST', '/user/api/wechat/bind'),
      request('bob', 'POST', '/user/api/wechat/bind'),
      request('admin', 'POST', '/admin/api/wechat/login', { force: true }),
    ]);
    assert.deepEqual(startResults.map(r => r.statusCode), [200, 200, 200], JSON.stringify(startResults.map(r => r.json())));
    const qrUrls = startResults.map(r => r.json().data.qrcodeUrl);
    assert.equal(new Set(qrUrls).size, 3);
    const aliceId = session('alice');
    const bobId = session('bob');
    for (const [index, who] of ['alice', 'bob', 'admin'].entries()) {
      const response = await request(who, 'GET', who === 'admin' ? '/admin/api/wechat/status' : '/user/api/wechat');
      const data = response.json().data;
      assert.equal((data.login ?? data).qrcodeUrl, qrUrls[index]);
    }
    const duplicates = await Promise.all([request('alice', 'POST', '/user/api/wechat/bind'), request('alice', 'POST', '/user/api/wechat/bind')]);
    assert.equal(starts, 3, 'duplicate clicks reuse the existing QR');
    assert.ok(duplicates.every(r => r.json().data.qrcodeUrl === qrUrls[0]));
    await Promise.all([
      request('alice', 'POST', '/user/api/wechat/bind/code', { code: '1111', sessionId: bobId }),
      request('bob', 'POST', '/user/api/wechat/bind/code', { code: '2222', sessionId: aliceId }),
    ]);
    assert.deepEqual(codes.sort(), [[aliceId, '1111'], [bobId, '2222']].sort(), 'client-supplied session IDs cannot redirect codes');
    await request('alice', 'POST', '/user/api/wechat/bind/cancel');
    assert.equal(states.has(aliceId), false);
    assert.equal(states.get(bobId)?.status, 'pending');
    await request('alice', 'POST', '/user/api/wechat/bind');
    assert.notEqual(session('alice'), aliceId);
    complete('bob', 'wechat-b');
    complete('admin', 'wechat-admin');
    complete('alice', 'wechat-a');
    const results = await Promise.all(['alice', 'bob'].map(who => request(who, 'GET', '/user/api/wechat')));
    assert.deepEqual(results.map(r => r.json().data.accounts.map((a: {accountId: string}) => a.accountId)), [['wechat-a'], ['wechat-b']]);
    const targets = await storage.deliveryTargets.listAll();
    assert.equal(targets.find(t => t.config.accountId === 'legacy')?.ownerUserId, null, 'unrelated unowned accounts are not claimed');
    assert.equal(targets.find(t => t.config.accountId === 'wechat-admin')?.ownerUserId, userId('admin'));
    assert.equal(new Set(targets.map(t => t.targetKey)).size, 4, 'overlapping polls do not create duplicate targets');
    assert.equal((await request('alice', 'POST', '/user/api/wechat/bind')).statusCode, 409, 'one binding per regular user remains enforced');
    assert.equal((await request('bob', 'DELETE', '/user/api/wechat/accounts/wechat-a')).statusCode, 404);
    await request('charlie', 'POST', '/user/api/wechat/bind');
    complete('charlie', 'wechat-a');
    const conflict = (await request('charlie', 'GET', '/user/api/wechat')).json().data;
    assert.equal(conflict.accounts.length, 0);
    assert.equal(conflict.login.status, 'failed');
    assert.equal((await storage.deliveryTargets.findByTargetKey('wechat:wechat-a'))?.ownerUserId, userId('alice'));
    const oldCharlie = session('charlie');
    await request('charlie', 'POST', '/user/api/wechat/bind');
    assert.notEqual(session('charlie'), oldCharlie);
    states.set(session('charlie'), { loggedIn: false, status: 'failed', message: 'expired' });
    assert.equal((await request('charlie', 'GET', '/user/api/wechat')).json().data.login.status, 'failed');
    await request('charlie', 'POST', '/user/api/wechat/bind');
    complete('charlie', 'wechat-c');
    // Ownership also completes with no browser status request.
    for (let i = 0; i < 50; i++) {
      if ((await storage.deliveryTargets.findByTargetKey('wechat:wechat-c'))?.ownerUserId === userId('charlie')) break;
      await delay(100);
    }
    assert.equal((await storage.deliveryTargets.findByTargetKey('wechat:wechat-c'))?.ownerUserId, userId('charlie'));
    unavailable = true;
    const offline = (await request('alice', 'GET', '/user/api/wechat')).json().data;
    assert.equal(offline.accounts[0].accountId, 'wechat-a');
    assert.equal((await storage.deliveryTargets.listAll()).length, 5, 'bridge outages cannot delete persisted channels');
  } finally {
    await app.close();
    await storage.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('real SDK workers isolate stdin, refresh QR images, cancel late results and expire', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'radar-bind-workers-'));
  const preload = join(dir, 'mock-fetch.mjs');
  // No request in these child processes can reach the real WeChat API.
  await writeFile(preload, `
let generation = 0;
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  if (url.pathname.endsWith('/get_bot_qrcode')) {
    generation++;
    return Response.json({ qrcode: 'test-' + process.env.TEST_ID + '-' + generation, qrcode_img_content: 'https://qr.example.test/' + process.env.TEST_ID + '/' + generation });
  }
  if (url.pathname.endsWith('/get_qrcode_status')) {
    if (process.env.TEST_REFRESH === '1' && generation === 1) return Response.json({ status: 'expired' });
    if (url.searchParams.get('verify_code') === process.env.TEST_CODE) return Response.json({ status: 'confirmed', ilink_bot_id: 'account-' + process.env.TEST_ID, ilink_user_id: 'wechat-' + process.env.TEST_ID, bot_token: 'fake-token', baseurl: 'https://example.test' });
    return Response.json({ status: 'need_verifycode' });
  }
  throw new Error('Unexpected mock request: ' + url.pathname);
};`);
  const saved = new Map();
  const registered = new Set();
  const children: ReturnType<typeof fork>[] = [];
  let count = 0;
  const spawnWorker = () => {
    const index = ++count;
    const child = fork(resolve('wechat-bridge/src/login-worker.mjs'), [], {
      execArgv: ['--import', pathToFileURL(preload).href],
      env: { ...process.env, OPENCLAW_STATE_DIR: dir, OPENCLAW_TMP_DIR: join(dir, 'logs'), TEST_ID: String(index), TEST_CODE: String(index).repeat(4), TEST_REFRESH: index === 2 ? '1' : '0' },
      stdio: ['pipe', 'ignore', 'ignore', 'ipc'],
    });
    children.push(child);
    return child;
  };
  const accounts = { saveWeixinAccount: (id: string, value: unknown) => saved.set(id, value), registerWeixinAccountId: (id: string) => registered.add(id) };
  const sessions = new LoginSessions(accounts, { spawnWorker });
  const expiring = new LoginSessions(accounts, { spawnWorker, timeoutMs: 50 });
  try {
    const started = await Promise.all([sessions.start('one'), sessions.start('two')]);
    assert.notEqual(started[0].qrcodeUrl, started[1].qrcodeUrl);
    await until(() => sessions.get('one').status === 'need-code' && sessions.get('two').status === 'need-code', 'both sessions should independently ask for a code');
    assert.ok(sessions.get('two').qrcodeUrl.endsWith('/2'), 'refreshed QR reaches the web state');
    assert.ok(sessions.get('two').qrcodeDataUrl.startsWith('data:image/png;'));
    assert.throws(() => sessions.submitCode('one', '1111\n2222'), /数字/u);
    sessions.submitCode('one', '1111');
    await until(() => sessions.get('one').status === 'connected', 'first code should finish its own session');
    assert.equal(sessions.get('two').status, 'need-code');
    assert.deepEqual([...registered], ['account-1']);
    sessions.submitCode('two', '9999');
    await until(() => sessions.get('two').status === 'need-code', 'incorrect code should remain scoped and retryable');
    sessions.submitCode('two', '2222');
    await until(() => sessions.get('two').status === 'connected', 'second code should finish the second session');
    assert.deepEqual([...registered], ['account-1', 'account-2']);
    await sessions.start('cancelled');
    await until(() => sessions.get('cancelled').status === 'need-code', 'third session ready');
    sessions.cancel('cancelled');
    // Even a completion message already queued by a cancelled worker is ignored.
    children[2].emit('message', { type: 'result', result: { connected: true, accountId: 'late', botToken: 'fake' } });
    assert.equal(saved.has('late'), false);
    assert.equal(sessions.get('cancelled').status, 'idle');
    const timedOut = await expiring.start('expires');
    if (timedOut.status !== 'failed') await until(() => expiring.get('expires').status === 'failed', 'timeout must terminate worker');
    assert.equal(expiring.get('expires').status, 'failed');
  } finally {
    sessions.close();
    expiring.close();
    await Promise.all(children.map(child => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise<void>(resolve => child.once('exit', () => resolve()))));
    await rm(dir, { recursive: true, force: true });
  }
});
