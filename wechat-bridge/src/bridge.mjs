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

function recordTarget(targetId, message) {
  const targets = readTargets().filter((entry) => entry.id !== targetId);
  targets.push({
    firstSeenAt: targets.find((entry) => entry.id === targetId)?.firstSeenAt ?? new Date().toISOString(),
    id: targetId,
    lastSeenAt: new Date().toISOString(),
    ...(typeof message?.preview === 'string' && message.preview.length > 0
      ? { preview: message.preview.slice(0, 80) }
      : {}),
  });

  fs.mkdirSync(path.dirname(resolveTargetsPath()), { recursive: true });
  fs.writeFileSync(resolveTargetsPath(), JSON.stringify(targets, null, 2), 'utf-8');
}

async function loadPlugin() {
  const accounts = await import(`${PLUGIN_PREFIX}/auth/accounts.js`);
  const login = await import(`${PLUGIN_PREFIX}/auth/login-qr.js`);
  const send = await import(`${PLUGIN_PREFIX}/messaging/send.js`);
  const api = await import(`${PLUGIN_PREFIX}/api/api.js`);

  return { accounts, api, login, send };
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
    fail('尚未登录微信，请先在 wechat-bridge 目录运行 npm run login（或 npm run wechat:login）。');
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

  const result = await plugin.send.sendMessageWeixin({
    opts: {
      accountId: resolved.accountId,
      baseUrl: resolved.baseUrl,
      token: resolved.token,
    },
    text: options.text,
    to: target,
  });

  log(`已发送到 ${target}（messageId=${result.messageId ?? 'unknown'}）`);

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

  async function watchTargets() {
    while (!watchAbort) {
      let resolved;

      try {
        resolved = resolveAccount(plugin.accounts, args.account);
      } catch (error) {
        log(`尚未登录，10 秒后重试监听会话（如需登录请运行 npm run wechat:login）`);
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        continue;
      }

      try {
        const response = await plugin.api.getUpdates({
          baseUrl: resolved.baseUrl,
          token: resolved.token,
          timeoutMs: SYNC_BUF_TIMEOUT_MS,
        });

        for (const message of response.msgs ?? []) {
          const fromUserId = typeof message?.from_user_id === 'string' ? message.from_user_id.trim() : '';

          if (fromUserId.length > 0 && fromUserId !== resolved.account.userId) {
            const preview = Array.isArray(message?.item_list)
              ? message.item_list
                  .map((item) => item?.text_item?.text ?? '')
                  .filter((value) => typeof value === 'string' && value.length > 0)
                  .join(' ')
              : '';
            recordTarget(fromUserId, { preview });
          }
        }
      } catch (error) {
        log(`监听会话失败（稍后重试）：${error instanceof Error ? error.message : String(error)}`);
        await new Promise((resolve) => setTimeout(resolve, 3_000));
      }
    }
  }

  const server = http.createServer((request, response) => {
    void (async () => {
      const requestUrl = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);

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
          const result = await sendText(plugin, { accountId: args.account, text: finalText, to });

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
