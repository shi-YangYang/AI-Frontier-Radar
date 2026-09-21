import { tBackend } from '../i18n';

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
export type WatchAccountSourceType =
  | 'ai2_blog'
  | 'anthropic_news'
  | 'github'
  | 'hf_papers'
  | 'meta_ai_blog'
  | 'moonshot_blog'
  | 'rss'
  | 'x'
  | 'xai_news';
export type PollRunStatus = 'failed' | 'partial_failed' | 'running' | 'success';
export type DeliveryEventStatus = 'dead' | 'failed' | 'pending' | 'retry_wait' | 'sending' | 'sent';
export type PostBooleanFilter = 'all' | 'false' | 'true';

export interface RetentionSettings {
  expiredEvents: number;
  expiredPosts: number;
  lastCleanupAt: string | null;
  retentionDays: number;
}

export interface BackupEntry {
  createdAt: string;
  name: string;
  sizeBytes: number;
}

export interface LogBufferEntry {
  [key: string]: unknown;
  level: string;
  time: string;
}

export interface WatchAccount {
  id: string;
  sourceType: WatchAccountSourceType;
  sourceUrl: string | null;
  xUsername: string | null;
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
  repeatCount: number;
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
  proxyUrl?: string;
}

export type XSourceAnonymousCheckStatus =
  | 'available'
  | 'account_not_found'
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

export type DeliveryChannelType =
  | 'bark'
  | 'dingtalk_webhook'
  | 'feishu_webhook'
  | 'generic_webhook'
  | 'wechat_clawbot'
  | 'wecom_webhook';

export interface DeliveryTarget {
  accountId: string | null;
  channelType: DeliveryChannelType;
  createdAt: string;
  displayName: string;
  enabled: boolean;
  id: string;
  secretConfigured: boolean;
  target: string | null;
  targetKey: string;
  updatedAt: string;
  webhookPreview: string;
}

export interface DeliveryTargetSummary {
  enabled: number;
  total: number;
}

export interface CreateDeliveryTargetInput {
  accountId?: string;
  channelType: DeliveryChannelType;
  displayName: string;
  enabled: boolean;
  secret?: string;
  target?: string;
  webhookUrl: string;
}

export interface UpdateDeliveryTargetInput {
  accountId?: string;
  displayName: string;
  secret?: string;
  target?: string;
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

export interface RuntimeRssSettings {
  proxyConfigured: boolean;
  proxyPreview: string | null;
  proxySource: RuntimeSettingSource;
}

export async function getRssSettings(): Promise<RuntimeRssSettings> {
  return requestJson<RuntimeRssSettings>('/admin/api/settings/rss');
}

export async function updateRssSettings(input: {
  proxyUrl: string;
}): Promise<RuntimeRssSettings> {
  return requestJson<RuntimeRssSettings>('/admin/api/settings/rss', {
    body: JSON.stringify(input),
    method: 'PUT',
  });
}

export interface DingtalkAdminSettings {
  appKey: string;
  appSecretConfigured: boolean;
  appSecretPreview: string | null;
  corpId: string;
  callbackPath: string;
  enabled: boolean;
}

export async function getDingtalkSettings(): Promise<DingtalkAdminSettings> {
  return requestJson<DingtalkAdminSettings>('/admin/api/settings/dingtalk');
}

export async function updateDingtalkSettings(input: {
  appKey: string;
  /** 空字符串 = 保持不变 */
  appSecret?: string;
  corpId?: string;
  enabled: boolean;
}): Promise<DingtalkAdminSettings> {
  return requestJson<DingtalkAdminSettings>('/admin/api/settings/dingtalk', {
    body: JSON.stringify(input),
    method: 'PUT',
  });
}

export interface ResolvedYoutubeChannel {
  feedUrl: string;
  label?: string;
}

export async function clearPostsHistory(): Promise<{
  deletedEvents: number;
  deletedPosts: number;
  resetBoardSources: number;
}> {
  return requestJson<{ deletedEvents: number; deletedPosts: number; resetBoardSources: number }>(
    '/admin/api/posts/clear-all',
    { method: 'POST' },
  );
}

export interface SourceGroupStatus {
  description: string;
  details?: string;
  id: string;
  installedCount: number;
  name: string;
  sourceCount: number;
}

export async function getDataSettings(): Promise<RetentionSettings> {
  return requestJson<RetentionSettings>('/admin/api/settings/data');
}

export async function updateDataSettings(retentionDays: number): Promise<RetentionSettings> {
  return requestJson<RetentionSettings>('/admin/api/settings/data', {
    body: JSON.stringify({ retentionDays }),
    method: 'PUT',
  });
}

export async function runRetentionCleanup(): Promise<{
  deletedEvents: number;
  deletedPosts: number;
  settings: RetentionSettings;
}> {
  return requestJson<{
    deletedEvents: number;
    deletedPosts: number;
    settings: RetentionSettings;
  }>('/admin/api/actions/cleanup-now', { method: 'POST' });
}

export interface WechatAccount {
  accountId: string;
  baseUrl: string;
  ownerUserId: string | null;
  pushEnabled: boolean;
  tokenMasked: string;
  userId: string | null;
}

export interface WechatStatus {
  accountId?: string;
  accounts: WechatAccount[];
  installed: boolean;
  loggedIn: boolean;
  loginStatus: string;
  message?: string;
  port: number;
  qrcodeDataUrl?: string;
  qrcodeUrl?: string;
  running: boolean;
  targets: Array<{ accountId?: string; id: string; lastSeenAt?: string; preview?: string }>;
}

export async function getWechatStatus(): Promise<WechatStatus> {
  return requestJson<WechatStatus>('/admin/api/wechat/status');
}

export async function startWechatLogin(force = false): Promise<{
  qrcodeDataUrl?: string;
  qrcodeUrl?: string;
  status: string;
}> {
  return requestJson<{ qrcodeDataUrl?: string; qrcodeUrl?: string; status: string }>(
    '/admin/api/wechat/login',
    { body: JSON.stringify({ force }), method: 'POST' },
  );
}

export async function submitWechatLoginCode(code: string): Promise<void> {
  await requestJson<{ submitted: boolean }>('/admin/api/wechat/login/code', {
    body: JSON.stringify({ code }),
    method: 'POST',
  });
}

export async function testWechatBridge(): Promise<{
  failed: Array<{ accountId: string; error: string }>;
  sent: number;
}> {
  return requestJson<{ failed: Array<{ accountId: string; error: string }>; sent: number }>(
    '/admin/api/wechat/test',
    { method: 'POST' },
  );
}

export async function updateWechatAccountPush(
  accountId: string,
  enabled: boolean,
): Promise<{ enabled: boolean }> {
  return requestJson<{ enabled: boolean }>(
    `/admin/api/wechat/accounts/${encodeURIComponent(accountId)}/push`,
    { body: JSON.stringify({ enabled }), method: 'PATCH' },
  );
}

export async function deleteWechatAccount(accountId: string): Promise<boolean> {
  const data = await requestJson<{ deleted: boolean }>(
    '/admin/api/wechat/accounts/' + encodeURIComponent(accountId),
    { method: 'DELETE' },
  );

  return data.deleted;
}

export async function listBackups(): Promise<BackupEntry[]> {
  const data = await requestJson<{ backups: BackupEntry[] }>('/admin/api/backups');

  return data.backups;
}

export async function createBackup(): Promise<{
  backup: BackupEntry;
  backups: BackupEntry[];
}> {
  return requestJson<{ backup: BackupEntry; backups: BackupEntry[] }>(
    '/admin/api/actions/backup',
    { method: 'POST' },
  );
}

export async function deleteBackup(name: string): Promise<boolean> {
  const data = await requestJson<{ deleted: boolean }>(
    `/admin/api/backups/${encodeURIComponent(name)}`,
    { method: 'DELETE' },
  );

  return data.deleted;
}

export function backupDownloadUrl(name: string): string {
  return `/admin/api/backups/${encodeURIComponent(name)}/download`;
}

export function postsExportUrl(
  query: Omit<PostPageQuery, 'page' | 'pageSize'>,
  format: 'csv' | 'json',
): string {
  const params = new URLSearchParams();
  params.set('format', format);
  setOptionalStringQuery(params, 'authorUsername', query.authorUsername);
  setOptionalStringQuery(params, 'query', query.query);
  setOptionalDateTimeQuery(params, 'postedFrom', query.postedFrom);
  setOptionalDateTimeQuery(params, 'postedTo', query.postedTo);

  if (query.isReply !== undefined) {
    params.set('isReply', query.isReply);
  }

  if (query.isRepost !== undefined) {
    params.set('isRepost', query.isRepost);
  }

  return `/admin/api/posts/export?${params.toString()}`;
}

export async function listLogs(
  query: { level?: string; limit?: number } = {},
): Promise<{ capacity: number; entries: LogBufferEntry[]; size: number }> {
  const params = new URLSearchParams();

  if (query.level !== undefined && query.level.length > 0) {
    params.set('level', query.level);
  }

  if (query.limit !== undefined) {
    params.set('limit', String(query.limit));
  }

  const suffix = params.toString();

  return requestJson<{ capacity: number; entries: LogBufferEntry[]; size: number }>(
    `/admin/api/logs${suffix.length === 0 ? '' : `?${suffix}`}`,
  );
}

export async function getSourceGroups(): Promise<SourceGroupStatus[]> {
  const data = await requestJson<{ groups: SourceGroupStatus[] }>('/admin/api/source-groups');

  return data.groups;
}

export async function applySourceGroup(
  id: string,
): Promise<{ created: number; existing: number; group: string }> {
  return requestJson<{ created: number; existing: number; group: string }>(
    `/admin/api/source-groups/${encodeURIComponent(id)}/apply`,
    { method: 'POST' },
  );
}

export type SubscriptionRuleMode = 'all' | 'any';

export interface SubscriptionRule {
  enabled: boolean;
  exclude: string[];
  id: string;
  include: string[];
  mode: SubscriptionRuleMode;
  name: string;
  targetKeys: string[];
}

export async function getSubscriptionRules(): Promise<SubscriptionRule[]> {
  const data = await requestJson<{ rules: SubscriptionRule[] }>('/admin/api/subscription-rules');

  return data.rules;
}

export async function updateSubscriptionRules(
  rules: SubscriptionRule[],
): Promise<SubscriptionRule[]> {
  const data = await requestJson<{ rules: SubscriptionRule[] }>('/admin/api/subscription-rules', {
    body: JSON.stringify({ rules }),
    method: 'PUT',
  });

  return data.rules;
}

export async function resolveYoutubeChannel(input: string): Promise<ResolvedYoutubeChannel> {
  return requestJson<ResolvedYoutubeChannel>('/admin/api/source-presets/youtube/resolve', {
    body: JSON.stringify({ input }),
    method: 'POST',
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

export async function updateFeishuSettings(webhookUrl: string): Promise<RuntimeFeishuSettings> {
  return requestJson<RuntimeFeishuSettings>('/admin/api/settings/feishu', {
    body: JSON.stringify({ webhookUrl }),
    method: 'PUT',
  });
}

export async function testFeishuSettings(): Promise<FeishuTestResult> {
  return requestJson<FeishuTestResult>('/admin/api/settings/feishu/test', { method: 'POST' });
}

export async function listDeliveryTargets(
  query: DeliveryTargetPageQuery & { excludeChannelType?: string },
): Promise<{
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

export type CreateWatchAccountInput =
  | { sourceType: 'ai2_blog'; sourceUrl: string }
  | { sourceType: 'anthropic_news'; sourceUrl: string }
  | { sourceType: 'github'; sourceUrl: string }
  | { sourceType: 'meta_ai_blog'; sourceUrl: string }
  | { sourceType: 'moonshot_blog'; sourceUrl: string }
  | { sourceType: 'hf_papers'; sourceUrl: string }
  | { sourceType: 'rss'; sourceUrl: string }
  | { sourceType: 'x'; xUsername: string }
  | { sourceType: 'xai_news'; sourceUrl: string };

export async function createWatchAccount(
  input: CreateWatchAccountInput,
): Promise<{ created: boolean; watchAccount: WatchAccount }> {
  return requestJson<{ created: boolean; watchAccount: WatchAccount }>('/admin/api/watch-accounts', {
    body: JSON.stringify(input),
    method: 'POST',
  });
}

export async function deleteAllWatchAccounts(): Promise<{
  deletedAccounts: number;
  deletedEvents: number;
  deletedPosts: number;
}> {
  return requestJson<{ deletedAccounts: number; deletedEvents: number; deletedPosts: number }>(
    '/admin/api/watch-accounts/delete-all',
    { method: 'POST' },
  );
}

export async function deleteWatchAccount(
  id: string,
): Promise<{ deleted: true; deletedEvents: number; deletedPosts: number }> {
  return requestJson<{ deleted: true; deletedEvents: number; deletedPosts: number }>(
    '/admin/api/watch-accounts/' + encodeURIComponent(id),
    {
      method: 'DELETE',
    },
  );
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

function localizeErrorMessage(message: string): string {
  return tBackend(message);
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

  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:expired'));
  }

  if (!response.ok || payload.ok === false) {
    if (payload.ok === false) {
      throw new AdminApiRequestError({
        code: payload.error.code,
        details: payload.error.details,
        message: localizeErrorMessage(payload.error.message),
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

function toDeliveryTargetPageQuery(
  query: DeliveryTargetPageQuery & { excludeChannelType?: string },
): string {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));

  if (query.excludeChannelType !== undefined && query.excludeChannelType.length > 0) {
    params.set('excludeChannelType', query.excludeChannelType);
  }
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


export interface AuthUser {
  createdAt: string;
  id: string;
  nickname: string | null;
  role: 'admin' | 'user';
  updatedAt: string;
  username: string;
}

export interface AuthProviders {
  dingtalk: {
    enabled: boolean;
  };
}

export async function fetchAuthProviders(): Promise<AuthProviders> {
  const response = await fetch('/auth/providers', { headers: { Accept: 'application/json' } });

  if (!response.ok) {
    throw new Error('providers request failed');
  }

  return ((await response.json()) as { data: AuthProviders }).data;
}

export interface UserRecord {
  createdAt: string;
  id: string;
  nickname: string | null;
  role: 'admin' | 'user';
  updatedAt: string;
  username: string;
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const response = await fetch('/auth/me', {
    headers: { Accept: 'application/json' },
  });

  if (response.status === 401) {
    return null;
  }

  const payload = (await response.json()) as AdminResponse<{ user: AuthUser }> | AdminErrorResponse;

  if (!response.ok || payload.ok === false) {
    throw new AdminApiRequestError({
      code: payload.ok === false ? payload.error.code : 'REQUEST_FAILED',
      message: payload.ok === false ? localizeErrorMessage(payload.error.message) : '请求失败',
      statusCode: response.status,
    });
  }

  return payload.data.user;
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const data = await requestJson<{ user: AuthUser }>('/auth/login', {
    body: JSON.stringify({ password, username }),
    method: 'POST',
  });

  return data.user;
}

export async function logout(): Promise<void> {
  await requestJson<{ loggedOut: boolean }>('/auth/logout', { method: 'POST' });
}

export async function listUsers(): Promise<UserRecord[]> {
  const data = await requestJson<{ users: UserRecord[] }>('/admin/api/users');

  return data.users;
}

export async function createUser(input: {
  password: string;
  role: 'admin' | 'user';
  username: string;
}): Promise<UserRecord> {
  const data = await requestJson<{ user: UserRecord }>('/admin/api/users', {
    body: JSON.stringify(input),
    method: 'POST',
  });

  return data.user;
}

export async function deleteUser(id: string): Promise<boolean> {
  const data = await requestJson<{ deleted: boolean }>(`/admin/api/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

  return data.deleted;
}

export async function resetUserPassword(id: string, password: string): Promise<boolean> {
  const data = await requestJson<{ updated: boolean }>(
    `/admin/api/users/${encodeURIComponent(id)}/password`,
    {
      body: JSON.stringify({ password }),
      method: 'PUT',
    },
  );

  return data.updated;
}

export interface UserPostItem {
  authorDisplayName: string | null;
  authorUsername: string;
  detectedAt: string;
  id: string;
  isReply: boolean;
  isRepost: boolean;
  permalinkUrl: string;
  postedAt: string;
  sourceDisplayName: string | null;
  sourceType: string;
  textContent: string;
  title: string | null;
}

export interface UserPostsPage {
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  posts: UserPostItem[];
}

export async function listMyPosts(
  page = 1,
  pageSize = 20,
  query = '',
): Promise<UserPostsPage> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  if (query.trim().length > 0) {
    params.set('query', query.trim());
  }

  return requestJson<UserPostsPage>(`/user/api/posts?${params.toString()}`);
}

export interface MyWechatQuietHours {
  enabled: boolean;
  endHour: number;
  startHour: number;
}

export interface MyWechatAccount {
  accountId: string;
  displayName: string;
  enabled: boolean;
  quietHours: MyWechatQuietHours | null;
  sendCount: number;
  sendLimit: number;
  sessionActive: boolean;
  sourceIds: string[];
  userId?: string;
}

export interface MyWechatSource {
  displayName: string;
  id: string;
  sourceType: string;
}

export interface MyWechatBinding {
  accounts: MyWechatAccount[];
  login: {
    loggedIn: boolean;
    message?: string;
    qrcodeDataUrl?: string;
    qrcodeUrl?: string;
    status: string;
  };
  sources: MyWechatSource[];
}

export async function getMyWechatBinding(): Promise<MyWechatBinding> {
  return requestJson<MyWechatBinding>('/user/api/wechat');
}

export async function startMyWechatBind(): Promise<{
  qrcodeDataUrl?: string;
  qrcodeUrl?: string;
  status: string;
}> {
  return requestJson<{ qrcodeDataUrl?: string; qrcodeUrl?: string; status: string }>(
    '/user/api/wechat/bind',
    { method: 'POST' },
  );
}

export async function submitMyWechatLoginCode(code: string): Promise<void> {
  await requestJson<{ submitted: boolean }>('/user/api/wechat/bind/code', {
    body: JSON.stringify({ code }),
    method: 'POST',
  });
}

export async function updateMyWechatQuietHours(
  accountId: string,
  input: { enabled: boolean; endHour: number; startHour: number },
): Promise<MyWechatQuietHours | null> {
  const data = await requestJson<{ quietHours: MyWechatQuietHours | null }>(
    `/user/api/wechat/accounts/${encodeURIComponent(accountId)}/quiet-hours`,
    {
      body: JSON.stringify(input),
      method: 'PUT',
    },
  );

  return data.quietHours;
}

export async function updateMyWechatSources(
  accountId: string,
  sourceIds: string[],
): Promise<string[]> {
  const data = await requestJson<{ sourceIds: string[] }>(
    `/user/api/wechat/accounts/${encodeURIComponent(accountId)}/sources`,
    {
      body: JSON.stringify({ sourceIds }),
      method: 'PUT',
    },
  );

  return data.sourceIds;
}

export async function cancelMyWechatBind(): Promise<void> {
  await requestJson<{ cancelled: boolean }>('/user/api/wechat/bind/cancel', { method: 'POST' });
}

export async function unbindMyWechatAccount(accountId: string): Promise<boolean> {
  const data = await requestJson<{ deleted: boolean }>(
    `/user/api/wechat/accounts/${encodeURIComponent(accountId)}`,
    { method: 'DELETE' },
  );

  return data.deleted;
}
