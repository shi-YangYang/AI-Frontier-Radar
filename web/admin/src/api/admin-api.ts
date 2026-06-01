export interface AdminResponse<T> {
  ok: true;
  data: T;
}

export interface AdminErrorResponse {
  ok: false;
  error: {
    code: string;
    details?: Record<string, unknown>;
    message: string;
  };
}

export type WatchAccountPollStatus = 'failed' | 'pending' | 'success';
export type PollRunStatus = 'failed' | 'partial_failed' | 'running' | 'success';
export type DeliveryEventStatus = 'dead' | 'failed' | 'pending' | 'retry_wait' | 'sending' | 'sent';
export type PostBooleanFilter = 'all' | 'false' | 'true';

export interface WatchAccount {
  id: string;
  xUsername: string;
  xUserId: string | null;
  displayName: string | null;
  enabled: boolean;
  baselinePostId: string | null;
  lastSeenPostId: string | null;
  lastPolledAt: string | null;
  lastPollStatus: WatchAccountPollStatus | null;
  lastPollError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PollRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: PollRunStatus;
  accountsTotal: number;
  accountsSucceeded: number;
  accountsFailed: number;
  newPostsDetected: number;
  eventsCreated: number;
  errorSummary: string | null;
  createdAt: string;
}

export interface DeliveryEvent {
  id: string;
  xPostId: string;
  targetKey: string;
  status: DeliveryEventStatus;
  attemptCount: number;
  nextRetryAt: string | null;
  lastError: string | null;
  lockedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostDeliveryEvent {
  id: string;
  targetKey: string;
  status: DeliveryEventStatus;
  attemptCount: number;
  nextRetryAt: string | null;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostDeliverySummary {
  total: number;
  sent: number;
  active: number;
  failed: number;
  dead: number;
}

export interface XPostContent {
  id: string;
  xPostId: string;
  authorUsername: string;
  authorUserId: string | null;
  authorDisplayName: string | null;
  postedAt: string;
  detectedAt: string;
  createdAt: string;
  textContent: string;
  permalinkUrl: string;
  isReply: boolean;
  isRepost: boolean;
  rawPayloadJson: string;
  deliverySummary: PostDeliverySummary;
  deliveryEvents: PostDeliveryEvent[];
}

export interface PostsSummary {
  totalPosts: number;
  todayPosts: number;
  latestDetectedAt: string | null;
}

export interface AdminPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminSummary {
  deliveryEventStatusCounts: Record<DeliveryEventStatus, number>;
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

export interface PageQuery {
  from: string;
  page: number;
  pageSize: number;
  to: string;
}

export interface PostPageQuery {
  authorUsername?: string;
  detectedFrom?: string;
  detectedTo?: string;
  isReply?: PostBooleanFilter;
  isRepost?: PostBooleanFilter;
  page: number;
  pageSize: number;
  postedFrom?: string;
  postedTo?: string;
  query?: string;
}

export interface WatchAccountPageQuery {
  page: number;
  pageSize: number;
  query?: string;
}

export interface DeliveryTargetPageQuery {
  page: number;
  pageSize: number;
}

export interface RunNowResult {
  job: string;
  status: string;
}

export type RuntimeSettingSource = 'database_override' | 'env_default';

export interface RuntimePollingSettings {
  excludeReplies: boolean;
  excludeReposts: boolean;
  fetchLimitPerAccount: number;
  intervalSeconds: number;
  sources: {
    excludeReplies: RuntimeSettingSource;
    excludeReposts: RuntimeSettingSource;
    fetchLimitPerAccount: RuntimeSettingSource;
    intervalSeconds: RuntimeSettingSource;
  };
}

export interface RuntimeFeishuSettings {
  configured: boolean;
  webhookPreview: string | null;
}

export interface RuntimeReadonlySettings {
  redisConfigured: boolean;
  redisUrlPreview: string | null;
  serviceEnv: string;
  serviceHost: string;
  servicePort: number;
  sourceMode: string;
  sqlitePath: string;
  xBrowserBaseUrl: string;
  xBrowserHeadless: boolean;
  xBrowserProxyConfigured: boolean;
  xBrowserProxyPreview: string | null;
  xBrowserProxySource: RuntimeSettingSource;
  xBrowserUserDataDir: string;
}

export interface RuntimeSettingsSummary {
  feishu: RuntimeFeishuSettings;
  polling: RuntimePollingSettings;
  readonly: RuntimeReadonlySettings;
}

export interface RuntimeXSourceSettings {
  browser: {
    baseUrl: string;
    headless: boolean;
    navigationTimeoutMs: number;
    postLoadTimeoutMs: number;
    proxyConfigured: boolean;
    proxyPreview: string | null;
    proxySource: RuntimeSettingSource;
    userDataDir: string;
  };
  mode: 'api' | 'browser';
}

export interface UpdatePollingSettingsInput {
  excludeReplies: boolean;
  excludeReposts: boolean;
  fetchLimitPerAccount: number;
  intervalSeconds: number;
}

export interface UpdateXBrowserSettingsInput {
  proxyUrl: string;
}

export type XSourceAnonymousCheckStatus =
  | 'available'
  | 'account_not_found'
  | 'login_required'
  | 'network_error'
  | 'page_unreadable'
  | 'rate_limited';

export type XSourceLoginCheckStatus =
  | 'logged_in_or_public_available'
  | 'login_required'
  | 'network_error'
  | 'page_unreadable'
  | 'rate_limited';

export interface XSourceAnonymousCheckResult {
  message: string;
  sourceCode?: string;
  status: XSourceAnonymousCheckStatus;
  xUsername: string;
}

export interface XSourceLoginCheckResult {
  message: string;
  sourceCode?: string;
  status: XSourceLoginCheckStatus;
  xUsername: string;
}

export interface XSourceOpenLoginResult {
  loginUrl: string;
  message: string;
  status: 'opened';
  userDataDir: string;
}

export class AdminApiRequestError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;
  public readonly statusCode: number;

  public constructor(input: {
    code: string;
    details?: Record<string, unknown>;
    message: string;
    statusCode: number;
  }) {
    super(input.message);
    this.name = 'AdminApiRequestError';
    this.code = input.code;
    this.details = input.details;
    this.statusCode = input.statusCode;
  }
}

export interface FeishuTestResult {
  ok: true;
  providerCode: number;
  providerMessage?: string;
  targetKey: string;
}

export interface DeliveryTarget {
  channelType: 'feishu_webhook';
  createdAt: string;
  displayName: string;
  enabled: boolean;
  id: string;
  targetKey: string;
  updatedAt: string;
  webhookPreview: string;
}

export interface DeliveryTargetSummary {
  enabled: number;
  total: number;
}

export interface CreateDeliveryTargetInput {
  displayName: string;
  enabled: boolean;
  webhookUrl: string;
}

export interface UpdateDeliveryTargetInput {
  displayName: string;
  webhookUrl?: string;
}

export interface DeliveryTargetTestResult {
  ok: true;
  providerCode: number;
  providerMessage?: string;
  targetKey: string;
  webhookPreview: string;
}

export interface DeleteDeliveryTargetResult {
  deadEventsCount: number;
  deleted: true;
}

export interface BatchDeleteResult {
  deletedCount: number;
}

export interface ClearPollRunsHistoryResult {
  deletedCount: number;
  retainedRunningCount: number;
}

export interface ClearDeliveryEventsHistoryResult {
  deletedCount: number;
  retainedActiveCount: number;
}

export async function getSummary(): Promise<AdminSummary> {
  return requestJson<AdminSummary>('/admin/api/summary');
}

export async function getSettings(): Promise<RuntimeSettingsSummary> {
  return requestJson<RuntimeSettingsSummary>('/admin/api/settings');
}

export async function updatePollingSettings(
  input: UpdatePollingSettingsInput,
): Promise<RuntimePollingSettings> {
  return requestJson<RuntimePollingSettings>('/admin/api/settings/polling', {
    body: JSON.stringify(input),
    method: 'PUT',
  });
}

export async function getXSourceSettings(): Promise<RuntimeXSourceSettings> {
  return requestJson<RuntimeXSourceSettings>('/admin/api/settings/x-source');
}

export async function updateXBrowserSettings(
  input: UpdateXBrowserSettingsInput,
): Promise<RuntimeXSourceSettings> {
  return requestJson<RuntimeXSourceSettings>('/admin/api/settings/x-source/browser', {
    body: JSON.stringify(input),
    method: 'PUT',
  });
}

export async function testXSourceAnonymous(
  xUsername: string,
): Promise<XSourceAnonymousCheckResult> {
  return requestJson<XSourceAnonymousCheckResult>(
    '/admin/api/settings/x-source/test-anonymous',
    {
      body: JSON.stringify({ xUsername }),
      method: 'POST',
    },
  );
}

export async function checkXSourceLogin(xUsername: string): Promise<XSourceLoginCheckResult> {
  return requestJson<XSourceLoginCheckResult>('/admin/api/settings/x-source/check-login', {
    body: JSON.stringify({ xUsername }),
    method: 'POST',
  });
}

export async function openXLoginWindow(): Promise<XSourceOpenLoginResult> {
  return requestJson<XSourceOpenLoginResult>('/admin/api/settings/x-source/open-login', {
    method: 'POST',
  });
}

export async function updateFeishuSettings(webhookUrl: string): Promise<RuntimeFeishuSettings> {
  return requestJson<RuntimeFeishuSettings>('/admin/api/settings/feishu', {
    body: JSON.stringify({ webhookUrl }),
    method: 'PUT',
  });
}

export async function testFeishuSettings(): Promise<FeishuTestResult> {
  return requestJson<FeishuTestResult>('/admin/api/settings/feishu/test', { method: 'POST' });
}

export async function listDeliveryTargets(query: DeliveryTargetPageQuery): Promise<{
  deliveryTargets: DeliveryTarget[];
  pagination: AdminPagination;
  summary: DeliveryTargetSummary;
}> {
  return requestJson<{
    deliveryTargets: DeliveryTarget[];
    pagination: AdminPagination;
    summary: DeliveryTargetSummary;
  }>(
    '/admin/api/settings/delivery-targets?' + toDeliveryTargetPageQuery(query),
  );
}

export async function createDeliveryTarget(
  input: CreateDeliveryTargetInput,
): Promise<{ deliveryTarget: DeliveryTarget }> {
  return requestJson<{ deliveryTarget: DeliveryTarget }>('/admin/api/settings/delivery-targets', {
    body: JSON.stringify(input),
    method: 'POST',
  });
}

export async function updateDeliveryTarget(
  id: string,
  input: UpdateDeliveryTargetInput,
): Promise<{ deliveryTarget: DeliveryTarget }> {
  return requestJson<{ deliveryTarget: DeliveryTarget }>(
    '/admin/api/settings/delivery-targets/' + encodeURIComponent(id),
    {
      body: JSON.stringify(input),
      method: 'PUT',
    },
  );
}

export async function updateDeliveryTargetEnabled(
  id: string,
  enabled: boolean,
): Promise<{ deliveryTarget: DeliveryTarget }> {
  return requestJson<{ deliveryTarget: DeliveryTarget }>(
    '/admin/api/settings/delivery-targets/' + encodeURIComponent(id) + '/enabled',
    {
      body: JSON.stringify({ enabled }),
      method: 'PATCH',
    },
  );
}

export async function deleteDeliveryTarget(id: string): Promise<DeleteDeliveryTargetResult> {
  return requestJson<DeleteDeliveryTargetResult>(
    '/admin/api/settings/delivery-targets/' + encodeURIComponent(id),
    { method: 'DELETE' },
  );
}

export async function testDeliveryTarget(id: string): Promise<DeliveryTargetTestResult> {
  return requestJson<DeliveryTargetTestResult>(
    '/admin/api/settings/delivery-targets/' + encodeURIComponent(id) + '/test',
    { method: 'POST' },
  );
}

export async function listWatchAccounts(query?: WatchAccountPageQuery): Promise<{
  pagination: AdminPagination;
  watchAccounts: WatchAccount[];
}> {
  const queryString = query === undefined ? '' : '?' + toWatchAccountPageQuery(query);
  return requestJson<{ pagination: AdminPagination; watchAccounts: WatchAccount[] }>(
    '/admin/api/watch-accounts' + queryString,
  );
}

export async function createWatchAccount(username: string): Promise<{ created: boolean; watchAccount: WatchAccount }> {
  return requestJson<{ created: boolean; watchAccount: WatchAccount }>('/admin/api/watch-accounts', {
    body: JSON.stringify({ username }),
    method: 'POST',
  });
}

export async function deleteWatchAccount(id: string): Promise<{ deleted: true }> {
  return requestJson<{ deleted: true }>('/admin/api/watch-accounts/' + encodeURIComponent(id), {
    method: 'DELETE',
  });
}

export async function listPollRuns(query: PageQuery): Promise<{
  pagination: AdminPagination;
  pollRuns: PollRun[];
}> {
  return requestJson<{ pagination: AdminPagination; pollRuns: PollRun[] }>(
    '/admin/api/poll-runs?' + toPageQuery(query),
  );
}

export async function deletePollRun(id: string): Promise<{ deleted: true }> {
  return requestJson<{ deleted: true }>('/admin/api/poll-runs/' + encodeURIComponent(id), {
    method: 'DELETE',
  });
}

export async function batchDeletePollRuns(ids: string[]): Promise<BatchDeleteResult> {
  return requestJson<BatchDeleteResult>('/admin/api/poll-runs/batch-delete', {
    body: JSON.stringify({ ids }),
    method: 'POST',
  });
}

export async function clearPollRunsHistory(): Promise<ClearPollRunsHistoryResult> {
  return requestJson<ClearPollRunsHistoryResult>('/admin/api/poll-runs/clear-history', {
    method: 'POST',
  });
}

export async function listDeliveryEvents(query: PageQuery): Promise<{
  deliveryEvents: DeliveryEvent[];
  pagination: AdminPagination;
}> {
  return requestJson<{ deliveryEvents: DeliveryEvent[]; pagination: AdminPagination }>(
    '/admin/api/delivery-events?' + toPageQuery(query),
  );
}

export async function listPosts(query: PostPageQuery): Promise<{
  pagination: AdminPagination;
  posts: XPostContent[];
  summary: PostsSummary;
}> {
  return requestJson<{
    pagination: AdminPagination;
    posts: XPostContent[];
    summary: PostsSummary;
  }>(
    '/admin/api/posts?' + toPostPageQuery(query),
  );
}

export async function deleteDeliveryEvent(id: string): Promise<{ deleted: true }> {
  return requestJson<{ deleted: true }>('/admin/api/delivery-events/' + encodeURIComponent(id), {
    method: 'DELETE',
  });
}

export async function batchDeleteDeliveryEvents(ids: string[]): Promise<BatchDeleteResult> {
  return requestJson<BatchDeleteResult>('/admin/api/delivery-events/batch-delete', {
    body: JSON.stringify({ ids }),
    method: 'POST',
  });
}

export async function clearDeliveryEventsHistory(): Promise<ClearDeliveryEventsHistoryResult> {
  return requestJson<ClearDeliveryEventsHistoryResult>(
    '/admin/api/delivery-events/clear-history',
    { method: 'POST' },
  );
}

export async function runPollingNow(): Promise<RunNowResult> {
  return requestJson<RunNowResult>('/admin/api/actions/poll-now', { method: 'POST' });
}

export async function runDeliveryNow(): Promise<RunNowResult> {
  return requestJson<RunNowResult>('/admin/api/actions/delivery-now', { method: 'POST' });
}

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
    ...options,
  });

  const payload = (await response.json()) as AdminResponse<T> | AdminErrorResponse;

  if (!response.ok || payload.ok === false) {
    if (payload.ok === false) {
      throw new AdminApiRequestError({
        code: payload.error.code,
        details: payload.error.details,
        message: payload.error.message,
        statusCode: response.status,
      });
    }

    throw new AdminApiRequestError({
      code: 'REQUEST_FAILED',
      message: '请求失败',
      statusCode: response.status,
    });
  }

  return payload.data;
}

function toPageQuery(query: PageQuery): string {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));

  const from = toIsoDateTime(query.from);
  const to = toIsoDateTime(query.to);

  if (from !== null) {
    params.set('from', from);
  }

  if (to !== null) {
    params.set('to', to);
  }

  return params.toString();
}

function toDeliveryTargetPageQuery(query: DeliveryTargetPageQuery): string {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  return params.toString();
}

function toWatchAccountPageQuery(query: WatchAccountPageQuery): string {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));

  if (query.query !== undefined && query.query.trim().length > 0) {
    params.set('query', query.query.trim());
  }

  return params.toString();
}

function toPostPageQuery(query: PostPageQuery): string {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));

  setOptionalStringQuery(params, 'authorUsername', query.authorUsername);
  setOptionalStringQuery(params, 'query', query.query);
  setOptionalDateTimeQuery(params, 'postedFrom', query.postedFrom);
  setOptionalDateTimeQuery(params, 'postedTo', query.postedTo);
  setOptionalDateTimeQuery(params, 'detectedFrom', query.detectedFrom);
  setOptionalDateTimeQuery(params, 'detectedTo', query.detectedTo);

  if (query.isReply !== undefined) {
    params.set('isReply', query.isReply);
  }

  if (query.isRepost !== undefined) {
    params.set('isRepost', query.isRepost);
  }

  return params.toString();
}

function setOptionalStringQuery(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value !== undefined && value.trim().length > 0) {
    params.set(key, value.trim());
  }
}

function setOptionalDateTimeQuery(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value === undefined) {
    return;
  }

  const isoValue = toIsoDateTime(value);

  if (isoValue !== null) {
    params.set(key, isoValue);
  }
}

function toIsoDateTime(value: string): string | null {
  if (value.trim().length === 0) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}
