import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
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
    const initialAdminStatus = (await request('admin', 'GET', '/admin/api/wechat/status')).json().data;
    assert.equal(initialAdminStatus.accounts.length, 1);
    assert.equal(initialAdminStatus.loggedIn, false, 'other users or unowned bindings do not make the current admin bound');
    const complete = (who: string, accountId: string, wechatUserId = `${accountId}-user`) => {
      for (let i = accounts.length - 1; i >= 0; i--) {
        if (accounts[i].userId === wechatUserId && accounts[i].accountId !== accountId) accounts.splice(i, 1);
      }
      if (!accounts.some(a => a.accountId === accountId)) accounts.push({ accountId, baseUrl: 'https://example.test', tokenMasked: 'test', userId: wechatUserId, hasContextToken: true });
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
    assert.equal((await request('alice', 'POST', '/user/api/wechat/bind/cancel')).statusCode, 200);
    const results = await Promise.all(['alice', 'bob'].map(who => request(who, 'GET', '/user/api/wechat')));
    assert.deepEqual(results.map(r => r.json().data.accounts.map((a: {accountId: string}) => a.accountId)), [['wechat-a'], ['wechat-b']], 'cancelling after QR confirmation preserves the completed binding');
    const targets = await storage.deliveryTargets.listAll();
    assert.equal(targets.find(t => t.config.accountId === 'legacy')?.ownerUserId, null, 'unrelated unowned accounts are not claimed');
    assert.equal(targets.find(t => t.config.accountId === 'wechat-admin')?.ownerUserId, userId('admin'));
    assert.equal((await request('admin', 'GET', '/admin/api/wechat/status')).json().data.loggedIn, true);
    assert.equal((await request('admin', 'GET', '/admin/api/wechat/status')).json().data.loggedIn, true, 'binding status remains true after the completed QR session is cleared');
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

    // A confirmed new connection for Bob's WeChat replaces his old channel, including queued work.
    const events = [];
    for (const status of ['pending', 'retry_wait', 'sending', 'sent'] as const) {
      await storage.xPosts.create({ xPostId: `replacement-${status}`, authorUsername: 'test', permalinkUrl: `https://example.test/${status}`, postedAt: new Date().toISOString(), textContent: 'test', rawPayloadJson: '{}' });
      events.push(await storage.deliveryEvents.create({ xPostId: `replacement-${status}`, targetKey: 'wechat:wechat-b', status, ...(status === 'sent' ? { sentAt: new Date().toISOString(), attemptCount: 1 } : {}) }));
    }
    const bobTarget = await storage.deliveryTargets.findByTargetKey('wechat:wechat-b');
    assert.equal((await request('admin', 'POST', '/admin/api/wechat/login', { force: true })).statusCode, 200);
    const pendingAdminStatus = (await request('admin', 'GET', '/admin/api/wechat/status')).json().data;
    assert.equal(pendingAdminStatus.loginStatus, 'pending');
    assert.equal(pendingAdminStatus.loggedIn, true, 'opening another QR does not disconnect an existing binding');
    complete('admin', 'wechat-b-new', 'wechat-b-user');
    await coordinator.sync(bridge as unknown as WechatBridgeService, storage);
    assert.equal((await request('bob', 'GET', '/user/api/wechat')).json().data.accounts.length, 0);
    assert.equal((await storage.deliveryTargets.findByTargetKey('wechat:wechat-b-new'))?.ownerUserId, userId('admin'));
    assert.equal((await storage.deliveryTargets.findById(bobTarget!.id))?.enabled, false);
    assert.equal((await storage.deliveryTargets.findById(bobTarget!.id))?.webhookUrl, '');
    assert.deepEqual(await Promise.all(events.map(async event => (await storage.deliveryEvents.findById(event.id))?.status)), ['dead', 'dead', 'dead', 'sent']);
    assert.deepEqual((await storage.deliveryTargets.listAll()).filter(t => t.config.target === 'wechat-b-user').map(t => t.config.accountId), ['wechat-b-new']);
    assert.equal((await storage.deliveryTargets.findByTargetKey('wechat:wechat-a'))?.ownerUserId, userId('alice'));

    // A later completion supersedes an earlier completed QR before its browser polls.
    const staleSession = coordinator.begin(userId('bob'));
    states.set(staleSession, { loggedIn: true, status: 'connected', accountId: 'wechat-b' });
    assert.equal((await request('bob', 'GET', '/user/api/wechat')).json().data.login.status, 'failed');

    // If the SDK returns an earlier account ID, its archived channel must not cause a unique-key error.
    assert.equal((await request('bob', 'POST', '/user/api/wechat/bind')).statusCode, 200);
    complete('bob', 'wechat-b', 'wechat-b-user');
    await coordinator.sync(bridge as unknown as WechatBridgeService, storage);
    const reboundBob = await storage.deliveryTargets.findByTargetKey('wechat:wechat-b');
    assert.equal(reboundBob?.id, bobTarget!.id);
    assert.equal(reboundBob?.ownerUserId, userId('bob'));
    assert.equal(reboundBob?.enabled, true);
    assert.deepEqual(await Promise.all(events.map(async event => (await storage.deliveryEvents.findById(event.id))?.status)), ['dead', 'dead', 'dead', 'sent'], 'restoring a channel never revives old delivery tasks');
    unavailable = true;
    const offline = (await request('alice', 'GET', '/user/api/wechat')).json().data;
    assert.equal(offline.accounts[0].accountId, 'wechat-a');
    assert.equal(offline.login.loggedIn, true);
    assert.equal(offline.login.status, 'unavailable', 'an outage is distinct from being unbound or awaiting activation');
    const offlineAdmin = (await request('admin', 'GET', '/admin/api/wechat/status')).json().data;
    assert.equal(offlineAdmin.loggedIn, true, 'bridge outages preserve the admin binding status');
    assert.equal(offlineAdmin.loginStatus, 'unavailable');
    assert.equal((await storage.deliveryTargets.listAll()).length, 5, 'bridge outages cannot delete persisted channels');
    unavailable = false;
    await bridge.removeAccount('wechat-admin');
    const removedAdminStatus = (await request('admin', 'GET', '/admin/api/wechat/status')).json().data;
    assert.equal(removedAdminStatus.accounts.length, 4, 'the admin still sees other users global bindings');
    assert.equal(removedAdminStatus.loggedIn, false, 'removed admin bindings are reflected without starting a new QR');
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
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;
  const previousTmpDir = process.env.OPENCLAW_TMP_DIR;
  process.env.OPENCLAW_STATE_DIR = dir;
  process.env.OPENCLAW_TMP_DIR = join(dir, 'logs');
  const accounts = await import('../wechat-bridge/node_modules/@tencent-weixin/openclaw-weixin/dist/src/auth/accounts.js');
  accounts.saveWeixinAccount('old-one', { token: 'old-test-token', userId: 'wechat-1' });
  accounts.registerWeixinAccountId('old-one');
  accounts.saveWeixinAccount('other-wechat', { token: 'other-test-token', userId: 'someone-else' });
  accounts.registerWeixinAccountId('other-wechat');
  const oldContext = join(dir, 'openclaw-weixin/accounts/old-one.context-tokens.json');
  await writeFile(oldContext, JSON.stringify({ 'wechat-1': 'old-context' }));
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
  const sessions = new LoginSessions(accounts, { spawnWorker });
  const expiring = new LoginSessions(accounts, { spawnWorker, timeoutMs: 50 });
  try {
    const started = await Promise.all([sessions.start('one'), sessions.start('two')]);
    assert.ok(accounts.loadWeixinAccount('old-one'), 'starting a QR does not disconnect the old binding');
    assert.notEqual(started[0].qrcodeUrl, started[1].qrcodeUrl);
    await until(() => sessions.get('one').status === 'need-code' && sessions.get('two').status === 'need-code', 'both sessions should independently ask for a code');
    assert.ok(sessions.get('two').qrcodeUrl.endsWith('/2'), 'refreshed QR reaches the web state');
    assert.ok(sessions.get('two').qrcodeDataUrl.startsWith('data:image/png;'));
    assert.throws(() => sessions.submitCode('one', '1111\n2222'), /数字/u);
    sessions.submitCode('one', '1111');
    await until(() => sessions.get('one').status === 'connected', 'first code should finish its own session');
    assert.equal(sessions.get('two').status, 'need-code');
    assert.deepEqual(accounts.listIndexedWeixinAccountIds(), ['other-wechat', 'account-1']);
    assert.equal(accounts.loadWeixinAccount('old-one'), null, 'successful QR removes the same WeChat old credentials');
    assert.equal(existsSync(oldContext), false, 'old context tokens are removed');
    sessions.submitCode('two', '9999');
    await until(() => sessions.get('two').status === 'need-code', 'incorrect code should remain scoped and retryable');
    sessions.submitCode('two', '2222');
    await until(() => sessions.get('two').status === 'connected', 'second code should finish the second session');
    assert.deepEqual(accounts.listIndexedWeixinAccountIds(), ['other-wechat', 'account-1', 'account-2']);
    await sessions.start('cancelled');
    await until(() => sessions.get('cancelled').status === 'need-code', 'third session ready');
    sessions.cancel('cancelled');
    // Even a completion message already queued by a cancelled worker is ignored.
    children[2].emit('message', { type: 'result', result: { connected: true, accountId: 'late', botToken: 'fake' } });
    assert.equal(accounts.loadWeixinAccount('late'), null);
    assert.equal(sessions.get('cancelled').status, 'idle');
    const timedOut = await expiring.start('expires');
    if (timedOut.status !== 'failed') await until(() => expiring.get('expires').status === 'failed', 'timeout must terminate worker');
    assert.equal(expiring.get('expires').status, 'failed');
    assert.deepEqual(accounts.listIndexedWeixinAccountIds(), ['other-wechat', 'account-1', 'account-2'], 'cancelled and expired QRs do not remove any binding');
  } finally {
    sessions.close();
    expiring.close();
    await Promise.all(children.map(child => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise<void>(resolve => child.once('exit', () => resolve()))));
    if (previousStateDir === undefined) delete process.env.OPENCLAW_STATE_DIR;
    else process.env.OPENCLAW_STATE_DIR = previousStateDir;
    if (previousTmpDir === undefined) delete process.env.OPENCLAW_TMP_DIR;
    else process.env.OPENCLAW_TMP_DIR = previousTmpDir;
    await rm(dir, { recursive: true, force: true });
  }
});

test('bridge startup keeps the newest binding and rejects removed accounts before sending', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'radar-bind-replace-'));
  const root = join(dir, 'openclaw-weixin');
  await mkdir(join(root, 'accounts'), { recursive: true });
  const fixtures = [
    ['newest', 'same-wechat', '2026-09-21T08:00:00.000Z'],
    ['oldest', 'same-wechat', '2026-09-20T08:00:00.000Z'],
    ['unrelated', 'other-wechat', '2026-09-19T08:00:00.000Z'],
    ['unknown-a', undefined, '2026-09-19T08:00:00.000Z'],
    ['unknown-b', undefined, '2026-09-19T08:00:00.000Z'],
  ];
  await writeFile(join(root, 'accounts.json'), JSON.stringify(fixtures.map(([id]) => id)));
  for (const [id, userId, savedAt] of fixtures) {
    await writeFile(join(root, 'accounts', `${id}.json`), JSON.stringify({ token: `${id}-test-token`, userId, savedAt, baseUrl: 'https://example.test' }));
  }
  for (const suffix of ['context-tokens', 'send-counter', 'sync']) {
    await writeFile(join(root, 'accounts', `oldest.${suffix}.json`), '{}');
  }
  await writeFile(join(root, 'bridge-targets.json'), JSON.stringify([{ accountId: 'oldest', id: 'same-wechat' }, { accountId: 'unrelated', id: 'other-wechat' }]));
  const preload = join(dir, 'mock-fetch.mjs');
  await writeFile(preload, `
import fs from 'node:fs';
import path from 'node:path';
globalThis.fetch = async (input, options) => {
  const url = new URL(String(input));
  if (url.pathname.endsWith('/getupdates')) {
    fs.writeFileSync(path.join(process.env.OPENCLAW_STATE_DIR, 'poll-started'), 'yes');
    await new Promise(resolve => setTimeout(resolve, 400));
    fs.writeFileSync(path.join(process.env.OPENCLAW_STATE_DIR, 'poll-returned'), 'yes');
    return Response.json({ ret: 0, get_updates_buf: 'next', msgs: [{ from_user_id: 'same-wechat', context_token: 'late-context' }] });
  }
  if (url.pathname.endsWith('/sendmessage')) {
    fs.appendFileSync(path.join(process.env.OPENCLAW_STATE_DIR, 'sent.jsonl'), options.body + '\\n');
    return Response.json({ ret: 0, message_id: 'test-server-id' });
  }
  throw new Error('Unexpected mock request: ' + url.pathname);
};`);
  const listener = createServer();
  await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  const child = fork(resolve('wechat-bridge/src/bridge.mjs'), ['serve', '--port', String(port)], {
    execArgv: ['--import', pathToFileURL(preload).href],
    env: { ...process.env, OPENCLAW_STATE_DIR: dir, OPENCLAW_TMP_DIR: join(dir, 'logs') },
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  });
  let output = '';
  child.stdout!.on('data', chunk => { output += chunk.toString(); });
  child.stderr!.on('data', chunk => { output += chunk.toString(); });
  const request = async (path: string, method = 'GET', body?: object) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    await until(() => output.includes('微信桥已启动'), 'bridge should start with fake WeChat transport');
    assert.deepEqual((await request('/accounts')).body.accounts.map((account: { accountId: string }) => account.accountId), ['newest', 'unrelated', 'unknown-a', 'unknown-b']);
    for (const suffix of ['', '.context-tokens', '.send-counter', '.sync']) {
      assert.equal(existsSync(join(root, 'accounts', `oldest${suffix}.json`)), false);
    }
    assert.ok(!JSON.parse(await readFile(join(root, 'bridge-targets.json'), 'utf8')).some((target: { accountId: string }) => target.accountId === 'oldest'));
    const oldSend = await request('/send', 'POST', { accountId: 'oldest', to: 'same-wechat', text: 'obsolete delivery' });
    assert.equal(oldSend.status, 503);
    assert.equal(existsSync(join(dir, 'sent.jsonl')), false, 'old credentials never reach the WeChat send API');
    assert.equal((await request('/send', 'POST', { accountId: 'newest', to: 'same-wechat', text: 'current delivery' })).status, 200);
    assert.equal((await readFile(join(dir, 'sent.jsonl'), 'utf8')).trim().split('\n').length, 1);
    await until(() => existsSync(join(dir, 'poll-started')), 'a long poll should be in flight');
    assert.equal((await request('/accounts/newest', 'DELETE')).status, 200);
    await until(() => existsSync(join(dir, 'poll-returned')), 'the old long poll should finish');
    await delay(50);
    assert.equal(existsSync(join(root, 'accounts', 'newest.context-tokens.json')), false, 'late poll cannot recreate a removed context');
    assert.equal(existsSync(join(root, 'accounts', 'newest.sync.json')), false);
    assert.ok(!(await request('/targets')).body.targets.some((target: { accountId: string }) => target.accountId === 'newest'));
  } finally {
    child.kill();
    await new Promise<void>(resolve => child.exitCode !== null || child.signalCode !== null ? resolve() : child.once('exit', () => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
