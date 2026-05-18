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

interface AdminPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface AdminPaginationInput {
  page: number;
  pageSize: number;
}

const DEFAULT_ADMIN_PAGE_SIZE = 10;
const MAX_ADMIN_PAGE_SIZE = 100;

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
    throw new AdminApiError(404, 'NOT_FOUND', '未找到监听账号。');
  }

  return {
    ok: true,
    data: {
      watchAccount,
    },
  };
}

export async function listAdminPollRuns(
  query: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { pollRuns: PollRun[]; pagination: AdminPagination } }> {
  const paginationInput = readPaginationQuery(query);
  const [pollRuns, total] = await Promise.all([
    options.storage.pollRuns.listPage(paginationInput),
    options.storage.pollRuns.countAll(),
  ]);

  return {
    ok: true,
    data: {
      pagination: toPagination(paginationInput, total),
      pollRuns,
    },
  };
}

export async function listAdminDeliveryEvents(
  query: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { deliveryEvents: DeliveryEvent[]; pagination: AdminPagination } }> {
  const paginationInput = readPaginationQuery(query);
  const [deliveryEvents, total] = await Promise.all([
    options.storage.deliveryEvents.listPage(paginationInput),
    options.storage.deliveryEvents.countAll(),
  ]);

  return {
    ok: true,
    data: {
      deliveryEvents,
      pagination: toPagination(paginationInput, total),
    },
  };
}

export async function runAdminPollingNow(
  options: AdminControllerOptions,
): Promise<{ ok: true; data: RuntimeSchedulerRunNowResult }> {
  if (options.actions?.runPollingNow === undefined) {
    throw new AdminApiError(503, 'SCHEDULER_UNAVAILABLE', '运行时调度器不可用。');
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
    throw new AdminApiError(503, 'SCHEDULER_UNAVAILABLE', '运行时调度器不可用。');
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
    .pagination {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      padding: 12px 16px;
      border-top: 1px solid var(--border);
      color: var(--muted);
      flex-wrap: wrap;
    }
    .pagination .page-info { margin-right: auto; }
    .pagination button { min-width: 80px; }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 10;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(23, 32, 51, .45);
    }
    .modal-backdrop[aria-hidden="false"] { display: flex; }
    .modal {
      width: min(720px, 100%);
      max-height: min(680px, 90vh);
      overflow: auto;
      background: var(--panel);
      border-radius: 8px;
      border: 1px solid var(--border);
      box-shadow: 0 20px 50px rgba(23, 32, 51, .25);
    }
    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
    }
    .modal-body { padding: 16px; }
    .modal-body table { min-width: 0; }
    .modal-body td { white-space: normal; }
    .modal-body .raw-error { white-space: pre-wrap; }
    @media (max-width: 720px) {
      header { align-items: flex-start; flex-direction: column; padding: 16px; }
      main { padding: 16px; }
      input, button { width: 100%; }
      .pagination { justify-content: stretch; }
      .pagination .page-info { width: 100%; }
      .pagination button { flex: 1 1 0; min-width: 0; }
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
      <div class="pagination" id="pollRunsPagination"></div>
    </section>

    <section>
      <div class="section-head"><h2>最近发送</h2></div>
      <div class="table-wrap"><table id="deliveryEventsTable"></table></div>
      <div class="pagination" id="deliveryEventsPagination"></div>
    </section>
  </main>
  <div class="modal-backdrop" id="errorModalBackdrop" aria-hidden="true">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="errorModalTitle">
      <div class="modal-header">
        <h2 id="errorModalTitle">错误详情</h2>
        <button id="errorModalClose" type="button">关闭</button>
      </div>
      <div class="modal-body" id="errorModalBody"></div>
    </div>
  </div>
  <script>
    const DEFAULT_PAGE_SIZE = 10;
    const state = {
      busy: false,
      deliveryEventsPage: 1,
      deliveryEventsPageSize: DEFAULT_PAGE_SIZE,
      pollRunsPage: 1,
      pollRunsPageSize: DEFAULT_PAGE_SIZE,
    };
    const elements = {
      accountsTable: document.getElementById('accountsTable'),
      addAccountForm: document.getElementById('addAccountForm'),
      deliveryButton: document.getElementById('deliveryButton'),
      deliveryEventsPagination: document.getElementById('deliveryEventsPagination'),
      deliveryEventsTable: document.getElementById('deliveryEventsTable'),
      errorModalBackdrop: document.getElementById('errorModalBackdrop'),
      errorModalBody: document.getElementById('errorModalBody'),
      errorModalClose: document.getElementById('errorModalClose'),
      notice: document.getElementById('notice'),
      pollButton: document.getElementById('pollButton'),
      pollRunsPagination: document.getElementById('pollRunsPagination'),
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

    function formatDateTime(value) {
      if (value == null || value === '') {
        return '-';
      }

      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        return '-';
      }

      const padTime = (part) => String(part).padStart(2, '0');

      return (
        date.getFullYear() +
        '/' +
        (date.getMonth() + 1) +
        '/' +
        date.getDate() +
        ' ' +
        padTime(date.getHours()) +
        ':' +
        padTime(date.getMinutes()) +
        ':' +
        padTime(date.getSeconds())
      );
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
        renderMetric('最近轮询', translateStatus(summary.latestPollRun?.status)),
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

    function renderPagination(container, pagination, onPageChange) {
      const pageInfo = document.createElement('span');
      pageInfo.className = 'page-info';
      pageInfo.textContent =
        '第 ' +
        pagination.page +
        ' / ' +
        pagination.totalPages +
        ' 页，共 ' +
        pagination.total +
        ' 条，每页 ' +
        pagination.pageSize +
        ' 条';

      const previousButton = document.createElement('button');
      previousButton.textContent = '上一页';
      previousButton.disabled = pagination.page <= 1;
      previousButton.addEventListener('click', () => onPageChange(pagination.page - 1));

      const nextButton = document.createElement('button');
      nextButton.textContent = '下一页';
      nextButton.disabled = pagination.totalPages === 0 || pagination.page >= pagination.totalPages;
      nextButton.addEventListener('click', () => onPageChange(pagination.page + 1));

      container.replaceChildren(pageInfo, previousButton, nextButton);
    }

    function renderAccounts(accounts) {
      renderTable(
        elements.accountsTable,
        ['账号', '状态', '基线帖子', '最新帖子', '最近轮询状态', '最近轮询时间', '操作'],
        accounts,
        (account) => {
          const row = document.createElement('tr');
          appendCell(row, '@' + account.xUsername);
          appendCell(row, account.enabled ? '已启用' : '已禁用', account.enabled ? 'status success' : 'muted');
          appendCell(row, account.baselinePostId);
          appendCell(row, account.lastSeenPostId);
          appendCell(row, translateStatus(account.lastPollStatus), 'status ' + (account.lastPollStatus || ''));
          appendCell(row, formatDateTime(account.lastPolledAt));
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

    function renderPollRuns(pollRuns, pagination) {
      renderTable(
        elements.pollRunsTable,
        ['开始时间', '结束时间', '状态', '账号处理', '新帖数量', '待发送事件', '操作'],
        pollRuns,
        (run) => {
          const row = document.createElement('tr');
          appendCell(row, formatDateTime(run.startedAt));
          appendCell(row, formatDateTime(run.finishedAt));
          appendCell(row, translateStatus(run.status), 'status ' + run.status);
          appendCell(row, run.accountsSucceeded + '/' + run.accountsTotal + ' 成功，' + run.accountsFailed + ' 失败');
          appendCell(row, run.newPostsDetected);
          appendCell(row, run.eventsCreated);
          const actionCell = document.createElement('td');
          if (typeof run.errorSummary === 'string' && run.errorSummary.trim().length > 0) {
            const button = document.createElement('button');
            button.textContent = '查看错误';
            button.addEventListener('click', () => openErrorModal(run.errorSummary));
            actionCell.appendChild(button);
          } else {
            actionCell.className = 'muted';
            actionCell.textContent = '-';
          }
          row.appendChild(actionCell);
          return row;
        },
      );
      renderPagination(elements.pollRunsPagination, pagination, loadPollRunsPage);
    }

    function renderDeliveryEvents(events, pagination) {
      renderTable(
        elements.deliveryEventsTable,
        ['创建时间', '帖子 ID', '投递目标', '状态', '尝试次数', '下次重试时间', '发送时间', '最近错误'],
        events,
        (event) => {
          const row = document.createElement('tr');
          appendCell(row, formatDateTime(event.createdAt));
          appendCell(row, event.xPostId);
          appendCell(row, translateTargetKey(event.targetKey));
          appendCell(row, translateStatus(event.status), 'status ' + event.status);
          appendCell(row, event.attemptCount);
          appendCell(row, event.nextRetryAt);
          appendCell(row, formatDateTime(event.sentAt));
          appendCell(row, event.lastError);
          return row;
        },
      );
      renderPagination(elements.deliveryEventsPagination, pagination, loadDeliveryEventsPage);
    }

    function parseErrorSummary(errorSummary) {
      const rawText = typeof errorSummary === 'string' ? errorSummary.trim() : '';

      if (rawText.length === 0) {
        return [];
      }

      const entries = rawText.split(' | ').map((entry) => entry.trim()).filter(Boolean);

      if (entries.length === 0) {
        return [{ account: null, error: rawText }];
      }

      const parsedEntries = [];

      for (const entry of entries) {
        const separatorIndex = entry.indexOf(':');

        if (separatorIndex <= 0) {
          return [{ account: null, error: rawText }];
        }

        const account = entry.slice(0, separatorIndex).trim();
        const error = entry.slice(separatorIndex + 1).trim();

        if (account.length === 0 || error.length === 0) {
          return [{ account: null, error: rawText }];
        }

        parsedEntries.push({ account, error });
      }

      return parsedEntries;
    }

    function openErrorModal(errorSummary) {
      const parsedErrors = parseErrorSummary(errorSummary);

      if (parsedErrors.length === 0) {
        elements.errorModalBody.textContent = '-';
        elements.errorModalBackdrop.setAttribute('aria-hidden', 'false');
        return;
      }

      if (parsedErrors.length === 1 && parsedErrors[0].account === null) {
        const rawError = document.createElement('div');
        rawError.className = 'raw-error';
        rawError.textContent = parsedErrors[0].error;
        elements.errorModalBody.replaceChildren(rawError);
        elements.errorModalBackdrop.setAttribute('aria-hidden', 'false');
        return;
      }

      const table = document.createElement('table');
      const head = document.createElement('thead');
      const headRow = document.createElement('tr');

      for (const column of ['账号', '报错']) {
        const th = document.createElement('th');
        th.textContent = column;
        headRow.appendChild(th);
      }

      head.appendChild(headRow);

      const body = document.createElement('tbody');

      for (const item of parsedErrors) {
        const row = document.createElement('tr');
        appendCell(row, item.account);
        appendCell(row, item.error);
        body.appendChild(row);
      }

      table.append(head, body);
      elements.errorModalBody.replaceChildren(table);
      elements.errorModalBackdrop.setAttribute('aria-hidden', 'false');
    }

    function closeErrorModal() {
      elements.errorModalBackdrop.setAttribute('aria-hidden', 'true');
      elements.errorModalBody.replaceChildren();
    }

    function toPageQuery(page, pageSize) {
      const query = new URLSearchParams();
      query.set('page', String(page));
      query.set('pageSize', String(pageSize));
      return query.toString();
    }

    async function loadAll() {
      setBusy(true);
      try {
        const [summary, accounts, pollRuns, deliveryEvents] = await Promise.all([
          requestJson('/admin/api/summary'),
          requestJson('/admin/api/watch-accounts'),
          requestJson('/admin/api/poll-runs?' + toPageQuery(state.pollRunsPage, state.pollRunsPageSize)),
          requestJson(
            '/admin/api/delivery-events?' +
              toPageQuery(state.deliveryEventsPage, state.deliveryEventsPageSize),
          ),
        ]);
        renderSummary(summary);
        renderAccounts(accounts.watchAccounts);
        renderPollRuns(pollRuns.pollRuns, pollRuns.pagination);
        renderDeliveryEvents(deliveryEvents.deliveryEvents, deliveryEvents.pagination);
        setNotice('已刷新 ' + new Date().toLocaleString());
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error), true);
      } finally {
        setBusy(false);
      }
    }

    async function loadPollRunsPage(page) {
      if (state.busy) {
        return;
      }

      const previousPage = state.pollRunsPage;
      state.pollRunsPage = page;
      setBusy(true);

      try {
        const pollRuns = await requestJson(
          '/admin/api/poll-runs?' + toPageQuery(state.pollRunsPage, state.pollRunsPageSize),
        );
        renderPollRuns(pollRuns.pollRuns, pollRuns.pagination);
        setNotice('已刷新最近轮询 ' + new Date().toLocaleString());
      } catch (error) {
        state.pollRunsPage = previousPage;
        setNotice(error instanceof Error ? error.message : String(error), true);
      } finally {
        setBusy(false);
      }
    }

    async function loadDeliveryEventsPage(page) {
      if (state.busy) {
        return;
      }

      const previousPage = state.deliveryEventsPage;
      state.deliveryEventsPage = page;
      setBusy(true);

      try {
        const deliveryEvents = await requestJson(
          '/admin/api/delivery-events?' +
            toPageQuery(state.deliveryEventsPage, state.deliveryEventsPageSize),
        );
        renderDeliveryEvents(deliveryEvents.deliveryEvents, deliveryEvents.pagination);
        setNotice('已刷新最近发送 ' + new Date().toLocaleString());
      } catch (error) {
        state.deliveryEventsPage = previousPage;
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
        setNotice(translateJob(result.job) + '：' + translateStatus(result.status));
        await loadAll();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error), true);
      } finally {
        setBusy(false);
      }
    }

    function translateJob(job) {
      const labels = {
        'delivery-worker': '发送任务',
        polling: '轮询任务',
      };
      return labels[job] || '后台任务';
    }

    function translateStatus(status) {
      if (status == null || status === '') {
        return '-';
      }

      const labels = {
        completed: '已完成',
        dead: '已死信',
        failed: '失败',
        partial_failed: '部分失败',
        pending: '待发送',
        retry_wait: '等待重试',
        running: '运行中',
        sending: '发送中',
        sent: '已发送',
        skipped: '已跳过',
        success: '成功',
      };
      return labels[status] || String(status);
    }

    function translateTargetKey(targetKey) {
      const labels = {
        'feishu-main': '飞书机器人',
      };
      return labels[targetKey] || String(targetKey);
    }

    elements.refreshButton.addEventListener('click', loadAll);
    elements.pollButton.addEventListener('click', () => runAction('/admin/api/actions/poll-now'));
    elements.deliveryButton.addEventListener('click', () => runAction('/admin/api/actions/delivery-now'));
    elements.errorModalClose.addEventListener('click', closeErrorModal);
    elements.errorModalBackdrop.addEventListener('click', (event) => {
      if (event.target === elements.errorModalBackdrop) {
        closeErrorModal();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && elements.errorModalBackdrop.getAttribute('aria-hidden') === 'false') {
        closeErrorModal();
      }
    });
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
        message: '管理页请求失败。',
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

function readPaginationQuery(query: unknown): AdminPaginationInput {
  if (query === undefined || query === null) {
    return {
      page: 1,
      pageSize: DEFAULT_ADMIN_PAGE_SIZE,
    };
  }

  if (!isRecord(query)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '分页参数必须是查询对象。');
  }

  return {
    page: readPositiveIntegerQueryValue(query.page, 'page') ?? 1,
    pageSize: readPageSizeQueryValue(query.pageSize),
  };
}

function readPageSizeQueryValue(value: unknown): number {
  const pageSize = readPositiveIntegerQueryValue(value, 'pageSize') ?? DEFAULT_ADMIN_PAGE_SIZE;

  if (pageSize > MAX_ADMIN_PAGE_SIZE) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'pageSize 必须在 1-100 之间。');
  }

  return pageSize;
}

function readPositiveIntegerQueryValue(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    if (value.length !== 1) {
      throw new AdminApiError(400, 'INVALID_REQUEST', fieldName + ' 必须是单个正整数。');
    }

    return readPositiveIntegerQueryValue(value[0], fieldName);
  }

  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value >= 1) {
      return value;
    }

    throw new AdminApiError(400, 'INVALID_REQUEST', fieldName + ' 必须是正整数。');
  }

  if (typeof value !== 'string') {
    throw new AdminApiError(400, 'INVALID_REQUEST', fieldName + ' 必须是正整数。');
  }

  const trimmedValue = value.trim();

  if (!/^[1-9]\d*$/.test(trimmedValue)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', fieldName + ' 必须是正整数。');
  }

  const parsedValue = Number(trimmedValue);

  if (!Number.isSafeInteger(parsedValue)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', fieldName + ' 必须是正整数。');
  }

  return parsedValue;
}

function toPagination(input: AdminPaginationInput, total: number): AdminPagination {
  return {
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
}

function readUsername(body: unknown): string {
  if (!isRecord(body)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '请求体必须是 JSON 对象。');
  }

  const rawUsername = body.username ?? body.xUsername;

  if (typeof rawUsername !== 'string') {
    throw new AdminApiError(400, 'INVALID_REQUEST', '账号名必须是字符串。');
  }

  const username = normalizeXUsername(rawUsername);

  if (!/^[a-z0-9_]{1,15}$/.test(username)) {
    throw new AdminApiError(
      400,
      'INVALID_REQUEST',
      '账号名必须是合法 X 用户名，长度 1-15，只能包含字母、数字或下划线。',
    );
  }

  return username;
}

function readEnabled(body: unknown): boolean {
  if (!isRecord(body)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '请求体必须是 JSON 对象。');
  }

  if (typeof body.enabled !== 'boolean') {
    throw new AdminApiError(400, 'INVALID_REQUEST', '启用状态必须是布尔值。');
  }

  return body.enabled;
}

function readIdParam(params: unknown): string {
  if (!isRecord(params) || typeof params.id !== 'string' || params.id.trim().length === 0) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '缺少账号 ID 路径参数。');
  }

  return params.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
