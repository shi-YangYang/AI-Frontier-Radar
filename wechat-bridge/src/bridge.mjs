import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LoginSessions } from './login-sessions.mjs';
import { pruneStaleWechatBindings, saveWechatBinding } from './account-bindings.mjs';
import { isSessionInvalidated } from './session-health.mjs';

const bridgeDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const stateDir = process.env.OPENCLAW_STATE_DIR?.trim() || path.join(bridgeDir, '.state');

process.env.OPENCLAW_STATE_DIR = stateDir;
process.env.OPENCLAW_TMP_DIR = process.env.OPENCLAW_TMP_DIR?.trim() || path.join(stateDir, 'logs');

const PLUGIN_PREFIX = '@tencent-weixin/openclaw-weixin/dist/src';
const TARGETS_FILE_NAME = 'bridge-targets.json';
const DEFAULT_SERVE_PORT = 3991;
const DEFAULT_SEND_TIMEOUT_MS = 20_000;
const SYNC_BUF_TIMEOUT_MS = 35_000;

function log(message) {
  process.stdout.write(`[wechat-bridge] ${message}\n`);
}

function fail(message, code = 1) {
  process.stderr.write(`[wechat-bridge] 错误：${message}\n`);
  const error = new Error(message);
  error.reported = true;
  process.exitCode = code;
  throw error;
}

function resolveContextTokensPath(accountId) {
  return path.join(stateDir, 'openclaw-weixin', 'accounts', `${accountId}.context-tokens.json`);
}

function readContextTokens(accountId) {
  try {
    const parsed = JSON.parse(fs.readFileSync(resolveContextTokensPath(accountId), 'utf-8'));

    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// 会话被平台作废（errcode=-14）后在 tokens 文件里留下显式标记：文件存在但只有该键，
// 既让 readContextTokens 回落为空（hasContextToken=false），也让 sendText 能区分
// 「曾被判失效」与「新账号从未登记会话」（后者不拒绝发送）。
const INVALIDATED_CONTEXT_KEY = '__invalidated__';

function markContextTokensInvalidated(accountId) {
  fs.mkdirSync(path.dirname(resolveContextTokensPath(accountId)), { recursive: true });
  fs.writeFileSync(
    resolveContextTokensPath(accountId),
    JSON.stringify({ [INVALIDATED_CONTEXT_KEY]: true }),
    'utf-8',
  );
}

function isContextTokensInvalidated(accountId) {
  return readContextTokens(accountId)[INVALIDATED_CONTEXT_KEY] === true;
}

function saveContextToken(accountId, userId, token) {
  if (typeof token !== 'string' || token.length === 0) {
    return;
  }

  const tokens = readContextTokens(accountId);
  const wasInvalidated = tokens[INVALIDATED_CONTEXT_KEY] === true;
  delete tokens[INVALIDATED_CONTEXT_KEY];

  if (!wasInvalidated && tokens[userId] === token) {
    return;
  }

  tokens[userId] = token;
  fs.mkdirSync(path.dirname(resolveContextTokensPath(accountId)), { recursive: true });
  fs.writeFileSync(resolveContextTokensPath(accountId), JSON.stringify(tokens), 'utf-8');
}

function resolveContextToken(accountId, userId) {
  const tokens = readContextTokens(accountId);

  return typeof tokens[userId] === 'string' && tokens[userId].length > 0 ? tokens[userId] : undefined;
}

function resolveSendCounterPath(accountId) {
  return path.join(stateDir, 'openclaw-weixin', 'accounts', `${accountId}.send-counter.json`);
}

const SEND_QUOTA_WINDOW_MS = 24 * 60 * 60 * 1_000;
const SEND_QUOTA_LIMIT = 10;

function hardenLineBreaksForWeixin(text) {
  // 微信桌面端把 ClawBot 文本按 Markdown 渲染：单个 \n 是软换行，会被折叠成
  // 空格；只有空行（\n\n）才产生段落换行。手机端按纯文本渲染。这里把相邻
  // 非空行之间的单个换行升级为空行，并归并连续空行，保证两端换行语义一致。
  const result = [];
  let previousEmpty = true;

  for (const line of text.split('\n')) {
    const isEmpty = line.trim().length === 0;

    if (isEmpty) {
      if (!previousEmpty) {
        result.push('');
      }

      previousEmpty = true;

      continue;
    }

    if (!previousEmpty) {
      result.push('');
    }

    result.push(line);
    previousEmpty = false;
  }

  return result.join('\n');
}

function readSendCounter(accountId, userId) {
  try {
    const parsed = JSON.parse(fs.readFileSync(resolveSendCounterPath(accountId), 'utf-8'));

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return undefined;
    }

    const entry = parsed[userId];

    if (typeof entry !== 'object' || entry === null) {
      return undefined;
    }

    return {
      count: typeof entry.count === 'number' && entry.count >= 0 ? entry.count : 0,
      windowStartedAt:
        typeof entry.windowStartedAt === 'string' ? entry.windowStartedAt : new Date().toISOString(),
    };
  } catch {
    return undefined;
  }
}

function bumpSendCounter(accountId, userId) {
  const existing = readSendCounter(accountId, userId);
  const now = Date.now();
  const windowStartedAtMs =
    existing === undefined ? now : Date.parse(existing.windowStartedAt);
  const withinWindow =
    existing !== undefined &&
    Number.isFinite(windowStartedAtMs) &&
    now - windowStartedAtMs < SEND_QUOTA_WINDOW_MS;
  const count = withinWindow ? existing.count + 1 : 1;
  let all = {};

  try {
    const parsed = JSON.parse(fs.readFileSync(resolveSendCounterPath(accountId), 'utf-8'));

    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      all = parsed;
    }
  } catch {
    all = {};
  }

  all[userId] = {
    count,
    windowStartedAt: withinWindow ? existing.windowStartedAt : new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(resolveSendCounterPath(accountId)), { recursive: true });
  fs.writeFileSync(resolveSendCounterPath(accountId), JSON.stringify(all), 'utf-8');

  return count;
}

function resetSendCounter(accountId, userId) {
  try {
    const parsed = JSON.parse(fs.readFileSync(resolveSendCounterPath(accountId), 'utf-8'));
    const all =
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {};

    delete all[userId];
    fs.writeFileSync(resolveSendCounterPath(accountId), JSON.stringify(all), 'utf-8');
  } catch {
    // no counter file yet
  }
}

function resolveTargetsPath() {
  return path.join(stateDir, 'openclaw-weixin', TARGETS_FILE_NAME);
}

function readTargets() {
  try {
    const parsed = JSON.parse(fs.readFileSync(resolveTargetsPath(), 'utf-8'));

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clearBridgeAccountState(accountId) {
  fs.rmSync(resolveSendCounterPath(accountId), { force: true });
  const targets = readTargets();
  const remaining = targets.filter((target) => target.accountId !== accountId);
  if (remaining.length !== targets.length) {
    fs.writeFileSync(resolveTargetsPath(), JSON.stringify(remaining), 'utf-8');
  }
}

function recordTarget(accountId, targetId, message) {
  const targets = readTargets();
  const existing = targets.find((entry) => entry.id === targetId && entry.accountId === accountId);
  const next = targets.filter((entry) => !(entry.id === targetId && entry.accountId === accountId));
  next.push({
    accountId,
    firstSeenAt: existing?.firstSeenAt ?? new Date().toISOString(),
    id: targetId,
    lastSeenAt: new Date().toISOString(),
    ...(typeof message?.preview === 'string' && message.preview.length > 0
      ? { preview: message.preview.slice(0, 80) }
      : {}),
  });

  fs.mkdirSync(path.dirname(resolveTargetsPath()), { recursive: true });
  fs.writeFileSync(resolveTargetsPath(), JSON.stringify(next, null, 2), 'utf-8');
}

function listAccounts(plugin) {
  return plugin.accounts.listIndexedWeixinAccountIds().map((accountId) => {
    const account = plugin.accounts.loadWeixinAccount(accountId) ?? {};
    const userId = account.userId ?? null;
    const tokens = readContextTokens(accountId);

    const counter = userId === null ? undefined : readSendCounter(accountId, userId);
    const counterStartedMs = counter === undefined ? 0 : Date.parse(counter.windowStartedAt);
    const counterActive =
      counter !== undefined &&
      Number.isFinite(counterStartedMs) &&
      Date.now() - counterStartedMs < SEND_QUOTA_WINDOW_MS;

    return {
      accountId,
      baseUrl: account.baseUrl ?? plugin.accounts.DEFAULT_BASE_URL,
      contextUserIds: Object.keys(tokens).filter((key) => key !== INVALIDATED_CONTEXT_KEY),
      tokenMasked: maskToken(account.token),
      userId,
      ...(userId === null ? {} : { hasContextToken: typeof tokens[userId] === 'string' }),
      sessionInvalidated: isContextTokensInvalidated(accountId),
      sendCount: counterActive ? counter.count : 0,
      sendLimit: SEND_QUOTA_LIMIT,
    };
  });
}

async function loadPlugin() {
  const accounts = await import(`${PLUGIN_PREFIX}/auth/accounts.js`);
  const login = await import(`${PLUGIN_PREFIX}/auth/login-qr.js`);
  const send = await import(`${PLUGIN_PREFIX}/messaging/send.js`);
  const api = await import(`${PLUGIN_PREFIX}/api/api.js`);
  const syncBuf = await import(`${PLUGIN_PREFIX}/storage/sync-buf.js`);

  return { accounts, api, login, send, syncBuf };
}

function maskToken(token) {
  const value = token?.trim() ?? '';

  if (value.length <= 8) {
    return '[REDACTED]';
  }

  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

function resolveAccount(accountsModule, accountId) {
  const indexed = accountsModule.listIndexedWeixinAccountIds();
  const resolvedId = accountId?.trim() || indexed.at(-1);
  const account = resolvedId === undefined || !indexed.includes(resolvedId)
    ? null : accountsModule.loadWeixinAccount(resolvedId);

  if (resolvedId === undefined || account === null || (account.token?.trim()?.length ?? 0) === 0) {
    fail('尚未登录微信：请在「设置 → 微信」中扫码登录，或运行 npm run wechat:login。');
  }

  return {
    account,
    accountId: resolvedId,
    baseUrl: account.baseUrl?.trim() || accountsModule.DEFAULT_BASE_URL,
    token: account.token.trim(),
  };
}

async function commandLogin(plugin) {
  log('正在向微信请求登录二维码…');
  const started = await plugin.login.startWeixinLoginWithQr({});

  if (started.qrcodeUrl === undefined || started.qrcodeUrl.length === 0) {
    fail(started.message ?? '获取二维码失败。');
  }

  await plugin.login.displayQRCode(started.qrcodeUrl);
  log('请使用手机微信扫描二维码完成绑定；扫码后若提示数字校验，请在终端输入。');

  const result = await plugin.login.waitForWeixinLogin({
    sessionKey: started.sessionKey,
    timeoutMs: 480_000,
    verbose: true,
  });

  if (result.connected !== true) {
    fail(result.message ?? '登录未完成。');
  }

  saveWechatBinding(plugin.accounts, result, clearBridgeAccountState);

  log(`登录成功：accountId=${result.accountId}${result.userId ? ` userId=${result.userId}` : ''}`);
  log('下一步：给微信里的 ClawBot 随便发一条消息以登记会话，然后即可发送通知。');
}

async function commandStatus(plugin) {
  const ids = plugin.accounts.listIndexedWeixinAccountIds();

  if (ids.length === 0) {
    log(`未登录。状态目录：${stateDir}`);

    return;
  }

  for (const id of ids) {
    const account = plugin.accounts.loadWeixinAccount(id) ?? {};

    log(
      `accountId=${id} token=${maskToken(account.token)} baseUrl=${account.baseUrl ?? plugin.accounts.DEFAULT_BASE_URL}${
        account.userId ? ` userId=${account.userId}` : ''
      }`,
    );
  }

  const targets = readTargets();

  if (targets.length > 0) {
    log(`已登记会话 ${targets.length} 个（最近：${targets.at(-1)?.id}）。`);
  }
}

function commandTargets() {
  const targets = readTargets();

  if (targets.length === 0) {
    log('暂无登记会话。请给微信 ClawBot 发一条消息后重试。');

    return;
  }

  for (const target of targets) {
    log(`${target.id}  最近活跃：${target.lastSeenAt}${target.preview ? `  预览：${target.preview}` : ''}`);
  }
}

async function sendText(plugin, options) {
  const resolved = resolveAccount(plugin.accounts, options.accountId);
  const target = options.to?.trim() || resolved.account.userId?.trim() || readTargets().at(-1)?.id;

  if (target === undefined || target.length === 0) {
    fail('缺少发送目标：请先给 ClawBot 发一条消息登记会话，或使用 --to 指定目标。');
  }

  const contextToken = resolveContextToken(resolved.accountId, target);

  // 「从未登记会话」的新账号（无 tokens 文件）仍走原路径；只有被 -14 判定失效过
  // （tokens 文件带 invalidated 标记）才拒绝发送，错误信息需命中主服务的
  // WECHAT_SESSION_EXPIRED 识别模式（尚未登录）并映射 503。
  if (isContextTokensInvalidated(resolved.accountId)) {
    fail('微信会话已失效，尚未登录，请重新扫码绑定。');
  }

  const counter = readSendCounter(resolved.accountId, target);
  const counterStartedMs = counter === undefined ? 0 : Date.parse(counter.windowStartedAt);
  const counterActive =
    counter !== undefined &&
    Number.isFinite(counterStartedMs) &&
    Date.now() - counterStartedMs < SEND_QUOTA_WINDOW_MS;
  const nextCount = (counterActive ? counter.count : 0) + 1;
  const tipLines = [`当前消息[${Math.min(nextCount, SEND_QUOTA_LIMIT)}/${SEND_QUOTA_LIMIT}]`];

  if (nextCount >= SEND_QUOTA_LIMIT) {
    tipLines.push('【当前消息容量已满，请发送一条消息重置】');
  }

  const text = hardenLineBreaksForWeixin(`${options.text}\n\n---\n${tipLines.join('\n')}`);
  const result = await plugin.send.sendMessageWeixin({
    opts: {
      accountId: resolved.accountId,
      baseUrl: resolved.baseUrl,
      ...(contextToken === undefined ? {} : { contextToken }),
      token: resolved.token,
    },
    text,
    to: target,
  });

  let sentCount = null;

  try {
    sentCount = bumpSendCounter(resolved.accountId, target);
  } catch (error) {
    log(`发送计数写入失败（不影响本次发送）：${error instanceof Error ? error.message : String(error)}`);
  }

  log(
    `已发送到 ${target}（messageId=${result.messageId ?? 'unknown'}${
      sentCount === null ? '' : `，本窗口第 ${sentCount} 条`
    }）`,
  );

  return result;
}

async function commandSend(plugin, args) {
  const text = args.text;
  const to = args.to;
  const accountId = args.account;

  if (typeof text !== 'string' || text.trim().length === 0) {
    fail('缺少 --text 参数。');
  }

  await sendText(plugin, { accountId, text, to });
}

function readLoginSessionId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : 'admin';
}

function readJsonBody(request, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;

      if (body.length > maxBytes) {
        reject(new Error('请求体过大。'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(body.length === 0 ? {} : JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

async function commandServe(plugin, args) {
  const port = Number.isSafeInteger(args.port) ? args.port : DEFAULT_SERVE_PORT;
  const secret = typeof args.secret === 'string' ? args.secret.trim() : '';
  let watchAbort = false;

  const watchedAccounts = new Map();
  pruneStaleWechatBindings(plugin.accounts, clearBridgeAccountState);
  const loginSessions = new LoginSessions(plugin.accounts, { onRemoveAccount: clearBridgeAccountState });

  async function watchAccount(accountId) {
    let lastErrcodeWarned;

    while (!watchAbort) {
      const account = plugin.accounts.loadWeixinAccount(accountId);

      if (!plugin.accounts.listIndexedWeixinAccountIds().includes(accountId) ||
          account === null || (account.token?.trim()?.length ?? 0) === 0) {
        return;
      }

      const baseUrl = account.baseUrl?.trim() || plugin.accounts.DEFAULT_BASE_URL;
      const syncBufPath = plugin.syncBuf.getSyncBufFilePath(accountId);
      const syncBuf = plugin.syncBuf.loadGetUpdatesBuf(syncBufPath) ?? '';

      try {
        const response = await plugin.api.getUpdates({
          baseUrl,
          get_updates_buf: syncBuf,
          token: account.token.trim(),
          timeoutMs: SYNC_BUF_TIMEOUT_MS,
        });

        // A long poll started before rebinding must not recreate the removed session's files.
        if (!plugin.accounts.listIndexedWeixinAccountIds().includes(accountId) ||
            plugin.accounts.loadWeixinAccount(accountId)?.token !== account.token) return;

        // 平台作废会话（同号在其它环境重新扫码）：清掉本地会话凭证并停止该账号监听。
        // 账号文件保留，重新扫码后 saveWechatBinding 复用并重新拾起监听。
        // 返回前停 60 秒，避免 watchTargets 每 5 秒重新拾起造成对平台的热轮询。
        if (isSessionInvalidated(response)) {
          markContextTokensInvalidated(accountId);
          log(`会话已在其它环境重新绑定，本地会话已失效：${accountId}（请重新扫码绑定）`);
          await new Promise((resolve) => setTimeout(resolve, 60_000));
          return;
        }

        if (typeof response.errcode === 'number' && response.errcode !== 0 &&
            lastErrcodeWarned !== response.errcode) {
          lastErrcodeWarned = response.errcode;
          log(
            `账号 ${accountId} 轮询返回异常（errcode=${response.errcode}${
              typeof response.errmsg === 'string' ? `：${response.errmsg}` : ''
            }），继续监听`,
          );
        }

        if (typeof response.get_updates_buf === 'string' && response.get_updates_buf.length > 0) {
          plugin.syncBuf.saveGetUpdatesBuf(syncBufPath, response.get_updates_buf);
        }

        for (const message of response.msgs ?? []) {
          const fromUserId = typeof message?.from_user_id === 'string' ? message.from_user_id.trim() : '';

          if (fromUserId.length > 0) {
            const preview = Array.isArray(message?.item_list)
              ? message.item_list
                  .map((item) => item?.text_item?.text ?? '')
                  .filter((value) => typeof value === 'string' && value.length > 0)
                  .join(' ')
              : '';
            recordTarget(accountId, fromUserId, { preview });
            saveContextToken(accountId, fromUserId, message?.context_token);
            resetSendCounter(accountId, fromUserId);
          }
        }
      } catch (error) {
        log(
          `账号 ${accountId} 监听失败（稍后重试）：${error instanceof Error ? error.message : String(error)}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
    }
  }

  async function watchTargets() {
    let idleRounds = 0;

    while (!watchAbort) {
      const accountIds = plugin.accounts.listIndexedWeixinAccountIds();
      const unwatched = accountIds.filter((accountId) => !watchedAccounts.has(accountId));

      for (const accountId of unwatched) {
        watchedAccounts.set(accountId, true);
        void watchAccount(accountId).finally(() => watchedAccounts.delete(accountId));
        log(`开始监听账号 ${accountId} 的会话`);
      }

      idleRounds = accountIds.length === 0 ? idleRounds + 1 : 0;

      // idleRounds=0（已登录）时 0 % 6 === 0 恒为真，会导致已登录状态每轮刷屏，
      // 必须先确认当前没有任何已绑定账号才输出等待扫码提示。
      if (accountIds.length === 0 && (idleRounds === 1 || idleRounds % 6 === 0)) {
        log('尚未绑定微信账号，等待扫码（请在「设置 → 微信」中添加）');
      }

      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }

  const server = http.createServer((request, response) => {
    void (async () => {
      const requestUrl = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);

      if (request.method === 'POST' && requestUrl.pathname === '/login/start') {
        try {
          const body = await readJsonBody(request);
          const state = await loginSessions.start(readLoginSessionId(body.sessionId));

          sendJson(response, 200, {
            message: state.message,
            ok: state.status !== 'failed',
            qrcodeDataUrl: state.qrcodeDataUrl,
            qrcodeUrl: state.qrcodeUrl,
            status: state.status,
          });
        } catch (error) {
          sendJson(response, 500, {
            error: error instanceof Error ? error.message : String(error),
            ok: false,
          });
        }

        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/login/status') {
        const state = loginSessions.get(readLoginSessionId(requestUrl.searchParams.get('sessionId')));
        sendJson(response, 200, { ...state, loggedIn: state.status === 'connected', ok: true });
        return;
      }

      if (request.method === 'POST' && ['/login/code', '/login/cancel'].includes(requestUrl.pathname)) {
        try {
          const body = await readJsonBody(request);
          const sessionId = readLoginSessionId(body.sessionId);
          if (requestUrl.pathname === '/login/code') {
            loginSessions.submitCode(sessionId, body.code);
            sendJson(response, 200, { ok: true });
          } else {
            const cancelled = loginSessions.get(sessionId).status === 'connected' ? false : loginSessions.cancel(sessionId);
            sendJson(response, 200, { cancelled, ok: true });
          }
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : String(error), ok: false });
        }
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/accounts') {
        sendJson(response, 200, { accounts: listAccounts(plugin), ok: true });

        return;
      }

      if (request.method === 'DELETE' && requestUrl.pathname.startsWith('/accounts/')) {
        const accountId = decodeURIComponent(requestUrl.pathname.slice('/accounts/'.length));

        if (accountId.length === 0) {
          sendJson(response, 400, { error: 'accountId is required', ok: false });

          return;
        }

        try {
          clearBridgeAccountState(accountId);
          plugin.accounts.unregisterWeixinAccountId(accountId);
          plugin.accounts.clearWeixinAccount(accountId);
          sendJson(response, 200, { deleted: true, ok: true });
        } catch (error) {
          sendJson(response, 500, {
            error: error instanceof Error ? error.message : String(error),
            ok: false,
          });
        }

        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/targets') {
        sendJson(response, 200, { ok: true, targets: readTargets() });

        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/health') {
        const ids = plugin.accounts.listIndexedWeixinAccountIds();
        sendJson(response, 200, {
          accounts: ids.length,
          ok: true,
          stateDir,
          targets: readTargets().length,
        });

        return;
      }

      if (request.method === 'POST' && requestUrl.pathname === '/send') {
        if (secret.length > 0 && request.headers.authorization !== `Bearer ${secret}`) {
          sendJson(response, 401, { error: 'invalid bridge secret', ok: false });

          return;
        }

        try {
          const body = await readJsonBody(request);
          const text = typeof body.text === 'string' && body.text.trim().length > 0 ? body.text : '';
          const title = typeof body.title === 'string' ? body.title.trim() : '';
          const url = typeof body.url === 'string' ? body.url.trim() : '';
          const to = typeof body.to === 'string' ? body.to.trim() : undefined;

          if (text.length === 0) {
            sendJson(response, 400, { error: 'text is required', ok: false });

            return;
          }

          const composed =
            title.length > 0 && !text.startsWith(title) ? `${title}\n${text}` : text;
          const finalText = url.length > 0 && !composed.includes(url) ? `${composed}\n${url}` : composed;
          const bodyAccountId = typeof body.accountId === 'string' ? body.accountId.trim() : '';
          const result = await sendText(plugin, {
            accountId: bodyAccountId || args.account,
            text: finalText,
            to,
          });

          sendJson(response, 200, { messageId: result.messageId, ok: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          sendJson(response, message.includes('尚未登录') ? 503 : 502, { error: message, ok: false });
        }

        return;
      }

      sendJson(response, 404, { error: 'not found', ok: false });
    })();
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  log(`微信桥已启动：http://127.0.0.1:${port}（POST /send，GET /health）`);
  log(`状态目录：${stateDir}`);
  void watchTargets();

  await new Promise((resolve) => {
    const shutdown = () => {
      watchAbort = true;
      loginSessions.close();
      server.close(() => resolve());
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[index + 1];

    if (value === undefined || value.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = key === 'port' ? Number.parseInt(value, 10) : value;
    index += 1;
  }

  return args;
}

function printHelp() {
  process.stdout.write(`用法: node src/bridge.mjs <command> [options]

命令:
  login                    二维码登录微信（扫码绑定 ClawBot）
  status                   查看登录账号与会话数量
  targets                  查看已登记的会话目标
  send --text <文本> [--to <目标>] [--account <账号>]
  serve [--port 3991] [--secret <密钥>] [--account <账号>]

环境变量:
  OPENCLAW_STATE_DIR       状态目录（默认 wechat-bridge/.state）
`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (command === undefined || command === 'help' || args.help === true) {
    printHelp();
    process.exitCode = command === undefined ? 1 : 0;

    return;
  }

  const plugin = await loadPlugin();

  switch (command) {
    case 'login':
      await commandLogin(plugin);
      break;
    case 'status':
      await commandStatus(plugin);
      break;
    case 'targets':
      commandTargets();
      break;
    case 'send':
      await commandSend(plugin, args);
      break;
    case 'serve':
      await commandServe(plugin, args);
      break;
    default:
      fail(`未知命令：${command}`);
  }
}

main().catch((error) => {
  if (process.exitCode === undefined || process.exitCode === 0) {
    process.exitCode = 1;
  }

  if (error instanceof Error && error.reported !== true) {
    process.stderr.write(`[wechat-bridge] ${error.stack ?? error.message}\n`);
  }
});
