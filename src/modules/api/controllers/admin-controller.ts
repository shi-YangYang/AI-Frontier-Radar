import { randomBytes } from 'node:crypto';

import type { AppConfig } from '../../../shared/config/types';
import { createFeishuWebhookClient, type FeishuWebhookFailureResult } from '../../delivery';
import { SourceProviderError, type SourceProviderAccount } from '../../polling';
import type { RuntimeSchedulerRunNowResult } from '../../scheduler';
import {
  createRuntimeSettingsService,
  previewSecretUrl,
  type DeliveryTarget,
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
  validateWatchAccount?(input: { xUsername: string }): Promise<SourceProviderAccount>;
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
const DELIVERY_TARGET_KEY_PREFIX = 'feishu';

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
  const account = await validateWatchAccount(username, options);
  const { created, watchAccount } = await options.storage.watchAccounts.createIfAbsentByUsername({
    displayName: account.displayName ?? null,
    enabled: true,
    xUserId: account.xUserId,
    xUsername: account.xUsername,
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

export async function batchDeleteAdminPollRuns(
  body: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { deletedCount: number } }> {
  const ids = readIdsBody(body);
  const deletedCount = await options.storage.pollRuns.deleteManyByIds(ids);

  return {
    ok: true,
    data: {
      deletedCount,
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

export async function batchDeleteAdminDeliveryEvents(
  body: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { deletedCount: number } }> {
  const ids = readIdsBody(body);
  const deletedCount = await options.storage.deliveryEvents.deleteManyByIds(ids);

  return {
    ok: true,
    data: {
      deletedCount,
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

export async function listAdminDeliveryTargets(
  query: unknown,
  options: AdminControllerOptions,
): Promise<{
  ok: true;
  data: {
    deliveryTargets: AdminDeliveryTarget[];
    pagination: AdminPagination;
    summary: AdminDeliveryTargetSummary;
  };
}> {
  const paginationInput = readPaginationQuery(query);
  const summary = await options.storage.deliveryTargets.getVisibleSummary();
  const resolvedPaginationInput = clampPaginationInput(paginationInput, summary.total);
  const deliveryTargets = await options.storage.deliveryTargets.listPage(resolvedPaginationInput);

  return {
    ok: true,
    data: {
      deliveryTargets: deliveryTargets.map(toAdminDeliveryTarget),
      pagination: toPagination(resolvedPaginationInput, summary.total),
      summary,
    },
  };
}

export async function createAdminDeliveryTarget(
  body: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { deliveryTarget: AdminDeliveryTarget } }> {
  const input = readCreateDeliveryTargetBody(body);
  await assertWebhookUrlNotDuplicated(input.webhookUrl, options);
  const deliveryTarget = await options.storage.deliveryTargets.create({
    channelType: 'feishu_webhook',
    displayName: input.displayName,
    enabled: input.enabled,
    targetKey: await createUniqueDeliveryTargetKey(options),
    webhookUrl: input.webhookUrl,
  });

  return {
    ok: true,
    data: {
      deliveryTarget: toAdminDeliveryTarget(deliveryTarget),
    },
  };
}

export async function updateAdminDeliveryTarget(
  params: unknown,
  body: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { deliveryTarget: AdminDeliveryTarget } }> {
  const id = readIdParam(params);
  const existingTarget = await findVisibleDeliveryTarget(id, options);
  const input = readUpdateDeliveryTargetBody(body);

  if (input.webhookUrl !== undefined) {
    await assertWebhookUrlNotDuplicated(input.webhookUrl, options, existingTarget.id);
  }

  const updatedTarget = await options.storage.deliveryTargets.update(existingTarget.id, input);

  if (updatedTarget === null || updatedTarget.webhookUrl.trim().length === 0) {
    throw new AdminApiError(404, 'NOT_FOUND', '未找到飞书 webhook。');
  }

  return {
    ok: true,
    data: {
      deliveryTarget: toAdminDeliveryTarget(updatedTarget),
    },
  };
}

export async function updateAdminDeliveryTargetEnabled(
  params: unknown,
  body: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { deliveryTarget: AdminDeliveryTarget } }> {
  const id = readIdParam(params);
  const existingTarget = await findVisibleDeliveryTarget(id, options);
  const enabled = readDeliveryTargetEnabledBody(body);
  const updatedTarget = await options.storage.deliveryTargets.update(existingTarget.id, {
    enabled,
  });

  if (updatedTarget === null || updatedTarget.webhookUrl.trim().length === 0) {
    throw new AdminApiError(404, 'NOT_FOUND', '未找到飞书 webhook。');
  }

  return {
    ok: true,
    data: {
      deliveryTarget: toAdminDeliveryTarget(updatedTarget),
    },
  };
}

export async function deleteAdminDeliveryTarget(
  params: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { deadEventsCount: number; deleted: true } }> {
  const id = readIdParam(params);
  await findVisibleDeliveryTarget(id, options);
  const deleteResult = await options.storage.deliveryTargets.delete(id);

  if (!deleteResult.deleted) {
    throw new AdminApiError(404, 'NOT_FOUND', '未找到飞书 webhook。');
  }

  return {
    ok: true,
    data: {
      deadEventsCount: deleteResult.deadEventsCount,
      deleted: true,
    },
  };
}

export async function testAdminDeliveryTarget(
  params: unknown,
  options: AdminControllerOptions,
): Promise<{
  ok: true;
  data: {
    ok: true;
    providerCode: number;
    providerMessage?: string;
    targetKey: string;
    webhookPreview: string;
  };
}> {
  const id = readIdParam(params);
  const target = await findVisibleDeliveryTarget(id, options);

  const result = await createFeishuWebhookClient().sendTextMessage({
    targetKey: target.targetKey,
    text: `AI 前沿消息本地配置测试：${target.displayName} webhook 可用。`,
    webhookUrl: target.webhookUrl,
  });

  if (!result.ok) {
    throw toFeishuTestSendError(result, target.webhookUrl);
  }

  return {
    ok: true,
    data: {
      ok: true,
      providerCode: result.providerCode,
      ...(result.providerMessage === undefined ? {} : { providerMessage: result.providerMessage }),
      targetKey: result.targetKey,
      webhookPreview: previewSecretUrl(target.webhookUrl),
    },
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

interface AdminDeliveryTarget {
  channelType: DeliveryTarget['channelType'];
  createdAt: string;
  displayName: string;
  enabled: boolean;
  id: string;
  targetKey: string;
  updatedAt: string;
  webhookPreview: string;
}

interface AdminDeliveryTargetSummary {
  enabled: number;
  total: number;
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

async function validateWatchAccount(
  xUsername: string,
  options: AdminControllerOptions,
): Promise<SourceProviderAccount> {
  if (options.actions?.validateWatchAccount === undefined) {
    throw new AdminApiError(
      503,
      'SOURCE_VALIDATION_UNAVAILABLE',
      'X 账号校验服务不可用，无法添加监听账号。',
    );
  }

  try {
    return await options.actions.validateWatchAccount({ xUsername });
  } catch (error) {
    throw toAdminSourceValidationError(error);
  }
}

function toAdminSourceValidationError(error: unknown): AdminApiError {
  if (error instanceof AdminApiError) {
    return error;
  }

  if (error instanceof SourceProviderError) {
    const details = toSafeSourceErrorDetails(error);

    if (error.code === 'SOURCE_ACCOUNT_NOT_FOUND') {
      return new AdminApiError(404, error.code, 'X 账号不存在，未添加监听账号。', details);
    }

    if (error.code === 'SOURCE_AUTH_FAILED') {
      return new AdminApiError(
        502,
        error.code,
        'X 数据源未登录或认证失败，无法校验账号。',
        details,
      );
    }

    if (error.code === 'SOURCE_RATE_LIMITED') {
      return new AdminApiError(429, error.code, 'X 数据源请求过于频繁，请稍后再试。', details);
    }

    if (error.code === 'SOURCE_INVALID_INPUT') {
      return new AdminApiError(400, error.code, 'X 账号名无效，未添加监听账号。', details);
    }

    return new AdminApiError(502, error.code, 'X 账号校验失败，未添加监听账号。', details);
  }

  return new AdminApiError(502, 'SOURCE_VALIDATION_FAILED', 'X 账号校验失败，未添加监听账号。');
}

function toSafeSourceErrorDetails(error: SourceProviderError): Record<string, unknown> {
  const details: Record<string, unknown> = {
    operation: error.diagnostics.operation,
    provider: error.diagnostics.provider,
  };

  if (error.diagnostics.statusCode !== undefined) {
    details.statusCode = error.diagnostics.statusCode;
  }
  if (error.diagnostics.xUsername !== undefined) {
    details.xUsername = error.diagnostics.xUsername;
  }

  return details;
}

function toAdminDeliveryTarget(target: DeliveryTarget): AdminDeliveryTarget {
  return {
    channelType: target.channelType,
    createdAt: target.createdAt,
    displayName: target.displayName,
    enabled: target.enabled,
    id: target.id,
    targetKey: target.targetKey,
    updatedAt: target.updatedAt,
    webhookPreview: previewSecretUrl(target.webhookUrl),
  };
}

async function findVisibleDeliveryTarget(
  id: string,
  options: AdminControllerOptions,
): Promise<DeliveryTarget> {
  const target = await options.storage.deliveryTargets.findById(id);

  if (target === null || target.webhookUrl.trim().length === 0) {
    throw new AdminApiError(404, 'NOT_FOUND', '未找到飞书 webhook。');
  }

  return target;
}

async function createUniqueDeliveryTargetKey(options: AdminControllerOptions): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const targetKey = `${DELIVERY_TARGET_KEY_PREFIX}-${randomBytes(4).toString('hex')}`;
    const existingTarget = await options.storage.deliveryTargets.findByTargetKey(targetKey);

    if (existingTarget === null) {
      return targetKey;
    }
  }

  throw new AdminApiError(500, 'TARGET_KEY_GENERATION_FAILED', '无法生成飞书 webhook 标识。');
}

async function assertWebhookUrlNotDuplicated(
  webhookUrl: string,
  options: AdminControllerOptions,
  allowedTargetId?: string,
): Promise<void> {
  const normalizedWebhookUrl = normalizeWebhookUrlForComparison(webhookUrl);
  const targets = await options.storage.deliveryTargets.listAll();
  const duplicatedTarget = targets.find(
    (target) =>
      target.id !== allowedTargetId &&
      normalizeWebhookUrlForComparison(target.webhookUrl) === normalizedWebhookUrl,
  );

  if (duplicatedTarget !== undefined) {
    throw new AdminApiError(409, 'DUPLICATE_WEBHOOK_URL', '飞书 webhook URL 已存在。');
  }
}

function readCreateDeliveryTargetBody(body: unknown): {
  displayName: string;
  enabled: boolean;
  webhookUrl: string;
} {
  if (!isRecord(body)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '请求体必须是 JSON 对象。');
  }

  return {
    displayName: readDeliveryTargetDisplayName(body.displayName),
    enabled: readOptionalBooleanBodyValue(body.enabled, 'enabled') ?? true,
    webhookUrl: readFeishuWebhookUrl(body),
  };
}

function readUpdateDeliveryTargetBody(body: unknown): {
  displayName?: string;
  webhookUrl?: string;
} {
  if (!isRecord(body)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '请求体必须是 JSON 对象。');
  }

  const input: {
    displayName?: string;
    webhookUrl?: string;
  } = {};

  if (body.displayName !== undefined) {
    input.displayName = readDeliveryTargetDisplayName(body.displayName);
  }

  if (body.webhookUrl !== undefined) {
    input.webhookUrl = readFeishuWebhookUrl(body);
  }

  if (Object.keys(input).length === 0) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '至少需要提供 displayName 或 webhookUrl。');
  }

  return input;
}

function readDeliveryTargetEnabledBody(body: unknown): boolean {
  if (!isRecord(body)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '请求体必须是 JSON 对象。');
  }

  return readRequiredBooleanBodyValue(body.enabled, 'enabled');
}

function readDeliveryTargetDisplayName(value: unknown): string {
  if (value === undefined) {
    return 'Feishu Webhook';
  }

  if (typeof value !== 'string') {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'displayName 必须是字符串。');
  }

  const displayName = value.trim();

  if (displayName.length === 0) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'displayName 不能为空。');
  }

  if (displayName.length > 100) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'displayName 不能超过 100 个字符。');
  }

  return displayName;
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

function readOptionalBooleanBodyValue(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  return readRequiredBooleanBodyValue(value, fieldName);
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

function normalizeWebhookUrlForComparison(webhookUrl: string): string {
  return new URL(webhookUrl.trim()).toString().replace(/\/+$/u, '');
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

function readIdsBody(body: unknown): string[] {
  if (!isRecord(body)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '请求体必须是 JSON 对象。');
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'ids 必须是非空数组。');
  }

  return body.ids.map((id) => {
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new AdminApiError(400, 'INVALID_REQUEST', 'ids 中每一项都必须是非空字符串。');
    }

    return id;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
