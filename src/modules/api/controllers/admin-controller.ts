import type { AppConfig } from '../../../shared/config/types';
import type { RuntimeSchedulerRunNowResult } from '../../scheduler';
import type { DeliveryEvent, PollRun, StorageContext, WatchAccount } from '../../storage';
import { normalizeXUsername } from '../../storage/watch-account-repository';

export interface AdminActions {
  runDeliveryWorkerNow?(options?: { recoverStartupState?: boolean; trigger?: string }): Promise<RuntimeSchedulerRunNowResult>;
  runPollingNow?(options?: { trigger?: string }): Promise<RuntimeSchedulerRunNowResult>;
}

export interface AdminControllerOptions {
  actions?: AdminActions;
  config: AppConfig;
  storage: StorageContext;
}

export interface AdminApiErrorPayload {
  code: string;
  message: string;
}

export class AdminApiError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  public constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export async function getAdminSummary(
  options: AdminControllerOptions,
): Promise<{ ok: true; data: AdminSummary }> {
  const [watchAccounts, recentPollRuns, deliveryEventStatusCounts] = await Promise.all([
    options.storage.watchAccounts.listAll(),
    options.storage.pollRuns.listRecent(1),
    options.storage.deliveryEvents.countByStatus(),
  ]);

  return {
    ok: true,
    data: {
      deliveryEventStatusCounts,
      enabledWatchAccountsCount: watchAccounts.filter((account) => account.enabled).length,
      feishuWebhookConfigured: options.config.delivery.feishu.webhookUrl.trim().length > 0,
      latestPollRun: recentPollRuns[0] ?? null,
      service: {
        env: options.config.service.env,
        host: options.config.service.host,
        name: options.config.service.name,
        port: options.config.service.port,
      },
      sourceMode: options.config.source.mode,
      watchAccountsCount: watchAccounts.length,
      watchAccountsSource: options.config.watchAccounts.type,
    },
  };
}

export async function listAdminWatchAccounts(
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { watchAccounts: WatchAccount[] } }> {
  const watchAccounts = await options.storage.watchAccounts.listAll();

  return {
    ok: true,
    data: {
      watchAccounts,
    },
  };
}

export async function createAdminWatchAccount(
  body: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { created: boolean; watchAccount: WatchAccount } }> {
  const username = readUsername(body);
  const { created, watchAccount } = await options.storage.watchAccounts.createIfAbsentByUsername({
    enabled: true,
    xUsername: username,
  });

  return {
    ok: true,
    data: {
      created,
      watchAccount,
    },
  };
}

export async function updateAdminWatchAccount(
  params: unknown,
  body: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { watchAccount: WatchAccount } }> {
  const id = readIdParam(params);
  const enabled = readEnabled(body);
  const watchAccount = await options.storage.watchAccounts.update(id, {
    enabled,
  });

  if (watchAccount === null) {
    throw new AdminApiError(404, 'NOT_FOUND', 'Watch account was not found.');
  }

  return {
    ok: true,
    data: {
      watchAccount,
    },
  };
}

export async function listAdminPollRuns(
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { pollRuns: PollRun[] } }> {
  const pollRuns = await options.storage.pollRuns.listRecent(20);

  return {
    ok: true,
    data: {
      pollRuns,
    },
  };
}

export async function listAdminDeliveryEvents(
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { deliveryEvents: DeliveryEvent[] } }> {
  const deliveryEvents = await options.storage.deliveryEvents.listRecent(20);

  return {
    ok: true,
    data: {
      deliveryEvents,
    },
  };
}

export async function runAdminPollingNow(
  options: AdminControllerOptions,
): Promise<{ ok: true; data: RuntimeSchedulerRunNowResult }> {
  if (options.actions?.runPollingNow === undefined) {
    throw new AdminApiError(503, 'SCHEDULER_UNAVAILABLE', 'Runtime scheduler is not available.');
  }

  const result = await options.actions.runPollingNow({
    trigger: 'admin-manual',
  });

  return {
    ok: true,
    data: result,
  };
}

export async function runAdminDeliveryNow(
  options: AdminControllerOptions,
): Promise<{ ok: true; data: RuntimeSchedulerRunNowResult }> {
  if (options.actions?.runDeliveryWorkerNow === undefined) {
    throw new AdminApiError(503, 'SCHEDULER_UNAVAILABLE', 'Runtime scheduler is not available.');
  }

  const result = await options.actions.runDeliveryWorkerNow({
    recoverStartupState: false,
    trigger: 'admin-manual',
  });

  return {
    ok: true,
    data: result,
  };
}

export function renderAdminPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI 前沿消息管理</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fa;
      --panel: #ffffff;
      --text: #172033;
      --muted: #647084;
      --border: #dce1e8;
      --accent: #1666d9;
      --danger: #bd2b2b;
      --ok: #177245;
      --warn: #9a5b00;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      line-height: 1.45;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 24px;
      border-bottom: 1px solid var(--border);
      background: var(--panel);
    }
    h1, h2 { margin: 0; letter-spacing: 0; }
    h1 { font-size: 20px; }
    h2 { font-size: 16px; }
    main {
      width: min(1280px, 100%);
      margin: 0 auto;
      padding: 20px 24px 32px;
    }
    .toolbar, .summary, .section-head, form {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      margin-bottom: 18px;
    }
    .metric, section {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .metric { padding: 14px; }
    .metric .label { color: var(--muted); font-size: 12px; }
    .metric .value { margin-top: 4px; font-size: 24px; font-weight: 650; }
    section { margin-top: 16px; overflow: hidden; }
    .section-head {
      justify-content: space-between;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
    }
    input {
      min-width: 220px;
      height: 34px;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0 10px;
      font: inherit;
    }
    button {
      height: 34px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: #fff;
      color: var(--text);
      cursor: pointer;
      font: inherit;
      padding: 0 12px;
    }
    button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    button:disabled { cursor: progress; opacity: .65; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 760px; }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      text-align: left;
      vertical-align: top;
      white-space: nowrap;
    }
    th { color: var(--muted); font-size: 12px; font-weight: 600; background: #fbfcfd; }
    tr:last-child td { border-bottom: 0; }
    code { font-family: "SFMono-Regular", Consolas, monospace; font-size: 12px; }
    .muted { color: var(--muted); }
    .status { font-weight: 650; }
    .status.success, .status.sent, .status.completed { color: var(--ok); }
    .status.failed, .status.dead { color: var(--danger); }
    .status.partial_failed, .status.retry_wait, .status.skipped, .status.running, .status.sending { color: var(--warn); }
    .notice {
      min-height: 22px;
      margin: 0 0 12px;
      color: var(--muted);
    }
    @media (max-width: 720px) {
      header { align-items: flex-start; flex-direction: column; padding: 16px; }
      main { padding: 16px; }
      input, button { width: 100%; }
      form, .toolbar { width: 100%; }
    }
  </style>
</head>
<body>
  <header>
    <h1>AI 前沿消息管理</h1>
    <div class="toolbar">
      <button id="refreshButton">刷新</button>
      <button id="pollButton" class="primary">立即轮询</button>
      <button id="deliveryButton">立即发送</button>
    </div>
  </header>
  <main>
    <p id="notice" class="notice"></p>
    <div class="summary" id="summary"></div>

    <section>
      <div class="section-head">
        <h2>监听账号</h2>
        <form id="addAccountForm">
          <input id="usernameInput" name="username" autocomplete="off" placeholder="openai 或 @openai">
          <button class="primary" type="submit">添加</button>
        </form>
      </div>
      <div class="table-wrap"><table id="accountsTable"></table></div>
    </section>

    <section>
      <div class="section-head"><h2>最近轮询</h2></div>
      <div class="table-wrap"><table id="pollRunsTable"></table></div>
    </section>

    <section>
      <div class="section-head"><h2>最近发送</h2></div>
      <div class="table-wrap"><table id="deliveryEventsTable"></table></div>
    </section>
  </main>
  <script>
    const state = {
      busy: false,
    };
    const elements = {
      accountsTable: document.getElementById('accountsTable'),
      addAccountForm: document.getElementById('addAccountForm'),
      deliveryButton: document.getElementById('deliveryButton'),
      deliveryEventsTable: document.getElementById('deliveryEventsTable'),
      notice: document.getElementById('notice'),
      pollButton: document.getElementById('pollButton'),
      pollRunsTable: document.getElementById('pollRunsTable'),
      refreshButton: document.getElementById('refreshButton'),
      summary: document.getElementById('summary'),
      usernameInput: document.getElementById('usernameInput'),
    };

    async function requestJson(path, options = {}) {
      const response = await fetch(path, {
        ...options,
        headers: {
          'content-type': 'application/json',
          ...(options.headers || {}),
        },
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error?.message || '请求失败');
      }
      return payload.data;
    }

    function setBusy(value) {
      state.busy = value;
      elements.refreshButton.disabled = value;
      elements.pollButton.disabled = value;
      elements.deliveryButton.disabled = value;
      elements.addAccountForm.querySelector('button').disabled = value;
    }

    function setNotice(message, isError = false) {
      elements.notice.textContent = message;
      elements.notice.style.color = isError ? 'var(--danger)' : 'var(--muted)';
    }

    function appendCell(row, value, className) {
      const cell = document.createElement('td');
      if (className) cell.className = className;
      cell.textContent = value == null || value === '' ? '-' : String(value);
      row.appendChild(cell);
      return cell;
    }

    function renderMetric(label, value) {
      const node = document.createElement('div');
      node.className = 'metric';
      const labelNode = document.createElement('div');
      labelNode.className = 'label';
      labelNode.textContent = label;
      const valueNode = document.createElement('div');
      valueNode.className = 'value';
      valueNode.textContent = value;
      node.append(labelNode, valueNode);
      return node;
    }

    function renderSummary(summary) {
      elements.summary.replaceChildren(
        renderMetric('总账号', summary.watchAccountsCount),
        renderMetric('启用账号', summary.enabledWatchAccountsCount),
        renderMetric('最近轮询', summary.latestPollRun?.status || '-'),
        renderMetric('待发送', summary.deliveryEventStatusCounts?.pending || 0),
        renderMetric('重试等待', summary.deliveryEventStatusCounts?.retry_wait || 0),
        renderMetric('已发送', summary.deliveryEventStatusCounts?.sent || 0),
      );
    }

    function renderTable(table, columns, rows, rowRenderer) {
      const head = document.createElement('thead');
      const headRow = document.createElement('tr');
      for (const column of columns) {
        const th = document.createElement('th');
        th.textContent = column;
        headRow.appendChild(th);
      }
      head.appendChild(headRow);

      const body = document.createElement('tbody');
      if (rows.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = columns.length;
        cell.className = 'muted';
        cell.textContent = '暂无数据';
        row.appendChild(cell);
        body.appendChild(row);
      } else {
        for (const item of rows) body.appendChild(rowRenderer(item));
      }
      table.replaceChildren(head, body);
    }

    function renderAccounts(accounts) {
      renderTable(
        elements.accountsTable,
        ['username', 'enabled', 'baseline_post_id', 'last_seen_post_id', 'last_poll_status', 'last_polled_at', '操作'],
        accounts,
        (account) => {
          const row = document.createElement('tr');
          appendCell(row, '@' + account.xUsername);
          appendCell(row, account.enabled ? 'enabled' : 'disabled', account.enabled ? 'status success' : 'muted');
          appendCell(row, account.baselinePostId);
          appendCell(row, account.lastSeenPostId);
          appendCell(row, account.lastPollStatus, 'status ' + (account.lastPollStatus || ''));
          appendCell(row, account.lastPolledAt);
          const actionCell = document.createElement('td');
          const button = document.createElement('button');
          button.textContent = account.enabled ? '禁用' : '启用';
          button.addEventListener('click', () => toggleAccount(account.id, !account.enabled));
          actionCell.appendChild(button);
          row.appendChild(actionCell);
          return row;
        },
      );
    }

    function renderPollRuns(pollRuns) {
      renderTable(
        elements.pollRunsTable,
        ['started_at', 'finished_at', 'status', 'accounts', 'new_posts', 'events_created', 'error_summary'],
        pollRuns,
        (run) => {
          const row = document.createElement('tr');
          appendCell(row, run.startedAt);
          appendCell(row, run.finishedAt);
          appendCell(row, run.status, 'status ' + run.status);
          appendCell(row, run.accountsSucceeded + '/' + run.accountsTotal + ' 成功, ' + run.accountsFailed + ' 失败');
          appendCell(row, run.newPostsDetected);
          appendCell(row, run.eventsCreated);
          appendCell(row, run.errorSummary);
          return row;
        },
      );
    }

    function renderDeliveryEvents(events) {
      renderTable(
        elements.deliveryEventsTable,
        ['created_at', 'x_post_id', 'target_key', 'status', 'attempts', 'next_retry_at', 'sent_at', 'last_error'],
        events,
        (event) => {
          const row = document.createElement('tr');
          appendCell(row, event.createdAt);
          appendCell(row, event.xPostId);
          appendCell(row, event.targetKey);
          appendCell(row, event.status, 'status ' + event.status);
          appendCell(row, event.attemptCount);
          appendCell(row, event.nextRetryAt);
          appendCell(row, event.sentAt);
          appendCell(row, event.lastError);
          return row;
        },
      );
    }

    async function loadAll() {
      setBusy(true);
      try {
        const [summary, accounts, pollRuns, deliveryEvents] = await Promise.all([
          requestJson('/admin/api/summary'),
          requestJson('/admin/api/watch-accounts'),
          requestJson('/admin/api/poll-runs'),
          requestJson('/admin/api/delivery-events'),
        ]);
        renderSummary(summary);
        renderAccounts(accounts.watchAccounts);
        renderPollRuns(pollRuns.pollRuns);
        renderDeliveryEvents(deliveryEvents.deliveryEvents);
        setNotice('已刷新 ' + new Date().toLocaleString());
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error), true);
      } finally {
        setBusy(false);
      }
    }

    async function toggleAccount(id, enabled) {
      setBusy(true);
      try {
        await requestJson('/admin/api/watch-accounts/' + encodeURIComponent(id), {
          body: JSON.stringify({ enabled }),
          method: 'PATCH',
        });
        await loadAll();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error), true);
        setBusy(false);
      }
    }

    async function runAction(path) {
      setBusy(true);
      try {
        const result = await requestJson(path, { method: 'POST' });
        setNotice(result.job + ': ' + result.status);
        await loadAll();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error), true);
      } finally {
        setBusy(false);
      }
    }

    elements.refreshButton.addEventListener('click', loadAll);
    elements.pollButton.addEventListener('click', () => runAction('/admin/api/actions/poll-now'));
    elements.deliveryButton.addEventListener('click', () => runAction('/admin/api/actions/delivery-now'));
    elements.addAccountForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      setBusy(true);
      try {
        await requestJson('/admin/api/watch-accounts', {
          body: JSON.stringify({ username: elements.usernameInput.value }),
          method: 'POST',
        });
        elements.usernameInput.value = '';
        await loadAll();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error), true);
        setBusy(false);
      }
    });
    void loadAll();
  </script>
</body>
</html>`;
}

export function toAdminApiErrorPayload(error: unknown): {
  payload: { ok: false; error: AdminApiErrorPayload };
  statusCode: number;
} {
  if (error instanceof AdminApiError) {
    return {
      payload: {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
        },
      },
      statusCode: error.statusCode,
    };
  }

  return {
    payload: {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Admin request failed.',
      },
    },
    statusCode: 500,
  };
}

interface AdminSummary {
  deliveryEventStatusCounts: Record<DeliveryEvent['status'], number>;
  enabledWatchAccountsCount: number;
  feishuWebhookConfigured: boolean;
  latestPollRun: PollRun | null;
  service: {
    env: string;
    host: string;
    name: string;
    port: number;
  };
  sourceMode: string;
  watchAccountsCount: number;
  watchAccountsSource: string;
}

function readUsername(body: unknown): string {
  if (!isRecord(body)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'Request body must be a JSON object.');
  }

  const rawUsername = body.username ?? body.xUsername;

  if (typeof rawUsername !== 'string') {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'username must be a string.');
  }

  const username = normalizeXUsername(rawUsername);

  if (!/^[a-z0-9_]{1,15}$/.test(username)) {
    throw new AdminApiError(
      400,
      'INVALID_REQUEST',
      'username must be a valid X handle with 1-15 letters, numbers, or underscores.',
    );
  }

  return username;
}

function readEnabled(body: unknown): boolean {
  if (!isRecord(body)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'Request body must be a JSON object.');
  }

  if (typeof body.enabled !== 'boolean') {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'enabled must be a boolean.');
  }

  return body.enabled;
}

function readIdParam(params: unknown): string {
  if (!isRecord(params) || typeof params.id !== 'string' || params.id.trim().length === 0) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'id path parameter is required.');
  }

  return params.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
