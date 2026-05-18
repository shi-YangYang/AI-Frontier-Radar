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
  from?: string;
  page: number;
  pageSize: number;
  to?: string;
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

export async function deleteAdminWatchAccount(
  params: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { deleted: true } }> {
  const id = readIdParam(params);
  const deleted = await options.storage.watchAccounts.delete(id);

  if (!deleted) {
    throw new AdminApiError(404, 'NOT_FOUND', '未找到监听账号。');
  }

  return {
    ok: true,
    data: {
      deleted: true,
    },
  };
}

export async function listAdminPollRuns(
  query: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { pollRuns: PollRun[]; pagination: AdminPagination } }> {
  const paginationInput = readPaginationQuery(query);
  const total = await options.storage.pollRuns.countAll(paginationInput);
  const resolvedPaginationInput = clampPaginationInput(paginationInput, total);
  const pollRuns = await options.storage.pollRuns.listPage(resolvedPaginationInput);

  return {
    ok: true,
    data: {
      pagination: toPagination(resolvedPaginationInput, total),
      pollRuns,
    },
  };
}

export async function listAdminDeliveryEvents(
  query: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { deliveryEvents: DeliveryEvent[]; pagination: AdminPagination } }> {
  const paginationInput = readPaginationQuery(query);
  const total = await options.storage.deliveryEvents.countAll(paginationInput);
  const resolvedPaginationInput = clampPaginationInput(paginationInput, total);
  const deliveryEvents = await options.storage.deliveryEvents.listPage(resolvedPaginationInput);

  return {
    ok: true,
    data: {
      deliveryEvents,
      pagination: toPagination(resolvedPaginationInput, total),
    },
  };
}

export async function deleteAdminPollRun(
  params: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { deleted: true } }> {
  const id = readIdParam(params);
  const deleted = await options.storage.pollRuns.delete(id);

  if (!deleted) {
    throw new AdminApiError(404, 'NOT_FOUND', '未找到轮询记录。');
  }

  return {
    ok: true,
    data: {
      deleted: true,
    },
  };
}

export async function deleteAdminDeliveryEvent(
  params: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { deleted: true } }> {
  const id = readIdParam(params);
  const deleted = await options.storage.deliveryEvents.delete(id);

  if (!deleted) {
    throw new AdminApiError(404, 'NOT_FOUND', '未找到发送记录。');
  }

  return {
    ok: true,
    data: {
      deleted: true,
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
    label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
      font-size: 12px;
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
    .pagination input {
      min-width: 92px;
      width: 92px;
    }
    .filter-form input {
      min-width: 190px;
    }
    .action-buttons {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
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
      input, button, label { width: 100%; }
      label { align-items: flex-start; flex-direction: column; }
      .pagination { justify-content: stretch; }
      .pagination .page-info { width: 100%; }
      .pagination button { flex: 1 1 0; min-width: 0; }
      form, .toolbar { width: 100%; }
    }
  </style>
</head>
<body>
  <header>
    <h1 id="pageTitle">AI 前沿消息管理</h1>
    <div class="toolbar">
      <button id="refreshButton">刷新</button>
      <button id="pollButton" class="primary">立即轮询</button>
      <button id="deliveryButton">立即发送</button>
      <button id="languageButton" type="button">English</button>
    </div>
  </header>
  <main>
    <p id="notice" class="notice"></p>
    <div class="summary" id="summary"></div>

    <section>
      <div class="section-head">
        <h2 id="accountsSectionTitle">监听账号</h2>
        <form id="addAccountForm">
          <input id="usernameInput" name="username" autocomplete="off" placeholder="openai 或 @openai">
          <button id="addAccountButton" class="primary" type="submit">添加</button>
        </form>
      </div>
      <div class="table-wrap"><table id="accountsTable"></table></div>
    </section>

    <section>
      <div class="section-head">
        <h2 id="pollRunsSectionTitle">最近轮询</h2>
        <form id="pollRunsFilterForm" class="filter-form">
          <label><span id="pollRunsFromLabel">开始时间</span><input id="pollRunsFromInput" type="datetime-local"></label>
          <label><span id="pollRunsToLabel">结束时间</span><input id="pollRunsToInput" type="datetime-local"></label>
          <button id="pollRunsQueryButton" class="primary" type="submit">查询</button>
          <button id="pollRunsClearButton" type="button">清空</button>
        </form>
      </div>
      <div class="table-wrap"><table id="pollRunsTable"></table></div>
      <div class="pagination" id="pollRunsPagination"></div>
    </section>

    <section>
      <div class="section-head">
        <h2 id="deliveryEventsSectionTitle">最近发送</h2>
        <form id="deliveryEventsFilterForm" class="filter-form">
          <label><span id="deliveryEventsFromLabel">开始时间</span><input id="deliveryEventsFromInput" type="datetime-local"></label>
          <label><span id="deliveryEventsToLabel">结束时间</span><input id="deliveryEventsToInput" type="datetime-local"></label>
          <button id="deliveryEventsQueryButton" class="primary" type="submit">查询</button>
          <button id="deliveryEventsClearButton" type="button">清空</button>
        </form>
      </div>
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
    const DEFAULT_LANGUAGE = 'zh-CN';
    const LANGUAGE_STORAGE_KEY = 'admin.language';
    const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US'];
    const translations = {
      'zh-CN': {
        'actions.clearQuery': '清空',
        'actions.delete': '删除',
        'actions.deliveryNow': '立即发送',
        'actions.disable': '禁用',
        'actions.enable': '启用',
        'actions.jumpPage': '跳转',
        'actions.nextPage': '下一页',
        'actions.pollNow': '立即轮询',
        'actions.query': '查询',
        'actions.previousPage': '上一页',
        'actions.refresh': '刷新',
        'actions.viewError': '查看错误',
        'accounts.disabled': '已禁用',
        'accounts.enabled': '已启用',
        'confirm.deleteAccount': '确认删除此监听账号？删除后该账号不再参与后续轮询。',
        'confirm.deleteDeliveryEvent': '确认删除此发送记录？',
        'confirm.deletePendingDeliveryEvent': '确认删除此发送记录？删除后不会继续发送或重试。',
        'confirm.deletePollRun': '确认删除此轮询记录？',
        'empty.noData': '暂无数据',
        'form.addAccount': '添加',
        'form.fromTime': '开始时间',
        'form.pagePlaceholder': '页码',
        'form.toTime': '结束时间',
        'form.usernamePlaceholder': 'openai 或 @openai',
        'jobs.background': '后台任务',
        'jobs.delivery-worker': '发送任务',
        'jobs.polling': '轮询任务',
        'language.target.en-US': 'English',
        'language.target.zh-CN': '中文',
        'modal.accountColumn': '账号',
        'modal.close': '关闭',
        'modal.errorColumn': '报错',
        'modal.errorTitle': '错误详情',
        'notice.actionResult': '{job}：{status}',
        'notice.accountDeleted': '已删除监听账号。',
        'notice.deliveryEventDeleted': '已删除发送记录。',
        'notice.deliveryEventsRefreshed': '已刷新最近发送 {time}',
        'notice.invalidPage': '页码必须是数字。',
        'notice.invalidTimeRange': '开始时间不能晚于结束时间。',
        'notice.pollRunDeleted': '已删除轮询记录。',
        'notice.pollRunsRefreshed': '已刷新最近轮询 {time}',
        'notice.refreshed': '已刷新 {time}',
        'notice.requestFailed': '请求失败',
        'page.title': 'AI 前沿消息管理',
        'pagination.summary': '第 {page} / {totalPages} 页，共 {total} 条，每页 {pageSize} 条',
        'pollRuns.accountProgress': '{succeeded}/{total} 成功，{failed} 失败',
        'sections.accounts': '监听账号',
        'sections.deliveryEvents': '最近发送',
        'sections.pollRuns': '最近轮询',
        'status.completed': '已完成',
        'status.dead': '已死信',
        'status.failed': '失败',
        'status.partial_failed': '部分失败',
        'status.pending': '待发送',
        'status.retry_wait': '等待重试',
        'status.running': '运行中',
        'status.sending': '发送中',
        'status.sent': '已发送',
        'status.skipped': '已跳过',
        'status.success': '成功',
        'summary.enabledAccounts': '启用账号',
        'summary.latestPollRun': '最近轮询',
        'summary.pendingDelivery': '待发送',
        'summary.retryWait': '重试等待',
        'summary.sentDelivery': '已发送',
        'summary.totalAccounts': '总账号',
        'table.account': '账号',
        'table.actions': '操作',
        'table.attemptCount': '尝试次数',
        'table.baselinePost': '基线帖子',
        'table.createdAt': '创建时间',
        'table.finishedAt': '结束时间',
        'table.lastError': '最近错误',
        'table.lastPollStatus': '最近轮询状态',
        'table.lastPolledAt': '最近轮询时间',
        'table.latestPost': '最新帖子',
        'table.nextRetryAt': '下次重试时间',
        'table.newPosts': '新帖数量',
        'table.pendingEvents': '待发送事件',
        'table.pollProgress': '账号处理',
        'table.postId': '帖子 ID',
        'table.sentAt': '发送时间',
        'table.startedAt': '开始时间',
        'table.status': '状态',
        'table.target': '投递目标',
      },
      'en-US': {
        'actions.deliveryNow': 'Send now',
        'actions.disable': 'Disable',
        'actions.enable': 'Enable',
        'actions.nextPage': 'Next',
        'actions.pollNow': 'Poll now',
        'actions.previousPage': 'Previous',
        'actions.refresh': 'Refresh',
        'actions.viewError': 'View errors',
        'accounts.disabled': 'Disabled',
        'accounts.enabled': 'Enabled',
        'empty.noData': 'No data',
        'form.addAccount': 'Add',
        'form.usernamePlaceholder': 'openai or @openai',
        'jobs.background': 'Background job',
        'jobs.delivery-worker': 'Delivery job',
        'jobs.polling': 'Polling job',
        'language.target.en-US': 'English',
        'language.target.zh-CN': '中文',
        'modal.accountColumn': 'Account',
        'modal.close': 'Close',
        'modal.errorColumn': 'Error',
        'modal.errorTitle': 'Error details',
        'notice.actionResult': '{job}: {status}',
        'notice.deliveryEventsRefreshed': 'Recent delivery events refreshed {time}',
        'notice.pollRunsRefreshed': 'Recent poll runs refreshed {time}',
        'notice.refreshed': 'Refreshed {time}',
        'notice.requestFailed': 'Request failed',
        'page.title': 'AI Frontier Monitor Admin',
        'pagination.summary': 'Page {page} / {totalPages}, {total} total, {pageSize} per page',
        'pollRuns.accountProgress': '{succeeded}/{total} succeeded, {failed} failed',
        'sections.accounts': 'Watch accounts',
        'sections.deliveryEvents': 'Recent delivery events',
        'sections.pollRuns': 'Recent poll runs',
        'status.completed': 'Completed',
        'status.dead': 'Dead-lettered',
        'status.failed': 'Failed',
        'status.partial_failed': 'Partially failed',
        'status.pending': 'Pending',
        'status.retry_wait': 'Waiting to retry',
        'status.running': 'Running',
        'status.sending': 'Sending',
        'status.sent': 'Sent',
        'status.skipped': 'Skipped',
        'status.success': 'Success',
        'summary.enabledAccounts': 'Enabled accounts',
        'summary.latestPollRun': 'Latest poll run',
        'summary.pendingDelivery': 'Pending delivery',
        'summary.retryWait': 'Retry wait',
        'summary.sentDelivery': 'Sent',
        'summary.totalAccounts': 'Total accounts',
        'table.account': 'Account',
        'table.actions': 'Actions',
        'table.attemptCount': 'Attempts',
        'table.baselinePost': 'Baseline post',
        'table.createdAt': 'Created at',
        'table.finishedAt': 'Finished at',
        'table.lastError': 'Latest error',
        'table.lastPollStatus': 'Latest poll status',
        'table.lastPolledAt': 'Latest poll time',
        'table.latestPost': 'Latest post',
        'table.nextRetryAt': 'Next retry at',
        'table.newPosts': 'New posts',
        'table.pendingEvents': 'Pending events',
        'table.pollProgress': 'Account progress',
        'table.postId': 'Post ID',
        'table.sentAt': 'Sent at',
        'table.startedAt': 'Started at',
        'table.status': 'Status',
        'table.target': 'Target',
      },
    };

    function isSupportedLanguage(language) {
      return SUPPORTED_LANGUAGES.includes(language);
    }

    function readSavedLanguage() {
      try {
        const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
        return isSupportedLanguage(savedLanguage) ? savedLanguage : DEFAULT_LANGUAGE;
      } catch {
        return DEFAULT_LANGUAGE;
      }
    }

    const state = {
      busy: false,
      deliveryEventsPage: 1,
      deliveryEventsPageSize: DEFAULT_PAGE_SIZE,
      deliveryEvents: null,
      deliveryEventsFilters: { from: '', to: '' },
      deliveryEventsPagination: null,
      errorSummary: null,
      language: readSavedLanguage(),
      notice: null,
      pollRunsPage: 1,
      pollRunsPageSize: DEFAULT_PAGE_SIZE,
      pollRuns: null,
      pollRunsFilters: { from: '', to: '' },
      pollRunsPagination: null,
      summary: null,
      watchAccounts: null,
    };
    const elements = {
      accountsTable: document.getElementById('accountsTable'),
      accountsSectionTitle: document.getElementById('accountsSectionTitle'),
      addAccountButton: document.getElementById('addAccountButton'),
      addAccountForm: document.getElementById('addAccountForm'),
      deliveryButton: document.getElementById('deliveryButton'),
      deliveryEventsClearButton: document.getElementById('deliveryEventsClearButton'),
      deliveryEventsFilterForm: document.getElementById('deliveryEventsFilterForm'),
      deliveryEventsFromLabel: document.getElementById('deliveryEventsFromLabel'),
      deliveryEventsFromInput: document.getElementById('deliveryEventsFromInput'),
      deliveryEventsQueryButton: document.getElementById('deliveryEventsQueryButton'),
      deliveryEventsSectionTitle: document.getElementById('deliveryEventsSectionTitle'),
      deliveryEventsPagination: document.getElementById('deliveryEventsPagination'),
      deliveryEventsTable: document.getElementById('deliveryEventsTable'),
      deliveryEventsToLabel: document.getElementById('deliveryEventsToLabel'),
      deliveryEventsToInput: document.getElementById('deliveryEventsToInput'),
      errorModalBackdrop: document.getElementById('errorModalBackdrop'),
      errorModalBody: document.getElementById('errorModalBody'),
      errorModalClose: document.getElementById('errorModalClose'),
      errorModalTitle: document.getElementById('errorModalTitle'),
      languageButton: document.getElementById('languageButton'),
      notice: document.getElementById('notice'),
      pageTitle: document.getElementById('pageTitle'),
      pollButton: document.getElementById('pollButton'),
      pollRunsClearButton: document.getElementById('pollRunsClearButton'),
      pollRunsFilterForm: document.getElementById('pollRunsFilterForm'),
      pollRunsFromLabel: document.getElementById('pollRunsFromLabel'),
      pollRunsFromInput: document.getElementById('pollRunsFromInput'),
      pollRunsQueryButton: document.getElementById('pollRunsQueryButton'),
      pollRunsSectionTitle: document.getElementById('pollRunsSectionTitle'),
      pollRunsPagination: document.getElementById('pollRunsPagination'),
      pollRunsTable: document.getElementById('pollRunsTable'),
      pollRunsToLabel: document.getElementById('pollRunsToLabel'),
      pollRunsToInput: document.getElementById('pollRunsToInput'),
      refreshButton: document.getElementById('refreshButton'),
      summary: document.getElementById('summary'),
      usernameInput: document.getElementById('usernameInput'),
    };

    function saveLanguage(language) {
      try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
      } catch {
        // Language persistence is best-effort; the page still works in memory.
      }
    }

    function t(key, values = {}) {
      const currentTranslations = translations[state.language] || translations[DEFAULT_LANGUAGE];
      const defaultTranslations = translations[DEFAULT_LANGUAGE];
      const template = currentTranslations[key] || defaultTranslations[key] || key;

      return template.replace(/\\{([a-zA-Z0-9_]+)\\}/g, (_match, name) => {
        if (!Object.prototype.hasOwnProperty.call(values, name)) {
          return '{' + name + '}';
        }

        return String(values[name]);
      });
    }

    function setLanguage(language, options = {}) {
      state.language = isSupportedLanguage(language) ? language : DEFAULT_LANGUAGE;

      if (options.persist !== false) {
        saveLanguage(state.language);
      }

      renderStaticLabels();
      renderLoadedData();
      renderNotice();

      if (elements.errorModalBackdrop.getAttribute('aria-hidden') === 'false') {
        renderErrorModalBody();
      }
    }

    function toggleLanguage() {
      setLanguage(state.language === 'zh-CN' ? 'en-US' : 'zh-CN');
    }

    function renderStaticLabels() {
      document.documentElement.lang = state.language;
      document.title = t('page.title');
      elements.pageTitle.textContent = t('page.title');
      elements.refreshButton.textContent = t('actions.refresh');
      elements.pollButton.textContent = t('actions.pollNow');
      elements.deliveryButton.textContent = t('actions.deliveryNow');
      elements.languageButton.textContent =
        state.language === 'zh-CN' ? t('language.target.en-US') : t('language.target.zh-CN');
      elements.accountsSectionTitle.textContent = t('sections.accounts');
      elements.pollRunsSectionTitle.textContent = t('sections.pollRuns');
      elements.deliveryEventsSectionTitle.textContent = t('sections.deliveryEvents');
      elements.usernameInput.placeholder = t('form.usernamePlaceholder');
      elements.addAccountButton.textContent = t('form.addAccount');
      elements.pollRunsFromLabel.textContent = t('form.fromTime');
      elements.pollRunsFromInput.title = t('form.fromTime');
      elements.pollRunsToLabel.textContent = t('form.toTime');
      elements.pollRunsToInput.title = t('form.toTime');
      elements.pollRunsQueryButton.textContent = t('actions.query');
      elements.pollRunsClearButton.textContent = t('actions.clearQuery');
      elements.deliveryEventsFromLabel.textContent = t('form.fromTime');
      elements.deliveryEventsFromInput.title = t('form.fromTime');
      elements.deliveryEventsToLabel.textContent = t('form.toTime');
      elements.deliveryEventsToInput.title = t('form.toTime');
      elements.deliveryEventsQueryButton.textContent = t('actions.query');
      elements.deliveryEventsClearButton.textContent = t('actions.clearQuery');
      elements.errorModalTitle.textContent = t('modal.errorTitle');
      elements.errorModalClose.textContent = t('modal.close');
    }

    function renderLoadedData() {
      if (state.summary !== null) {
        renderSummary(state.summary);
      }

      if (state.watchAccounts !== null) {
        renderAccounts(state.watchAccounts);
      }

      if (state.pollRuns !== null && state.pollRunsPagination !== null) {
        renderPollRuns(state.pollRuns, state.pollRunsPagination);
      }

      if (state.deliveryEvents !== null && state.deliveryEventsPagination !== null) {
        renderDeliveryEvents(state.deliveryEvents, state.deliveryEventsPagination);
      }
    }

    async function requestJson(path, options = {}) {
      const headers = {
        ...(options.headers || {}),
      };

      if (options.body !== undefined && !Object.prototype.hasOwnProperty.call(headers, 'content-type')) {
        headers['content-type'] = 'application/json';
      }

      const response = await fetch(path, {
        ...options,
        headers,
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error?.message || t('notice.requestFailed'));
      }
      return payload.data;
    }

    function setBusy(value) {
      state.busy = value;
      elements.refreshButton.disabled = value;
      elements.pollButton.disabled = value;
      elements.deliveryButton.disabled = value;
      elements.addAccountButton.disabled = value;
      elements.pollRunsQueryButton.disabled = value;
      elements.pollRunsClearButton.disabled = value;
      elements.deliveryEventsQueryButton.disabled = value;
      elements.deliveryEventsClearButton.disabled = value;
    }

    function setNoticeKey(key, values = {}, isError = false) {
      state.notice = { isError, key, type: 'key', values };
      renderNotice();
    }

    function setRawNotice(message, isError = false) {
      state.notice = { isError, message, type: 'raw' };
      renderNotice();
    }

    function renderNotice() {
      if (state.notice === null) {
        elements.notice.textContent = '';
        elements.notice.style.color = 'var(--muted)';
        return;
      }

      elements.notice.textContent =
        state.notice.type === 'key' ? t(state.notice.key, state.notice.values) : state.notice.message;
      elements.notice.style.color = state.notice.isError ? 'var(--danger)' : 'var(--muted)';
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
        renderMetric(t('summary.totalAccounts'), summary.watchAccountsCount),
        renderMetric(t('summary.enabledAccounts'), summary.enabledWatchAccountsCount),
        renderMetric(t('summary.latestPollRun'), translateStatus(summary.latestPollRun?.status)),
        renderMetric(t('summary.pendingDelivery'), summary.deliveryEventStatusCounts?.pending || 0),
        renderMetric(t('summary.retryWait'), summary.deliveryEventStatusCounts?.retry_wait || 0),
        renderMetric(t('summary.sentDelivery'), summary.deliveryEventStatusCounts?.sent || 0),
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
        cell.textContent = t('empty.noData');
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
      pageInfo.textContent = t('pagination.summary', {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: pagination.total,
        totalPages: pagination.totalPages,
      });

      const previousButton = document.createElement('button');
      previousButton.textContent = t('actions.previousPage');
      previousButton.disabled = pagination.page <= 1;
      previousButton.addEventListener('click', () => onPageChange(pagination.page - 1));

      const nextButton = document.createElement('button');
      nextButton.textContent = t('actions.nextPage');
      nextButton.disabled = pagination.totalPages === 0 || pagination.page >= pagination.totalPages;
      nextButton.addEventListener('click', () => onPageChange(pagination.page + 1));

      const pageInput = document.createElement('input');
      pageInput.type = 'number';
      pageInput.min = '1';
      pageInput.placeholder = t('form.pagePlaceholder');
      pageInput.value = String(pagination.page);

      const jumpButton = document.createElement('button');
      jumpButton.textContent = t('actions.jumpPage');
      jumpButton.addEventListener('click', () => {
        const targetPage = readJumpPage(pageInput.value, pagination);

        if (targetPage !== null) {
          onPageChange(targetPage);
        }
      });

      pageInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') {
          return;
        }

        event.preventDefault();
        jumpButton.click();
      });

      container.replaceChildren(pageInfo, previousButton, nextButton, pageInput, jumpButton);
    }

    function renderAccounts(accounts) {
      renderTable(
        elements.accountsTable,
        [
          t('table.account'),
          t('table.status'),
          t('table.baselinePost'),
          t('table.latestPost'),
          t('table.lastPollStatus'),
          t('table.lastPolledAt'),
          t('table.actions'),
        ],
        accounts,
        (account) => {
          const row = document.createElement('tr');
          appendCell(row, '@' + account.xUsername);
          appendCell(
            row,
            account.enabled ? t('accounts.enabled') : t('accounts.disabled'),
            account.enabled ? 'status success' : 'muted',
          );
          appendCell(row, account.baselinePostId);
          appendCell(row, account.lastSeenPostId);
          appendCell(row, translateStatus(account.lastPollStatus), 'status ' + (account.lastPollStatus || ''));
          appendCell(row, formatDateTime(account.lastPolledAt));
          const actionCell = document.createElement('td');
          const button = document.createElement('button');
          button.textContent = t('actions.delete');
          button.addEventListener('click', () => deleteAccount(account));
          actionCell.appendChild(button);
          row.appendChild(actionCell);
          return row;
        },
      );
    }

    function renderPollRuns(pollRuns, pagination) {
      renderTable(
        elements.pollRunsTable,
        [
          t('table.startedAt'),
          t('table.finishedAt'),
          t('table.status'),
          t('table.pollProgress'),
          t('table.newPosts'),
          t('table.pendingEvents'),
          t('table.actions'),
        ],
        pollRuns,
        (run) => {
          const row = document.createElement('tr');
          appendCell(row, formatDateTime(run.startedAt));
          appendCell(row, formatDateTime(run.finishedAt));
          appendCell(row, translateStatus(run.status), 'status ' + run.status);
          appendCell(row, t('pollRuns.accountProgress', {
            failed: run.accountsFailed,
            succeeded: run.accountsSucceeded,
            total: run.accountsTotal,
          }));
          appendCell(row, run.newPostsDetected);
          appendCell(row, run.eventsCreated);
          const actionCell = document.createElement('td');
          const actions = document.createElement('div');
          actions.className = 'action-buttons';
          if (typeof run.errorSummary === 'string' && run.errorSummary.trim().length > 0) {
            const button = document.createElement('button');
            button.textContent = t('actions.viewError');
            button.addEventListener('click', () => openErrorModal(run.errorSummary));
            actions.appendChild(button);
          }
          const deleteButton = document.createElement('button');
          deleteButton.textContent = t('actions.delete');
          deleteButton.addEventListener('click', () => deletePollRun(run));
          actions.appendChild(deleteButton);
          actionCell.appendChild(actions);
          row.appendChild(actionCell);
          return row;
        },
      );
      renderPagination(elements.pollRunsPagination, pagination, loadPollRunsPage);
    }

    function renderDeliveryEvents(events, pagination) {
      renderTable(
        elements.deliveryEventsTable,
        [
          t('table.createdAt'),
          t('table.postId'),
          t('table.target'),
          t('table.status'),
          t('table.attemptCount'),
          t('table.nextRetryAt'),
          t('table.sentAt'),
          t('table.lastError'),
          t('table.actions'),
        ],
        events,
        (event) => {
          const row = document.createElement('tr');
          appendCell(row, formatDateTime(event.createdAt));
          appendCell(row, event.xPostId);
          appendCell(row, event.targetKey);
          appendCell(row, translateStatus(event.status), 'status ' + event.status);
          appendCell(row, event.attemptCount);
          appendCell(row, event.nextRetryAt);
          appendCell(row, formatDateTime(event.sentAt));
          appendCell(row, event.lastError);
          const actionCell = document.createElement('td');
          const button = document.createElement('button');
          button.textContent = t('actions.delete');
          button.addEventListener('click', () => deleteDeliveryEvent(event));
          actionCell.appendChild(button);
          row.appendChild(actionCell);
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
      state.errorSummary = errorSummary;
      renderErrorModalBody();
      elements.errorModalBackdrop.setAttribute('aria-hidden', 'false');
    }

    function renderErrorModalBody() {
      const parsedErrors = parseErrorSummary(state.errorSummary);

      if (parsedErrors.length === 0) {
        elements.errorModalBody.textContent = '-';
        return;
      }

      if (parsedErrors.length === 1 && parsedErrors[0].account === null) {
        const rawError = document.createElement('div');
        rawError.className = 'raw-error';
        rawError.textContent = parsedErrors[0].error;
        elements.errorModalBody.replaceChildren(rawError);
        return;
      }

      const table = document.createElement('table');
      const head = document.createElement('thead');
      const headRow = document.createElement('tr');

      for (const column of [t('modal.accountColumn'), t('modal.errorColumn')]) {
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
    }

    function closeErrorModal() {
      elements.errorModalBackdrop.setAttribute('aria-hidden', 'true');
      elements.errorModalBody.replaceChildren();
      state.errorSummary = null;
    }

    function toIsoDateTimeLocal(value) {
      if (typeof value !== 'string' || value.trim().length === 0) {
        return null;
      }

      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        return null;
      }

      return date.toISOString();
    }

    function readTimeFilters(fromInput, toInput) {
      const filters = {
        from: fromInput.value,
        to: toInput.value,
      };

      const fromTime = filters.from === '' ? null : new Date(filters.from).getTime();
      const toTime = filters.to === '' ? null : new Date(filters.to).getTime();

      if (
        (fromTime !== null && Number.isNaN(fromTime)) ||
        (toTime !== null && Number.isNaN(toTime))
      ) {
        setNoticeKey('notice.requestFailed', {}, true);
        return null;
      }

      if (fromTime !== null && toTime !== null && fromTime > toTime) {
        setNoticeKey('notice.invalidTimeRange', {}, true);
        return null;
      }

      return filters;
    }

    function toPageQuery(page, pageSize, filters = {}) {
      const query = new URLSearchParams();
      query.set('page', String(page));
      query.set('pageSize', String(pageSize));
      const from = toIsoDateTimeLocal(filters.from);
      const to = toIsoDateTimeLocal(filters.to);

      if (from !== null) {
        query.set('from', from);
      }

      if (to !== null) {
        query.set('to', to);
      }

      return query.toString();
    }

    function readJumpPage(value, pagination) {
      const trimmedValue = value.trim();

      if (!/^-?\\d+$/.test(trimmedValue)) {
        setNoticeKey('notice.invalidPage', {}, true);
        return null;
      }

      const parsedPage = Number(trimmedValue);

      if (!Number.isSafeInteger(parsedPage)) {
        setNoticeKey('notice.invalidPage', {}, true);
        return null;
      }

      if (parsedPage < 1) {
        return 1;
      }

      if (pagination.totalPages > 0 && parsedPage > pagination.totalPages) {
        return pagination.totalPages;
      }

      return parsedPage;
    }

    async function loadAll(options = {}) {
      setBusy(true);
      try {
        const [summary, accounts, pollRuns, deliveryEvents] = await Promise.all([
          requestJson('/admin/api/summary'),
          requestJson('/admin/api/watch-accounts'),
          requestJson(
            '/admin/api/poll-runs?' +
            toPageQuery(state.pollRunsPage, state.pollRunsPageSize, state.pollRunsFilters),
          ),
          requestJson(
            '/admin/api/delivery-events?' +
            toPageQuery(state.deliveryEventsPage, state.deliveryEventsPageSize, state.deliveryEventsFilters),
          ),
        ]);
        state.summary = summary;
        state.watchAccounts = accounts.watchAccounts;
        state.pollRuns = pollRuns.pollRuns;
        state.pollRunsPagination = pollRuns.pagination;
        state.pollRunsPage = pollRuns.pagination.page;
        state.deliveryEvents = deliveryEvents.deliveryEvents;
        state.deliveryEventsPagination = deliveryEvents.pagination;
        state.deliveryEventsPage = deliveryEvents.pagination.page;
        renderLoadedData();

        if (options.notice !== false) {
          setNoticeKey('notice.refreshed', { time: new Date().toLocaleString() });
        }
      } catch (error) {
        setRawNotice(error instanceof Error ? error.message : String(error), true);
      } finally {
        setBusy(false);
      }
    }

    async function loadPollRunsPage(page, options = {}) {
      if (state.busy && options.force !== true) {
        return;
      }

      const previousPage = state.pollRunsPage;
      state.pollRunsPage = page;
      setBusy(true);

      try {
        const pollRuns = await requestJson(
          '/admin/api/poll-runs?' +
          toPageQuery(state.pollRunsPage, state.pollRunsPageSize, state.pollRunsFilters),
        );
        state.pollRuns = pollRuns.pollRuns;
        state.pollRunsPagination = pollRuns.pagination;
        state.pollRunsPage = pollRuns.pagination.page;
        renderPollRuns(state.pollRuns, state.pollRunsPagination);
        if (options.notice !== false) {
          setNoticeKey('notice.pollRunsRefreshed', { time: new Date().toLocaleString() });
        }
      } catch (error) {
        state.pollRunsPage = previousPage;
        setRawNotice(error instanceof Error ? error.message : String(error), true);
      } finally {
        setBusy(false);
      }
    }

    async function loadDeliveryEventsPage(page, options = {}) {
      if (state.busy && options.force !== true) {
        return;
      }

      const previousPage = state.deliveryEventsPage;
      state.deliveryEventsPage = page;
      setBusy(true);

      try {
        const deliveryEvents = await requestJson(
          '/admin/api/delivery-events?' +
            toPageQuery(state.deliveryEventsPage, state.deliveryEventsPageSize, state.deliveryEventsFilters),
        );
        state.deliveryEvents = deliveryEvents.deliveryEvents;
        state.deliveryEventsPagination = deliveryEvents.pagination;
        state.deliveryEventsPage = deliveryEvents.pagination.page;
        renderDeliveryEvents(state.deliveryEvents, state.deliveryEventsPagination);
        if (options.notice !== false) {
          setNoticeKey('notice.deliveryEventsRefreshed', { time: new Date().toLocaleString() });
        }
      } catch (error) {
        state.deliveryEventsPage = previousPage;
        setRawNotice(error instanceof Error ? error.message : String(error), true);
      } finally {
        setBusy(false);
      }
    }

    async function deleteAccount(account) {
      if (!window.confirm(t('confirm.deleteAccount'))) {
        return;
      }

      setBusy(true);
      try {
        await requestJson('/admin/api/watch-accounts/' + encodeURIComponent(account.id), {
          method: 'DELETE',
        });
        await loadAll({ notice: false });
        setNoticeKey('notice.accountDeleted');
      } catch (error) {
        setRawNotice(error instanceof Error ? error.message : String(error), true);
      } finally {
        setBusy(false);
      }
    }

    async function deletePollRun(run) {
      if (!window.confirm(t('confirm.deletePollRun'))) {
        return;
      }

      setBusy(true);
      try {
        await requestJson('/admin/api/poll-runs/' + encodeURIComponent(run.id), {
          method: 'DELETE',
        });
        await loadAll({ notice: false });
        setNoticeKey('notice.pollRunDeleted');
      } catch (error) {
        setRawNotice(error instanceof Error ? error.message : String(error), true);
      } finally {
        setBusy(false);
      }
    }

    async function deleteDeliveryEvent(event) {
      const pendingStatuses = ['pending', 'retry_wait', 'sending'];
      const message = pendingStatuses.includes(event.status)
        ? t('confirm.deletePendingDeliveryEvent')
        : t('confirm.deleteDeliveryEvent');

      if (!window.confirm(message)) {
        return;
      }

      setBusy(true);
      try {
        await requestJson('/admin/api/delivery-events/' + encodeURIComponent(event.id), {
          method: 'DELETE',
        });
        await loadAll({ notice: false });
        setNoticeKey('notice.deliveryEventDeleted');
      } catch (error) {
        setRawNotice(error instanceof Error ? error.message : String(error), true);
      } finally {
        setBusy(false);
      }
    }

    async function runAction(path) {
      setBusy(true);
      try {
        const result = await requestJson(path, { method: 'POST' });
        await loadAll({ notice: false });
        setNoticeKey('notice.actionResult', {
          job: translateJob(result.job),
          status: translateStatus(result.status),
        });
      } catch (error) {
        setRawNotice(error instanceof Error ? error.message : String(error), true);
      } finally {
        setBusy(false);
      }
    }

    function translateJob(job) {
      const key = 'jobs.' + job;
      const translated = t(key);
      return translated === key ? t('jobs.background') : translated;
    }

    function translateStatus(status) {
      if (status == null || status === '') {
        return '-';
      }

      const translated = t('status.' + status);
      return translated === 'status.' + status ? String(status) : translated;
    }

    renderStaticLabels();
    elements.refreshButton.addEventListener('click', () => loadAll());
    elements.pollButton.addEventListener('click', () => runAction('/admin/api/actions/poll-now'));
    elements.deliveryButton.addEventListener('click', () => runAction('/admin/api/actions/delivery-now'));
    elements.languageButton.addEventListener('click', toggleLanguage);
    elements.pollRunsFilterForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const filters = readTimeFilters(elements.pollRunsFromInput, elements.pollRunsToInput);

      if (filters === null) {
        return;
      }

      state.pollRunsFilters = filters;
      await loadPollRunsPage(1);
    });
    elements.pollRunsClearButton.addEventListener('click', async () => {
      elements.pollRunsFromInput.value = '';
      elements.pollRunsToInput.value = '';
      state.pollRunsFilters = { from: '', to: '' };
      await loadPollRunsPage(1);
    });
    elements.deliveryEventsFilterForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const filters = readTimeFilters(elements.deliveryEventsFromInput, elements.deliveryEventsToInput);

      if (filters === null) {
        return;
      }

      state.deliveryEventsFilters = filters;
      await loadDeliveryEventsPage(1);
    });
    elements.deliveryEventsClearButton.addEventListener('click', async () => {
      elements.deliveryEventsFromInput.value = '';
      elements.deliveryEventsToInput.value = '';
      state.deliveryEventsFilters = { from: '', to: '' };
      await loadDeliveryEventsPage(1);
    });
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
        setRawNotice(error instanceof Error ? error.message : String(error), true);
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

  const from = readOptionalIsoQueryValue(query.from, 'from');
  const to = readOptionalIsoQueryValue(query.to, 'to');

  if (from !== undefined && to !== undefined && Date.parse(from) > Date.parse(to)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '开始时间不能晚于结束时间。');
  }

  return {
    ...(from === undefined ? {} : { from }),
    page: readPageQueryValue(query.page),
    pageSize: readPageSizeQueryValue(query.pageSize),
    ...(to === undefined ? {} : { to }),
  };
}

function readPageSizeQueryValue(value: unknown): number {
  const pageSize = readPositiveIntegerQueryValue(value, 'pageSize') ?? DEFAULT_ADMIN_PAGE_SIZE;

  if (pageSize > MAX_ADMIN_PAGE_SIZE) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'pageSize 必须在 1-100 之间。');
  }

  return pageSize;
}

function readPageQueryValue(value: unknown): number {
  const page = readIntegerQueryValue(value, 'page') ?? 1;
  return page < 1 ? 1 : page;
}

function readPositiveIntegerQueryValue(value: unknown, fieldName: string): number | undefined {
  const parsedValue = readIntegerQueryValue(value, fieldName);

  if (parsedValue === undefined) {
    return undefined;
  }

  if (parsedValue < 1) {
    throw new AdminApiError(400, 'INVALID_REQUEST', fieldName + ' 必须是正整数。');
  }

  return parsedValue;
}

function readIntegerQueryValue(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    if (value.length !== 1) {
      throw new AdminApiError(400, 'INVALID_REQUEST', fieldName + ' 必须是单个正整数。');
    }

    return readIntegerQueryValue(value[0], fieldName);
  }

  if (typeof value === 'number') {
    if (Number.isSafeInteger(value)) {
      return value;
    }

    throw new AdminApiError(400, 'INVALID_REQUEST', fieldName + ' 必须是整数。');
  }

  if (typeof value !== 'string') {
    throw new AdminApiError(400, 'INVALID_REQUEST', fieldName + ' 必须是整数。');
  }

  const trimmedValue = value.trim();

  if (!/^-?\d+$/.test(trimmedValue)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', fieldName + ' 必须是整数。');
  }

  const parsedValue = Number(trimmedValue);

  if (!Number.isSafeInteger(parsedValue)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', fieldName + ' 必须是整数。');
  }

  return parsedValue;
}

function readOptionalIsoQueryValue(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    if (value.length !== 1) {
      throw new AdminApiError(400, 'INVALID_REQUEST', fieldName + ' 必须是单个 ISO 时间字符串。');
    }

    return readOptionalIsoQueryValue(value[0], fieldName);
  }

  if (typeof value !== 'string') {
    throw new AdminApiError(400, 'INVALID_REQUEST', fieldName + ' 必须是 ISO 时间字符串。');
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return undefined;
  }

  if (!isIsoDateTimeString(trimmedValue) || Number.isNaN(Date.parse(trimmedValue))) {
    throw new AdminApiError(400, 'INVALID_REQUEST', fieldName + ' 必须是有效 ISO 时间字符串。');
  }

  return trimmedValue;
}

function isIsoDateTimeString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
}

function clampPaginationInput(input: AdminPaginationInput, total: number): AdminPaginationInput {
  const totalPages = total === 0 ? 0 : Math.ceil(total / input.pageSize);
  const page = totalPages === 0 ? 1 : Math.min(input.page, totalPages);

  return {
    ...input,
    page,
  };
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

function readIdParam(params: unknown): string {
  if (!isRecord(params) || typeof params.id !== 'string' || params.id.trim().length === 0) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '缺少账号 ID 路径参数。');
  }

  return params.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
