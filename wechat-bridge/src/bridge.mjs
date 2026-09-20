import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

function saveContextToken(accountId, userId, token) {
  if (typeof token !== 'string' || token.length === 0) {
    return;
  }

  const tokens = readContextTokens(accountId);

  if (tokens[userId] === token) {
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
      contextUserIds: Object.keys(tokens),
      tokenMasked: maskToken(account.token),
      userId,
      ...(userId === null ? {} : { hasContextToken: typeof tokens[userId] === 'string' }),
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
  const account = resolvedId === undefined ? null : accountsModule.loadWeixinAccount(resolvedId);

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

  plugin.accounts.registerWeixinAccountId(result.accountId);
  plugin.accounts.saveWeixinAccount(result.accountId, {
    baseUrl: result.baseUrl,
    token: result.botToken,
    userId: result.userId,
  });

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
  log(
    contextToken === undefined
      ? `发送未携带 context_token（${target}）：请让该微信号给 ClawBot 发一条消息以激活会话`
      : `发送携带 context_token（${target}）`,
  );

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

  const text = `${options.text}\n\n---\n${tipLines.join('\n')}`;
  log(`发送 tip：${tipLines.join(' / ')}`);
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

let webLoginState = {
  accountId: undefined,
  message: undefined,
  qrcodeDataUrl: undefined,
  qrcodeUrl: undefined,
  sessionKey: undefined,
  status: 'idle',
};
let webLoginGeneration = 0;
let webLoginPatched = false;

function patchStdoutForLoginSignals() {
  if (webLoginPatched) {
    return;
  }

  webLoginPatched = true;
  const originalWrite = process.stdout.write.bind(process.stdout);

  process.stdout.write = (chunk, encoding, callback) => {
    const text = typeof chunk === 'string' ? chunk : chunk?.toString?.() ?? '';

    if (text.includes('输入手机微信显示的数字') || text.includes('请重新输入')) {
      if (webLoginState.status === 'pending' || webLoginState.status === 'scanned') {
        webLoginState = { ...webLoginState, message: '请输入手机微信上显示的数字。', status: 'need-code' };
      }
    } else if (text.includes('正在验证')) {
      if (webLoginState.status === 'pending' || webLoginState.status === 'need-code') {
        webLoginState = { ...webLoginState, message: '已扫码，等待微信确认…', status: 'scanned' };
      }
    }

    return originalWrite(chunk, encoding, callback);
  };
}

async function startWebLogin(plugin, options = {}) {
  patchStdoutForLoginSignals();
  const generation = (webLoginGeneration += 1);
  const started = await plugin.login.startWeixinLoginWithQr({ force: options.force === true });

  if (started.qrcodeUrl === undefined || started.qrcodeUrl.length === 0) {
    webLoginState = { message: started.message ?? '获取二维码失败。', status: 'failed' };

    return webLoginState;
  }

  let qrcodeDataUrl;

  try {
    const qrcodeModule = await import('qrcode');
    qrcodeDataUrl = await qrcodeModule.default.toDataURL(started.qrcodeUrl, {
      margin: 1,
      width: 260,
    });
  } catch (error) {
    log(`生成二维码图片失败（可使用链接继续）：${error instanceof Error ? error.message : String(error)}`);
  }

  webLoginState = {
    message: '请使用手机微信扫码，并在微信中确认。',
    qrcodeDataUrl,
    qrcodeUrl: started.qrcodeUrl,
    sessionKey: started.sessionKey,
    status: 'pending',
  };

  void plugin.login
    .waitForWeixinLogin({ sessionKey: started.sessionKey, timeoutMs: 480_000 })
    .then((result) => {
      if (generation !== webLoginGeneration) {
        return;
      }

      if (result.connected === true) {
        plugin.accounts.registerWeixinAccountId(result.accountId);
        plugin.accounts.saveWeixinAccount(result.accountId, {
          baseUrl: result.baseUrl,
          token: result.botToken,
          userId: result.userId,
        });
        webLoginState = {
          accountId: result.accountId,
          message: '登录成功。请给微信里的 ClawBot 发一条消息以登记会话。',
          status: 'connected',
          ...(result.userId === undefined ? {} : { userId: result.userId }),
        };
        log(`Web 登录成功：accountId=${result.accountId}`);
        return;
      }

      webLoginState = {
        message: result.message ?? '登录未完成。',
        status: result.alreadyConnected === true ? 'connected' : 'failed',
        ...(result.accountId === undefined ? {} : { accountId: result.accountId }),
      };
    })
    .catch((error) => {
      if (generation === webLoginGeneration) {
        webLoginState = {
          message: error instanceof Error ? error.message : String(error),
          status: 'failed',
        };
      }
    });

  return webLoginState;
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

  async function watchAccount(accountId) {
    while (!watchAbort) {
      const account = plugin.accounts.loadWeixinAccount(accountId);

      if (account === null || (account.token?.trim()?.length ?? 0) === 0) {
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

      if (idleRounds === 1 || idleRounds % 6 === 0) {
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
          const state = await startWebLogin(plugin, { force: body.force === true });

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
        const ids = plugin.accounts.listIndexedWeixinAccountIds();

        sendJson(response, 200, {
          accountId: webLoginState.accountId ?? (webLoginState.status === 'idle' ? ids.at(-1) : undefined),
          loggedIn: ids.length > 0,
          message: webLoginState.message,
          ok: true,
          qrcodeDataUrl: webLoginState.status === 'pending' || webLoginState.status === 'need-code'
            ? webLoginState.qrcodeDataUrl
            : undefined,
          status: webLoginState.status,
          userId: webLoginState.userId,
        });

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
