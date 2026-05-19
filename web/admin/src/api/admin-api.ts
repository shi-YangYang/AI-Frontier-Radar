export interface AdminResponse<T> {
  ok: true;
  data: T;
}

export interface AdminErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type WatchAccountPollStatus = 'failed' | 'pending' | 'success';
export type PollRunStatus = 'failed' | 'partial_failed' | 'running' | 'success';
export type DeliveryEventStatus = 'dead' | 'failed' | 'pending' | 'retry_wait' | 'sending' | 'sent';

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

export interface RunNowResult {
  job: string;
  status: string;
}

export async function getSummary(): Promise<AdminSummary> {
  return requestJson<AdminSummary>('/admin/api/summary');
}

export async function listWatchAccounts(): Promise<{ watchAccounts: WatchAccount[] }> {
  return requestJson<{ watchAccounts: WatchAccount[] }>('/admin/api/watch-accounts');
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

export async function listDeliveryEvents(query: PageQuery): Promise<{
  deliveryEvents: DeliveryEvent[];
  pagination: AdminPagination;
}> {
  return requestJson<{ deliveryEvents: DeliveryEvent[]; pagination: AdminPagination }>(
    '/admin/api/delivery-events?' + toPageQuery(query),
  );
}

export async function deleteDeliveryEvent(id: string): Promise<{ deleted: true }> {
  return requestJson<{ deleted: true }>('/admin/api/delivery-events/' + encodeURIComponent(id), {
    method: 'DELETE',
  });
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
    const message = payload.ok === false ? payload.error.message : '请求失败';
    throw new Error(message);
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
