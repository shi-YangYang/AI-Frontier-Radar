import type { AppConfig } from '../../../shared/config/types';
import { createFeishuWebhookClient, type FeishuWebhookFailureResult } from '../../delivery';
import type { RuntimeSchedulerRunNowResult } from '../../scheduler';
import {
  createRuntimeSettingsService,
  previewSecretUrl,
  type DeliveryEvent,
  type PollRun,
  type RuntimeFeishuSettings,
  type RuntimePollingSettings,
  type RuntimeSettingsService,
  type RuntimeSettingsSummary,
  type SavePollingSettingsInput,
  type StorageContext,
  type WatchAccount,
} from '../../storage';
import { normalizeXUsername } from '../../storage/watch-account-repository';

export interface AdminActions {
  runDeliveryWorkerNow?(options?: { recoverStartupState?: boolean; trigger?: string }): Promise<RuntimeSchedulerRunNowResult>;
  runPollingNow?(options?: { trigger?: string }): Promise<RuntimeSchedulerRunNowResult>;
  updatePollingSchedule?(intervalSeconds: number): void | Promise<void>;
}

export interface AdminControllerOptions {
  actions?: AdminActions;
  config: AppConfig;
  runtimeSettings?: RuntimeSettingsService;
  storage: StorageContext;
}

export interface AdminApiErrorPayload {
  code: string;
  details?: Record<string, unknown>;
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
  public readonly details?: Record<string, unknown>;
  public readonly statusCode: number;

  public constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.code = code;
    this.details = details;
    this.statusCode = statusCode;
  }
}

export async function getAdminSummary(
  options: AdminControllerOptions,
): Promise<{ ok: true; data: AdminSummary }> {
  const [watchAccounts, recentPollRuns, deliveryEventStatusCounts, feishuSettings] = await Promise.all([
    options.storage.watchAccounts.listAll(),
    options.storage.pollRuns.listRecent(1),
    options.storage.deliveryEvents.countByStatus(),
    resolveRuntimeSettings(options).getFeishuSettings(),
  ]);

  return {
    ok: true,
    data: {
      deliveryEventStatusCounts,
      enabledWatchAccountsCount: watchAccounts.filter((account) => account.enabled).length,
      feishuWebhookConfigured: feishuSettings.configured,
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

export async function getAdminSettings(
  options: AdminControllerOptions,
): Promise<{ ok: true; data: RuntimeSettingsSummary }> {
  const runtimeSettings = resolveRuntimeSettings(options);
  const settings = await runtimeSettings.getSettingsSummary();

  return {
    ok: true,
    data: settings,
  };
}

export async function updateAdminPollingSettings(
  body: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: RuntimePollingSettings }> {
  const input = readPollingSettingsBody(body);
  const runtimeSettings = resolveRuntimeSettings(options);
  const polling = await runtimeSettings.savePollingSettings(input);

  if (options.actions?.updatePollingSchedule !== undefined) {
    await options.actions.updatePollingSchedule(polling.intervalSeconds);
  }

  return {
    ok: true,
    data: polling,
  };
}

export async function updateAdminFeishuSettings(
  body: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: RuntimeFeishuSettings }> {
  const webhookUrl = readFeishuWebhookUrl(body);
  const runtimeSettings = resolveRuntimeSettings(options);
  const feishu = await runtimeSettings.saveFeishuWebhook(webhookUrl);

  return {
    ok: true,
    data: feishu,
  };
}

export async function testAdminFeishuSettings(
  options: AdminControllerOptions,
): Promise<{
  ok: true;
  data: {
    ok: true;
    providerCode: number;
    providerMessage?: string;
    targetKey: string;
  };
}> {
  const runtimeSettings = resolveRuntimeSettings(options);
  const target = await options.storage.deliveryTargets.findByTargetKey(
    runtimeSettings.getDefaultTargetKey(),
  );
  const webhookUrl = target?.webhookUrl.trim() ?? '';

  if (target === null || webhookUrl.length === 0) {
    throw new AdminApiError(409, 'FEISHU_WEBHOOK_NOT_CONFIGURED', '飞书 webhook 尚未配置。');
  }

  const result = await createFeishuWebhookClient().sendTextMessage({
    targetKey: target.targetKey,
    text: 'AI 前沿消息本地配置测试：如果你看到这条消息，说明飞书机器人 webhook 可用。',
    webhookUrl,
  });

  if (!result.ok) {
    throw toFeishuTestSendError(result, webhookUrl);
  }

  return {
    ok: true,
    data: {
      ok: true,
      providerCode: result.providerCode,
      ...(result.providerMessage === undefined ? {} : { providerMessage: result.providerMessage }),
      targetKey: result.targetKey,
    },
  };
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
          ...(error.details === undefined ? {} : { details: error.details }),
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

function resolveRuntimeSettings(options: AdminControllerOptions): RuntimeSettingsService {
  return options.runtimeSettings ?? createRuntimeSettingsService({
    config: options.config,
    storage: options.storage,
  });
}

function readPollingSettingsBody(body: unknown): SavePollingSettingsInput {
  if (!isRecord(body)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '请求体必须是 JSON 对象。');
  }

  return {
    excludeReplies: readRequiredBooleanBodyValue(body.excludeReplies, 'excludeReplies'),
    excludeReposts: readRequiredBooleanBodyValue(body.excludeReposts, 'excludeReposts'),
    fetchLimitPerAccount: readRequiredIntegerBodyValue(
      body.fetchLimitPerAccount,
      'fetchLimitPerAccount',
      1,
      100,
    ),
    intervalSeconds: readRequiredIntegerBodyValue(body.intervalSeconds, 'intervalSeconds', 10, 3600),
  };
}

function readRequiredBooleanBodyValue(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new AdminApiError(400, 'INVALID_REQUEST', fieldName + ' 必须是 boolean。');
  }

  return value;
}

function readRequiredIntegerBodyValue(
  value: unknown,
  fieldName: string,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', fieldName + ' 必须是整数。');
  }

  if (value < min || value > max) {
    throw new AdminApiError(400, 'INVALID_REQUEST', `${fieldName} 必须在 ${min}-${max} 之间。`);
  }

  return value;
}

function readFeishuWebhookUrl(body: unknown): string {
  if (!isRecord(body)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '请求体必须是 JSON 对象。');
  }

  if (typeof body.webhookUrl !== 'string') {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'webhookUrl 必须是字符串。');
  }

  const webhookUrl = body.webhookUrl.trim();

  if (webhookUrl.length === 0) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'webhookUrl 不能为空。');
  }

  try {
    const parsedUrl = new URL(webhookUrl);

    if (parsedUrl.protocol !== 'https:') {
      throw new AdminApiError(400, 'INVALID_REQUEST', 'webhookUrl 必须使用 https。');
    }

    return parsedUrl.toString();
  } catch (error) {
    if (error instanceof AdminApiError) {
      throw error;
    }

    throw new AdminApiError(400, 'INVALID_REQUEST', 'webhookUrl 必须是有效 URL。');
  }
}

function toFeishuTestSendError(
  result: FeishuWebhookFailureResult,
  webhookUrl: string,
): AdminApiError {
  const diagnostics = result.error.diagnostics;
  const details: Record<string, unknown> = {
    endpoint: diagnostics.endpoint,
    retryable: result.error.retryable,
  };

  if (diagnostics.httpStatusCode !== undefined) {
    details.httpStatusCode = diagnostics.httpStatusCode;
  }
  if (diagnostics.providerCode !== undefined) {
    details.providerCode = diagnostics.providerCode;
  }
  if (diagnostics.providerMessage !== undefined) {
    details.providerMessage = redactWebhookFromText(diagnostics.providerMessage, webhookUrl);
  }
  if (diagnostics.causeMessage !== undefined) {
    details.causeMessage = redactWebhookFromText(diagnostics.causeMessage, webhookUrl);
  }
  if (diagnostics.responseBodySnippet !== undefined) {
    details.responseBodySnippet = redactWebhookFromText(
      diagnostics.responseBodySnippet,
      webhookUrl,
    );
  }

  return new AdminApiError(
    502,
    result.error.code,
    '飞书 webhook 测试发送失败。',
    details,
  );
}

function redactWebhookFromText(value: string, webhookUrl: string): string {
  const preview = previewSecretUrl(webhookUrl);
  const variants = new Set<string>([
    webhookUrl,
    webhookUrl.replace(/\/+$/u, ''),
  ]);

  try {
    const normalizedWebhookUrl = new URL(webhookUrl).toString();
    variants.add(normalizedWebhookUrl);
    variants.add(normalizedWebhookUrl.replace(/\/+$/u, ''));
  } catch {
    // Invalid URLs are rejected before test sends; keep this defensive.
  }

  let redactedValue = value;

  for (const variant of variants) {
    if (variant.length > 0) {
      redactedValue = redactedValue.split(variant).join(preview);
    }
  }

  return redactedValue;
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
