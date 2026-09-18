import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { AppConfig } from '../../../shared/config/types';
import {
  createDefaultDeliveryChannelRegistry,
  type DeliveryChannelSendResult,
} from '../../delivery';
import { createFeishuWebhookClient, type FeishuWebhookFailureResult } from '../../delivery';
import {
  SourceProviderError,
  YoutubeChannelResolveError,
  resolveYoutubeChannel,
  type SourceProviderAccount,
} from '../../polling';
import {
  XSourceDiagnosticError,
  createXSourceDiagnostics,
  type XSourceAnonymousCheckResult,
  type XSourceLoginCheckResult,
  type XSourceOpenLoginResult,
} from '../../polling/source/x-source-diagnostics';
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
import { SubscriptionRuleValidationError, createSubscriptionRuleService } from '../../storage';
import type {
  RuntimeRssSettings,
  RuntimeXSourceSettings,
  SaveRssSettingsInput,
  SaveXBrowserSettingsInput,
} from '../../storage/runtime-settings-service';
import type { XPostPageQuery, XPostRawWithDeliveryEvents, XPostSummary } from '../../storage/types';
import {
  createBackupService,
  createRetentionService,
  type BackupEntry,
  type RetentionCleanupResult,
  type RetentionSettings,
} from '../../maintenance';
import { sharedLogBuffer, type LogBufferEntry } from '../../../lib/logger';
import { SOURCE_GROUPS, findSourceGroup } from '../../../config/source-groups';
import {
  applySourceGroup,
  getSourceGroupStatuses,
  type SourceGroupStatus,
} from '../../storage';
import { normalizeXUsername } from '../../storage/watch-account-repository';

export type AdminWatchAccountValidationInput =
  | { sourceType: 'ai2_blog'; sourceUrl: string }
  | { sourceType: 'anthropic_news'; sourceUrl: string }
  | { sourceType: 'github'; sourceUrl: string }
  | { sourceType: 'hf_papers'; sourceUrl: string }
  | { sourceType: 'meta_ai_blog'; sourceUrl: string }
  | { sourceType: 'moonshot_blog'; sourceUrl: string }
  | { sourceType: 'rss'; sourceUrl: string }
  | { sourceType: 'x'; xUsername: string }
  | { sourceType: 'xai_news'; sourceUrl: string };

export interface AdminActions {
  runDeliveryWorkerNow?(options?: { recoverStartupState?: boolean; trigger?: string }): Promise<RuntimeSchedulerRunNowResult>;
  runPollingNow?(options?: { trigger?: string }): Promise<RuntimeSchedulerRunNowResult>;
  updatePollingSchedule?(intervalSeconds: number): void | Promise<void>;
  validateWatchAccount?(input: AdminWatchAccountValidationInput): Promise<SourceProviderAccount>;
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

interface AdminWatchAccountsPaginationInput {
  page: number;
  pageSize: number;
  query?: string;
}

type AdminPostTriStateFilter = 'all' | 'false' | 'true';

const DEFAULT_ADMIN_PAGE_SIZE = 10;
const MAX_ADMIN_PAGE_SIZE = 100;
const DELIVERY_TARGET_KEY_PREFIX = 'feishu';
const DEFAULT_X_SOURCE_TEST_USERNAME = 'openai';
const X_BROWSER_PROXY_PROTOCOLS = ['http:', 'https:', 'socks5:'] as const;
const RSS_PROXY_PROTOCOLS = ['http:', 'https:'] as const;

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
  query: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { pagination: AdminPagination; watchAccounts: WatchAccount[] } }> {
  const paginationInput = readWatchAccountsPaginationQuery(query);
  const total = await options.storage.watchAccounts.countAll(paginationInput);
  const resolvedPaginationInput = clampPaginationInput(paginationInput, total);
  const watchAccounts = await options.storage.watchAccounts.listPage(resolvedPaginationInput);

  return {
    ok: true,
    data: {
      pagination: toPagination(resolvedPaginationInput, total),
      watchAccounts,
    },
  };
}

export async function createAdminWatchAccount(
  body: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { created: boolean; watchAccount: WatchAccount } }> {
  const input = readCreateWatchAccountBody(body);
  const account = await validateWatchSource(input, options);

  if (
    input.sourceType === 'rss' ||
    input.sourceType === 'github' ||
    input.sourceType === 'hf_papers' ||
    input.sourceType === 'anthropic_news' ||
    input.sourceType === 'ai2_blog' ||
    input.sourceType === 'moonshot_blog' ||
    input.sourceType === 'meta_ai_blog' ||
    input.sourceType === 'xai_news'
  ) {
    const { created, watchAccount } = await options.storage.watchAccounts.createIfAbsentBySource({
      displayName: account.displayName ?? null,
      enabled: true,
      sourceType: input.sourceType,
      sourceUrl: normalizeRssSourceUrl(input.sourceUrl),
    });

    return {
      ok: true,
      data: {
        created,
        watchAccount,
      },
    };
  }

  const { created, watchAccount } = await options.storage.watchAccounts.createIfAbsentByUsername({
    displayName: account.displayName ?? null,
    enabled: true,
    xUserId: account.sourceId,
    xUsername: account.sourceLabel,
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
): Promise<{ ok: true; data: { deleted: true; deletedEvents: number; deletedPosts: number } }> {
  const id = readIdParam(params);
  const account = await options.storage.watchAccounts.findById(id);

  if (account === null) {
    throw new AdminApiError(404, 'NOT_FOUND', '未找到监听账号。');
  }

  let deletedEvents = 0;
  let deletedPosts = 0;

  if (account.xUserId !== null && account.xUserId.length > 0) {
    deletedEvents = await options.storage.deliveryEvents.deleteByAuthorUserId(account.xUserId);
    deletedPosts = await options.storage.xPosts.deleteByAuthorUserId(account.xUserId);
  }

  const deleted = await options.storage.watchAccounts.delete(id);

  if (!deleted) {
    throw new AdminApiError(404, 'NOT_FOUND', '未找到监听账号。');
  }

  return {
    ok: true,
    data: {
      deleted: true,
      deletedEvents,
      deletedPosts,
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

export async function listAdminPosts(
  query: unknown,
  options: AdminControllerOptions,
): Promise<{
  ok: true;
  data: {
    pagination: AdminPagination;
    posts: AdminXPostContent[];
    summary: XPostSummary;
  };
}> {
  const pageQuery = readPostsPageQuery(query);
  const [total, summary] = await Promise.all([
    options.storage.xPosts.countAll(pageQuery),
    options.storage.xPosts.getSummary(),
  ]);
  const resolvedPageQuery = clampPaginationInput(pageQuery, total);
  const [posts, watchAccounts, deliveryTargets] = await Promise.all([
    options.storage.xPosts.listPage(resolvedPageQuery),
    options.storage.watchAccounts.listAll(),
    options.storage.deliveryTargets.listAll(),
  ]);
  const displayNameByUsername = new Map(
    watchAccounts
      .filter((account): account is WatchAccount & { xUsername: string } => account.xUsername !== null)
      .map((account) => [account.xUsername, account.displayName]),
  );
  const webhookUrlByTargetKey = new Map(
    deliveryTargets.map((target) => [target.targetKey, target.webhookUrl]),
  );

  return {
    ok: true,
    data: {
      pagination: toPagination(resolvedPageQuery, total),
      posts: posts.map((post) =>
        toAdminXPostContent(post, displayNameByUsername, webhookUrlByTargetKey),
      ),
      summary,
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

export async function clearAdminPollRunsHistory(
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { deletedCount: number; retainedRunningCount: number } }> {
  const result = await options.storage.pollRuns.deleteHistory();

  return {
    ok: true,
    data: result,
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

export async function clearAdminDeliveryEventsHistory(
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { deletedCount: number; retainedActiveCount: number } }> {
  const result = await options.storage.deliveryEvents.deleteHistory();

  return {
    ok: true,
    data: result,
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

export async function getAdminXSourceSettings(
  options: AdminControllerOptions,
): Promise<{ ok: true; data: RuntimeXSourceSettings }> {
  const runtimeSettings = resolveRuntimeSettings(options);
  const settings = await runtimeSettings.getXSourceSettingsSummary();

  return {
    ok: true,
    data: settings,
  };
}

export async function updateAdminXBrowserSettings(
  body: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: RuntimeXSourceSettings }> {
  const input = readXBrowserSettingsBody(body);
  const runtimeSettings = resolveRuntimeSettings(options);
  const settings = await runtimeSettings.saveXBrowserSettings(input);

  return {
    ok: true,
    data: settings,
  };
}

export async function getAdminRssSettings(
  options: AdminControllerOptions,
): Promise<{ ok: true; data: RuntimeRssSettings }> {
  const runtimeSettings = resolveRuntimeSettings(options);
  const settings = await runtimeSettings.getRssSettings();

  return {
    ok: true,
    data: settings,
  };
}

export async function updateAdminRssSettings(
  body: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: RuntimeRssSettings }> {
  const input = readRssSettingsBody(body);
  const runtimeSettings = resolveRuntimeSettings(options);
  const settings = await runtimeSettings.saveRssSettings(input);

  return {
    ok: true,
    data: settings,
  };
}

export async function clearAdminPostsHistory(
  options: AdminControllerOptions,
): Promise<{
  ok: true;
  data: { deletedEvents: number; deletedPosts: number; resetBoardSources: number };
}> {
  const deletedEvents = await options.storage.deliveryEvents.deleteAll();
  const deletedPosts = await options.storage.xPosts.deleteAll();
  const resetBoardSources = await options.storage.watchAccounts.resetBoardSourceCursors();

  return {
    ok: true,
    data: {
      deletedEvents,
      deletedPosts,
      resetBoardSources,
    },
  };
}

export async function getAdminDataSettings(
  options: AdminControllerOptions,
): Promise<{ ok: true; data: RetentionSettings }> {
  const settings = await createRetentionService({ storage: options.storage }).getSettings();

  return { ok: true, data: settings };
}

export async function updateAdminDataSettings(
  body: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: RetentionSettings }> {
  if (!isRecord(body) || !Number.isSafeInteger(body.retentionDays)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'retentionDays 必须是整数。');
  }

  try {
    const settings = await createRetentionService({ storage: options.storage }).saveSettings({
      retentionDays: body.retentionDays as number,
    });

    return { ok: true, data: settings };
  } catch (error) {
    throw new AdminApiError(
      400,
      'INVALID_REQUEST',
      error instanceof Error ? error.message : 'retentionDays 无效。',
    );
  }
}

export async function runAdminRetentionCleanup(options: AdminControllerOptions): Promise<{
  ok: true;
  data: RetentionCleanupResult & { settings: RetentionSettings };
}> {
  const service = createRetentionService({ storage: options.storage });
  const result = await service.cleanupNow();
  const settings = await service.getSettings();

  return { ok: true, data: { ...result, settings } };
}

export async function listAdminBackups(
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { backups: BackupEntry[] } }> {
  const backups = await createBackupService(openBackupOptions(options)).list();

  return { ok: true, data: { backups } };
}

export async function createAdminBackup(
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { backup: BackupEntry; backups: BackupEntry[] } }> {
  const service = createBackupService(openBackupOptions(options));
  const backup = await service.create();
  const backups = await service.list();

  return { ok: true, data: { backup, backups } };
}

export async function deleteAdminBackup(
  params: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { deleted: boolean } }> {
  const name = readBackupName(params);
  const deleted = await createBackupService(openBackupOptions(options)).delete(name);

  return { ok: true, data: { deleted } };
}

export async function downloadAdminBackup(
  params: unknown,
  options: AdminControllerOptions,
): Promise<{ content: Buffer; fileName: string }> {
  const name = readBackupName(params);
  const service = createBackupService(openBackupOptions(options));

  try {
    const content = await readFile(service.resolvePath(name));

    return { content, fileName: name };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new AdminApiError(404, 'NOT_FOUND', '备份文件不存在。');
    }

    throw error;
  }
}

export async function exportAdminPosts(
  query: unknown,
  options: AdminControllerOptions,
): Promise<{ body: string; contentType: string; fileName: string }> {
  const { format, limit, filters } = readExportQuery(query);
  const posts = await options.storage.xPosts.listForExport(filters, limit);
  const records = posts.map((post) => ({
    detectedAt: post.detectedAt,
    dedupeKey: post.dedupeKey,
    isReply: post.isReply,
    isRepost: post.isRepost,
    permalinkUrl: post.permalinkUrl,
    postedAt: post.postedAt,
    textContent: post.textContent,
    xPostId: post.xPostId,
    authorUsername: post.authorUsername,
  }));
  const timestamp = formatFileTimestamp(new Date());

  if (format === 'json') {
    return {
      body: JSON.stringify(records, null, 2),
      contentType: 'application/json; charset=utf-8',
      fileName: `posts-${timestamp}.json`,
    };
  }

  const header = [
    'xPostId',
    'authorUsername',
    'postedAt',
    'detectedAt',
    'permalinkUrl',
    'textContent',
    'isReply',
    'isRepost',
    'dedupeKey',
  ];
  const lines = [header.join(',')];

  for (const record of records) {
    lines.push(
      [
        record.xPostId,
        record.authorUsername,
        record.postedAt,
        record.detectedAt,
        record.permalinkUrl,
        record.textContent,
        String(record.isReply),
        String(record.isRepost),
        record.dedupeKey ?? '',
      ]
        .map(toCsvField)
        .join(','),
    );
  }

  return {
    body: `\ufeff${lines.join('\r\n')}\r\n`,
    contentType: 'text/csv; charset=utf-8',
    fileName: `posts-${timestamp}.csv`,
  };
}

export function listAdminLogs(query: unknown): {
  ok: true;
  data: { capacity: number; entries: LogBufferEntry[]; size: number };
} {
  const record = isRecord(query) ? query : {};
  const level = readLogLevelFilter(record.level);
  const limit = readLogLimit(record.limit);
  const entries = sharedLogBuffer.list({ ...(level === undefined ? {} : { level }), limit });

  return {
    ok: true,
    data: { capacity: sharedLogBuffer.maxSize, entries, size: sharedLogBuffer.size },
  };
}

export async function getAdminSourceGroups(
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { groups: SourceGroupStatus[] } }> {
  const groups = await getSourceGroupStatuses(options.storage.watchAccounts, SOURCE_GROUPS);

  return {
    ok: true,
    data: { groups },
  };
}

export async function applyAdminSourceGroup(
  params: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { created: number; existing: number; group: string } }> {
  const id = readIdParam(params);
  const group = findSourceGroup(id);

  if (group === undefined) {
    throw new AdminApiError(404, 'NOT_FOUND', `监听组合不存在：${id}`);
  }

  const result = await applySourceGroup(options.storage.watchAccounts, group);

  return {
    ok: true,
    data: {
      created: result.created,
      existing: result.existing,
      group: group.id,
    },
  };
}

export async function getAdminSubscriptionRules(
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { rules: unknown[] } }> {
  const service = createSubscriptionRuleService({ appSettings: options.storage.appSettings });
  const rules = await service.getRules();

  return {
    ok: true,
    data: { rules },
  };
}

export async function updateAdminSubscriptionRules(
  body: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { rules: unknown[] } }> {
  if (!isRecord(body) || !Array.isArray(body.rules)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'rules 必须是数组。');
  }

  const service = createSubscriptionRuleService({ appSettings: options.storage.appSettings });
  const knownTargetKeys = new Set(
    (await options.storage.deliveryTargets.listAll()).map((target) => target.targetKey),
  );
  const unknownTargetKeys = collectUnknownRuleTargetKeys(body.rules, knownTargetKeys);

  if (unknownTargetKeys.length > 0) {
    throw new AdminApiError(
      400,
      'INVALID_REQUEST',
      `规则引用了不存在的通道：${unknownTargetKeys.join('、')}。`,
    );
  }

  try {
    const rules = await service.saveRules(body.rules);

    return {
      ok: true,
      data: { rules },
    };
  } catch (error) {
    if (error instanceof SubscriptionRuleValidationError) {
      throw new AdminApiError(400, 'INVALID_REQUEST', error.message);
    }

    throw error;
  }
}

export async function resolveAdminYoutubeChannel(
  body: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: { feedUrl: string; label?: string } }> {
  const input = readYoutubeResolveInput(body);
  const runtimeSettings = resolveRuntimeSettings(options);
  const rssSettings = await runtimeSettings.getEffectiveRssProxySettings();

  try {
    const resolved = await resolveYoutubeChannel(input, {
      ...(rssSettings.proxyUrl === undefined ? {} : { proxyUrl: rssSettings.proxyUrl }),
    });

    return {
      ok: true,
      data: resolved,
    };
  } catch (error) {
    if (error instanceof YoutubeChannelResolveError) {
      if (error.kind === 'invalid-input') {
        throw new AdminApiError(400, 'INVALID_REQUEST', error.message);
      }

      throw new AdminApiError(502, 'YOUTUBE_RESOLVE_FAILED', error.message);
    }

    throw error;
  }
}

export async function testAdminXSourceAnonymous(
  body: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: XSourceAnonymousCheckResult }> {
  const xUsername = readXSourceUsernameBody(body);
  const runtimeSettings = resolveRuntimeSettings(options);
  const diagnostics = createXSourceDiagnostics({
    getEffectiveAppConfig: () => runtimeSettings.getEffectiveAppConfig(),
  });
  const result = await runXSourceDiagnostic(() => diagnostics.testAnonymous(xUsername));

  return {
    ok: true,
    data: result,
  };
}

export async function checkAdminXSourceLogin(
  body: unknown,
  options: AdminControllerOptions,
): Promise<{ ok: true; data: XSourceLoginCheckResult }> {
  const xUsername = readXSourceUsernameBody(body);
  const runtimeSettings = resolveRuntimeSettings(options);
  const diagnostics = createXSourceDiagnostics({
    getEffectiveAppConfig: () => runtimeSettings.getEffectiveAppConfig(),
  });
  const result = await runXSourceDiagnostic(() => diagnostics.checkLogin(xUsername));

  return {
    ok: true,
    data: result,
  };
}

export async function openAdminXLoginWindow(
  options: AdminControllerOptions,
): Promise<{ ok: true; data: XSourceOpenLoginResult }> {
  const runtimeSettings = resolveRuntimeSettings(options);
  const diagnostics = createXSourceDiagnostics({
    getEffectiveAppConfig: () => runtimeSettings.getEffectiveAppConfig(),
  });
  const result = await runXSourceDiagnostic(() => diagnostics.openLoginWindow());

  return {
    ok: true,
    data: result,
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
    channelType: input.channelType,
    config: input.config,
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

  const { secret, target, ...restInput } = input;
  const nextConfig: { secret?: string; target?: string } = { ...existingTarget.config };

  if (secret !== undefined) {
    if (secret.length === 0) {
      delete nextConfig.secret;
    } else {
      nextConfig.secret = secret;
    }
  }

  if (target !== undefined) {
    if (target.length === 0) {
      delete nextConfig.target;
    } else {
      nextConfig.target = target;
    }
  }

  const updatedTarget = await options.storage.deliveryTargets.update(existingTarget.id, {
    ...restInput,
    config: nextConfig,
  });

  if (updatedTarget === null) {
    throw new AdminApiError(404, 'NOT_FOUND', '未找到投递通道。');
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

  if (updatedTarget === null) {
    throw new AdminApiError(404, 'NOT_FOUND', '未找到投递通道。');
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
    throw new AdminApiError(404, 'NOT_FOUND', '未找到投递通道。');
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
    providerCode?: number;
    providerMessage?: string;
    targetKey: string;
    webhookPreview: string;
  };
}> {
  const id = readIdParam(params);
  const target = await findVisibleDeliveryTarget(id, options);
  const channels = createDefaultDeliveryChannelRegistry();
  const channelSender = channels.get(target.channelType);

  if (channelSender === undefined) {
    throw new AdminApiError(400, 'INVALID_REQUEST', `不支持的渠道类型 ${target.channelType}。`);
  }

  const testText = `AI 前沿消息本地配置测试：${target.displayName} 通道可用。`;
  const result = await channelSender.send({
    config: target.config,
    message: {
      author: 'AI 前沿雷达',
      postedAt: new Date().toISOString(),
      text: testText,
      title: `【AI前沿消息】配置测试：${target.displayName}`,
      url: 'http://127.0.0.1:3000',
    },
    targetKey: target.targetKey,
    webhookUrl: target.webhookUrl,
  });

  if (!result.ok) {
    throw new AdminApiError(502, result.error.code, result.error.message, {
      diagnostics: result.error.diagnostics,
      retryable: result.error.retryable,
      targetKey: target.targetKey,
      webhookPreview: previewSecretUrl(target.webhookUrl),
    });
  }

  return {
    ok: true,
    data: {
      ok: true,
      ...(result.providerCode === undefined ? {} : { providerCode: result.providerCode }),
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
  secretConfigured: boolean;
  target: string | null;
  targetKey: string;
  updatedAt: string;
  webhookPreview: string;
}

interface AdminDeliveryTargetSummary {
  enabled: number;
  total: number;
}

interface AdminPostDeliverySummary {
  active: number;
  dead: number;
  failed: number;
  sent: number;
  total: number;
}

interface AdminXPostContent {
  authorDisplayName: string | null;
  authorUserId: string | null;
  authorUsername: string;
  createdAt: string;
  deliveryEvents: AdminXPostDeliveryEvent[];
  deliverySummary: AdminPostDeliverySummary;
  detectedAt: string;
  id: string;
  isReply: boolean;
  isRepost: boolean;
  permalinkUrl: string;
  postedAt: string;
  rawPayloadJson: string;
  textContent: string;
  xPostId: string;
}

interface AdminXPostDeliveryEvent {
  attemptCount: number;
  createdAt: string;
  id: string;
  lastError: string | null;
  nextRetryAt: string | null;
  sentAt: string | null;
  status: DeliveryEvent['status'];
  targetKey: string;
  updatedAt: string;
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

function readWatchAccountsPaginationQuery(query: unknown): AdminWatchAccountsPaginationInput {
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
    page: readPageQueryValue(query.page),
    pageSize: readPageSizeQueryValue(query.pageSize),
    ...readWatchAccountSearchQuery(query.query),
  };
}

function readPostsPageQuery(query: unknown): XPostPageQuery {
  if (query === undefined || query === null) {
    return {
      page: 1,
      pageSize: DEFAULT_ADMIN_PAGE_SIZE,
    };
  }

  if (!isRecord(query)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '分页参数必须是查询对象。');
  }

  const postedFrom = readOptionalIsoQueryValue(query.postedFrom, 'postedFrom');
  const postedTo = readOptionalIsoQueryValue(query.postedTo, 'postedTo');
  const detectedFrom = readOptionalIsoQueryValue(query.detectedFrom, 'detectedFrom');
  const detectedTo = readOptionalIsoQueryValue(query.detectedTo, 'detectedTo');

  assertValidTimeRange(postedFrom, postedTo, '发布时间开始不能晚于结束时间。');
  assertValidTimeRange(detectedFrom, detectedTo, '检测时间开始不能晚于结束时间。');

  return {
    ...readOptionalAuthorUsernameQuery(query.authorUsername),
    ...readOptionalTextSearchQuery(query.query),
    ...(detectedFrom === undefined ? {} : { detectedFrom }),
    ...(detectedTo === undefined ? {} : { detectedTo }),
    ...readPostBooleanQuery(query.isReply, 'isReply'),
    ...readPostBooleanQuery(query.isRepost, 'isRepost'),
    page: readPageQueryValue(query.page),
    pageSize: readPageSizeQueryValue(query.pageSize),
    ...(postedFrom === undefined ? {} : { postedFrom }),
    ...(postedTo === undefined ? {} : { postedTo }),
  };
}

function readOptionalAuthorUsernameQuery(value: unknown): { authorUsername?: string } {
  if (value === undefined) {
    return {};
  }

  const authorUsername = readSingleOptionalStringQueryValue(value, 'authorUsername')
    ?.replace(/^@+/, '')
    .toLowerCase();

  return authorUsername === undefined || authorUsername.length === 0 ? {} : { authorUsername };
}

function readOptionalTextSearchQuery(value: unknown): { query?: string } {
  if (value === undefined) {
    return {};
  }

  const normalizedQuery = readSingleOptionalStringQueryValue(value, 'query');
  return normalizedQuery === undefined || normalizedQuery.length === 0 ? {} : { query: normalizedQuery };
}

function readPostBooleanQuery(
  value: unknown,
  fieldName: 'isReply' | 'isRepost',
): { isReply?: boolean; isRepost?: boolean } {
  const filter = readPostTriStateQueryValue(value, fieldName);

  if (filter === 'all') {
    return {};
  }

  return {
    [fieldName]: filter === 'true',
  };
}

function readPostTriStateQueryValue(
  value: unknown,
  fieldName: string,
): AdminPostTriStateFilter {
  if (value === undefined) {
    return 'all';
  }

  if (Array.isArray(value)) {
    if (value.length !== 1) {
      throw new AdminApiError(400, 'INVALID_REQUEST', fieldName + ' 必须是单个筛选值。');
    }

    return readPostTriStateQueryValue(value[0], fieldName);
  }

  if (typeof value !== 'string') {
    throw new AdminApiError(400, 'INVALID_REQUEST', fieldName + ' 必须是 all、true 或 false。');
  }

  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === 'all' || normalizedValue === 'true' || normalizedValue === 'false') {
    return normalizedValue;
  }

  throw new AdminApiError(400, 'INVALID_REQUEST', fieldName + ' 必须是 all、true 或 false。');
}

function readSingleOptionalStringQueryValue(value: unknown, fieldName: string): string | undefined {
  if (Array.isArray(value)) {
    if (value.length !== 1) {
      throw new AdminApiError(400, 'INVALID_REQUEST', fieldName + ' 必须是单个字符串。');
    }

    return readSingleOptionalStringQueryValue(value[0], fieldName);
  }

  if (typeof value !== 'string') {
    throw new AdminApiError(400, 'INVALID_REQUEST', fieldName + ' 必须是字符串。');
  }

  const normalizedValue = value.trim();
  return normalizedValue.length === 0 ? undefined : normalizedValue;
}

function assertValidTimeRange(from: string | undefined, to: string | undefined, message: string): void {
  if (from !== undefined && to !== undefined && Date.parse(from) > Date.parse(to)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', message);
  }
}

function readWatchAccountSearchQuery(value: unknown): { query?: string } {
  if (value === undefined) {
    return {};
  }

  if (Array.isArray(value)) {
    if (value.length !== 1) {
      throw new AdminApiError(400, 'INVALID_REQUEST', 'query 必须是单个字符串。');
    }

    return readWatchAccountSearchQuery(value[0]);
  }

  if (typeof value !== 'string') {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'query 必须是字符串。');
  }

  const normalizedQuery = value.trim().replace(/^@+/, '').toLowerCase();
  return normalizedQuery.length === 0 ? {} : { query: normalizedQuery };
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

function clampPaginationInput<T extends { page: number; pageSize: number }>(input: T, total: number): T {
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

async function runXSourceDiagnostic<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toAdminXSourceDiagnosticError(error);
  }
}

function toAdminXSourceDiagnosticError(error: unknown): AdminApiError {
  if (error instanceof AdminApiError) {
    return error;
  }

  if (error instanceof XSourceDiagnosticError) {
    return new AdminApiError(error.statusCode, error.code, error.message, error.details);
  }

  return new AdminApiError(502, 'X_SOURCE_DIAGNOSTIC_FAILED', 'X 数据源诊断失败。');
}

async function validateWatchSource(
  input: AdminWatchAccountValidationInput,
  options: AdminControllerOptions,
): Promise<SourceProviderAccount> {
  if (options.actions?.validateWatchAccount === undefined) {
    throw new AdminApiError(
      503,
      'SOURCE_VALIDATION_UNAVAILABLE',
      input.sourceType === 'rss'
        ? 'RSS 源校验服务不可用，无法添加 RSS 源。'
        : 'X 账号校验服务不可用，无法添加监听账号。',
    );
  }

  try {
    return await options.actions.validateWatchAccount(input);
  } catch (error) {
    throw toAdminSourceValidationError(error, input.sourceType);
  }
}

function toAdminSourceValidationError(
  error: unknown,
  sourceType: AdminWatchAccountValidationInput['sourceType'],
): AdminApiError {
  if (error instanceof AdminApiError) {
    return error;
  }

  if (error instanceof SourceProviderError) {
    const details = toSafeSourceErrorDetails(error);

    if (sourceType === 'rss') {
      return toAdminRssSourceValidationError(error, details);
    }

    return toAdminXSourceValidationError(error, details);
  }

  return new AdminApiError(
    502,
    'SOURCE_VALIDATION_FAILED',
    sourceType === 'rss' ? 'RSS 源校验失败，未添加订阅源。' : 'X 账号校验失败，未添加监听账号。',
  );
}

function toAdminXSourceValidationError(
  error: SourceProviderError,
  details: Record<string, unknown>,
): AdminApiError {
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

  if (error.code === 'SOURCE_REQUEST_FAILED') {
    return new AdminApiError(
      502,
      error.code,
      'X 数据源网络请求失败，请检查网络或 X browser proxy 配置。',
      details,
    );
  }

  if (error.code === 'SOURCE_RESPONSE_INVALID') {
    return new AdminApiError(
      502,
      error.code,
      'X 页面结构不可解析，无法校验账号。',
      details,
    );
  }

  return new AdminApiError(502, error.code, 'X 账号校验失败，未添加监听账号。', details);
}

function toAdminRssSourceValidationError(
  error: SourceProviderError,
  details: Record<string, unknown>,
): AdminApiError {
  if (error.code === 'SOURCE_ACCOUNT_NOT_FOUND') {
    return new AdminApiError(404, error.code, 'RSS 源不存在或不可访问，未添加订阅源。', details);
  }

  if (error.code === 'SOURCE_AUTH_FAILED') {
    return new AdminApiError(502, error.code, 'RSS 源需要认证，暂不支持该订阅源。', details);
  }

  if (error.code === 'SOURCE_RATE_LIMITED') {
    return new AdminApiError(429, error.code, 'RSS 源请求过于频繁，请稍后再试。', details);
  }

  if (error.code === 'SOURCE_INVALID_INPUT') {
    return new AdminApiError(
      400,
      error.code,
      'RSS 源 URL 无效，请输入完整的 http/https 地址。',
      details,
    );
  }

  if (error.code === 'SOURCE_REQUEST_FAILED') {
    return new AdminApiError(
      502,
      error.code,
      'RSS 源网络请求失败，请检查 URL 或网络。',
      details,
    );
  }

  if (error.code === 'SOURCE_RESPONSE_INVALID') {
    return new AdminApiError(
      502,
      error.code,
      'RSS 源内容无法解析，请确认是有效的 RSS/Atom 地址。',
      details,
    );
  }

  return new AdminApiError(502, error.code, 'RSS 源校验失败，未添加订阅源。', details);
}

function toSafeSourceErrorDetails(error: SourceProviderError): Record<string, unknown> {
  const details: Record<string, unknown> = {
    operation: error.diagnostics.operation,
    provider: error.diagnostics.provider,
  };

  if (error.diagnostics.statusCode !== undefined) {
    details.statusCode = error.diagnostics.statusCode;
  }
  if (error.diagnostics.sourceUrl !== undefined) {
    details.sourceUrl = error.diagnostics.sourceUrl;
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
    secretConfigured: (target.config.secret?.length ?? 0) > 0,
    target: target.config.target ?? null,
    targetKey: target.targetKey,
    updatedAt: target.updatedAt,
    webhookPreview: previewSecretUrl(target.webhookUrl),
  };
}

function toAdminXPostContent(
  post: XPostRawWithDeliveryEvents,
  displayNameByUsername: ReadonlyMap<string, string | null>,
  webhookUrlByTargetKey: ReadonlyMap<string, string>,
): AdminXPostContent {
  return {
    authorDisplayName: displayNameByUsername.get(post.authorUsername.toLowerCase()) ?? null,
    authorUserId: post.authorUserId,
    authorUsername: post.authorUsername,
    createdAt: post.createdAt,
    deliveryEvents: post.deliveryEvents.map((event) =>
      toAdminXPostDeliveryEvent(event, webhookUrlByTargetKey),
    ),
    deliverySummary: summarizePostDeliveryEvents(post.deliveryEvents),
    detectedAt: post.detectedAt,
    id: post.id,
    isReply: post.isReply,
    isRepost: post.isRepost,
    permalinkUrl: post.permalinkUrl,
    postedAt: post.postedAt,
    rawPayloadJson: post.rawPayloadJson,
    textContent: post.textContent,
    xPostId: post.xPostId,
  };
}

function toAdminXPostDeliveryEvent(
  event: DeliveryEvent,
  webhookUrlByTargetKey: ReadonlyMap<string, string>,
): AdminXPostDeliveryEvent {
  return {
    attemptCount: event.attemptCount,
    createdAt: event.createdAt,
    id: event.id,
    lastError: redactDeliveryEventLastError(event.lastError, event.targetKey, webhookUrlByTargetKey),
    nextRetryAt: event.nextRetryAt,
    sentAt: event.sentAt,
    status: event.status,
    targetKey: event.targetKey,
    updatedAt: event.updatedAt,
  };
}

function redactDeliveryEventLastError(
  lastError: string | null,
  targetKey: string,
  webhookUrlByTargetKey: ReadonlyMap<string, string>,
): string | null {
  if (lastError === null) {
    return null;
  }

  const webhookUrl = webhookUrlByTargetKey.get(targetKey);
  const redactedKnownWebhook =
    webhookUrl === undefined ? lastError : redactWebhookFromText(lastError, webhookUrl);

  return redactFeishuWebhookUrlsFromText(redactedKnownWebhook);
}

function summarizePostDeliveryEvents(events: DeliveryEvent[]): AdminPostDeliverySummary {
  return events.reduce<AdminPostDeliverySummary>(
    (summary, event) => {
      summary.total += 1;

      if (event.status === 'sent') {
        summary.sent += 1;
      } else if (
        event.status === 'pending' ||
        event.status === 'retry_wait' ||
        event.status === 'sending'
      ) {
        summary.active += 1;
      } else if (event.status === 'failed') {
        summary.failed += 1;
      } else if (event.status === 'dead') {
        summary.dead += 1;
      }

      return summary;
    },
    {
      active: 0,
      dead: 0,
      failed: 0,
      sent: 0,
      total: 0,
    },
  );
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

function collectUnknownRuleTargetKeys(rules: unknown[], knownTargetKeys: Set<string>): string[] {
  const unknownKeys: string[] = [];

  for (const rule of rules) {
    if (!isRecord(rule) || !Array.isArray(rule.targetKeys)) {
      continue;
    }

    for (const entry of rule.targetKeys) {
      if (typeof entry !== 'string') {
        continue;
      }

      const targetKey = entry.trim();

      if (
        targetKey.length > 0 &&
        !knownTargetKeys.has(targetKey) &&
        !unknownKeys.includes(targetKey)
      ) {
        unknownKeys.push(targetKey);
      }
    }
  }

  return unknownKeys;
}

function readCreateDeliveryTargetBody(body: unknown): {
  channelType: DeliveryTarget['channelType'];
  config: { secret?: string };
  displayName: string;
  enabled: boolean;
  webhookUrl: string;
} {
  if (!isRecord(body)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '请求体必须是 JSON 对象。');
  }

  const channelType = readDeliveryChannelType(body.channelType);

  return {
    channelType,
    config: readDeliveryTargetConfig(body),
    displayName: readDeliveryTargetDisplayName(body.displayName),
    enabled: readOptionalBooleanBodyValue(body.enabled, 'enabled') ?? true,
    webhookUrl: readDeliveryTargetWebhookUrl(body, channelType),
  };
}

function readUpdateDeliveryTargetBody(body: unknown): {
  displayName?: string;
  secret?: string;
  target?: string;
  webhookUrl?: string;
} {
  if (!isRecord(body)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '请求体必须是 JSON 对象。');
  }

  const input: {
    displayName?: string;
    secret?: string;
    target?: string;
    webhookUrl?: string;
  } = {};

  if (body.displayName !== undefined) {
    input.displayName = readDeliveryTargetDisplayName(body.displayName);
  }

  if (body.webhookUrl !== undefined) {
    input.webhookUrl = readDeliveryTargetWebhookUrl(body, readDeliveryChannelType(body.channelType));
  }

  if (body.secret !== undefined) {
    input.secret = readDeliveryTargetSecret(body.secret);
  }

  if (body.target !== undefined) {
    if (typeof body.target !== 'string') {
      throw new AdminApiError(400, 'INVALID_REQUEST', 'target 必须是字符串。');
    }

    input.target = body.target.trim();
  }

  if (Object.keys(input).length === 0) {
    throw new AdminApiError(
      400,
      'INVALID_REQUEST',
      '至少需要提供 displayName、webhookUrl、secret 或 target。',
    );
  }

  return input;
}

function readDeliveryChannelType(value: unknown): DeliveryTarget['channelType'] {
  if (value === undefined) {
    return 'feishu_webhook';
  }

  if (
    value !== 'bark' &&
    value !== 'dingtalk_webhook' &&
    value !== 'feishu_webhook' &&
    value !== 'generic_webhook' &&
    value !== 'wechat_bridge' &&
    value !== 'wecom_webhook'
  ) {
    throw new AdminApiError(
      400,
      'INVALID_REQUEST',
      'channelType 必须是 feishu_webhook、wecom_webhook、dingtalk_webhook、bark、generic_webhook 或 wechat_bridge。',
    );
  }

  return value;
}

function readDeliveryTargetConfig(body: Record<string, unknown>): {
  secret?: string;
  target?: string;
} {
  const config: { secret?: string; target?: string } = {};

  if (body.secret !== undefined) {
    const secret = readDeliveryTargetSecret(body.secret);

    if (secret.length > 0) {
      config.secret = secret;
    }
  }

  if (body.target !== undefined) {
    if (typeof body.target !== 'string') {
      throw new AdminApiError(400, 'INVALID_REQUEST', 'target 必须是字符串。');
    }

    const target = body.target.trim();

    if (target.length > 200) {
      throw new AdminApiError(400, 'INVALID_REQUEST', 'target 不能超过 200 个字符。');
    }

    if (target.length > 0) {
      config.target = target;
    }
  }

  return config;
}

function readDeliveryTargetSecret(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'secret 必须是字符串。');
  }

  const secret = value.trim();

  if (secret.length > 256) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'secret 不能超过 256 个字符。');
  }

  return secret;
}

function readDeliveryTargetWebhookUrl(
  body: unknown,
  channelType: DeliveryTarget['channelType'],
): string {
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

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      throw new AdminApiError(400, 'INVALID_REQUEST', 'webhookUrl 必须使用 http 或 https。');
    }

    if (
      channelType === 'bark' &&
      (parsedUrl.pathname === '/' || parsedUrl.pathname.length === 0)
    ) {
      throw new AdminApiError(
        400,
        'INVALID_REQUEST',
        'Bark 推送地址需要包含设备 Key，例如 https://api.day.app/<deviceKey>。',
      );
    }

    return parsedUrl.toString();
  } catch (error) {
    if (error instanceof AdminApiError) {
      throw error;
    }

    throw new AdminApiError(400, 'INVALID_REQUEST', 'webhookUrl 必须是有效 URL。');
  }
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

function readXBrowserSettingsBody(body: unknown): SaveXBrowserSettingsInput {
  if (!isRecord(body)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '请求体必须是 JSON 对象。');
  }

  if (body.proxyUrl !== undefined && typeof body.proxyUrl !== 'string') {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'proxyUrl 必须是字符串。');
  }

  if (body.headless !== undefined && typeof body.headless !== 'boolean') {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'headless 必须是布尔值。');
  }

  if (body.proxyUrl === undefined && body.headless === undefined) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'proxyUrl 与 headless 至少提供一个。');
  }

  return {
    ...(typeof body.headless === 'boolean' ? { headless: body.headless } : {}),
    ...(typeof body.proxyUrl === 'string'
      ? { proxyUrl: normalizeOptionalProxyUrlBody(body.proxyUrl) }
      : {}),
  };
}

function readRssSettingsBody(body: unknown): SaveRssSettingsInput {
  if (!isRecord(body)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '请求体必须是 JSON 对象。');
  }

  if (typeof body.proxyUrl !== 'string') {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'proxyUrl 必须是字符串。');
  }

  return {
    proxyUrl: normalizeOptionalProxyUrlBody(body.proxyUrl, RSS_PROXY_PROTOCOLS),
  };
}

function readYoutubeResolveInput(body: unknown): string {
  if (!isRecord(body) || typeof body.input !== 'string') {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'input 必须是字符串。');
  }

  return body.input;
}

function readXSourceUsernameBody(body: unknown): string {
  if (body === undefined || body === null) {
    return DEFAULT_X_SOURCE_TEST_USERNAME;
  }

  if (!isRecord(body)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '请求体必须是 JSON 对象。');
  }

  const rawUsername = body.xUsername ?? body.username ?? DEFAULT_X_SOURCE_TEST_USERNAME;

  if (typeof rawUsername !== 'string') {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'xUsername 必须是字符串。');
  }

  const username = normalizeXUsername(rawUsername);

  if (!/^[a-z0-9_]{1,15}$/.test(username)) {
    throw new AdminApiError(
      400,
      'INVALID_REQUEST',
      'xUsername 必须是合法 X 用户名，长度 1-15，只能包含字母、数字或下划线。',
    );
  }

  return username;
}

function normalizeOptionalProxyUrlBody(
  rawValue: string,
  protocols: readonly string[] = X_BROWSER_PROXY_PROTOCOLS,
): string {
  const value = rawValue.trim();

  if (value.length === 0) {
    return '';
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'proxyUrl 必须是有效 URL。');
  }

  if (!protocols.includes(url.protocol)) {
    throw new AdminApiError(
      400,
      'INVALID_REQUEST',
      `proxyUrl 必须使用以下协议之一：${protocols.join(', ')}。`,
    );
  }

  return url.toString();
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

function redactFeishuWebhookUrlsFromText(value: string): string {
  return value.replace(
    /https:\/\/open\.feishu\.cn\/open-apis\/bot\/v2\/hook\/[^\s"',\\<>)}\]]+/gu,
    (webhookUrl) => previewSecretUrl(webhookUrl),
  );
}

function openBackupOptions(options: AdminControllerOptions): {
  backupsDir: string;
  databaseUrl: string;
} {
  return {
    backupsDir: join(dirname(options.config.storage.sqlite.path), 'backups'),
    databaseUrl: options.config.storage.prisma.databaseUrl,
  };
}

function readBackupName(params: unknown): string {
  if (!isRecord(params) || typeof params.name !== 'string' || params.name.trim().length === 0) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '备份文件名无效。');
  }

  const name = params.name.trim();

  if (!/^backup-\d{8}-\d{6}(?:-\d+)?\.sqlite$/u.test(name)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '备份文件名无效。');
  }

  return name;
}

function readExportQuery(query: unknown): {
  filters: Partial<XPostPageQuery>;
  format: 'csv' | 'json';
  limit: number;
} {
  const record = isRecord(query) ? query : {};
  const formatValue =
    record.format === undefined
      ? 'csv'
      : readSingleOptionalStringQueryValue(record.format, 'format') ?? 'csv';

  if (formatValue !== 'csv' && formatValue !== 'json') {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'format 必须是 csv 或 json。');
  }

  const postedFrom = readOptionalIsoQueryValue(record.postedFrom, 'postedFrom');
  const postedTo = readOptionalIsoQueryValue(record.postedTo, 'postedTo');
  assertValidTimeRange(postedFrom, postedTo, '发布时间开始不能晚于结束时间。');

  const requestedLimit = readPositiveIntegerQueryValue(record.limit, 'limit') ?? 20_000;

  if (requestedLimit > 50_000) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'limit 必须在 1-50000 之间。');
  }

  return {
    filters: {
      ...readOptionalAuthorUsernameQuery(record.authorUsername),
      ...readOptionalTextSearchQuery(record.query),
      ...(postedFrom === undefined ? {} : { postedFrom }),
      ...(postedTo === undefined ? {} : { postedTo }),
      ...readPostBooleanQuery(record.isReply, 'isReply'),
      ...readPostBooleanQuery(record.isRepost, 'isRepost'),
    },
    format: formatValue,
    limit: requestedLimit,
  };
}

function toCsvField(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value;
}

function formatFileTimestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');

  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function readLogLevelFilter(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const level = readSingleOptionalStringQueryValue(value, 'level');

  if (level === undefined || level.length === 0 || level === 'all') {
    return undefined;
  }

  if (!['debug', 'info', 'warn', 'error'].includes(level)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'level 必须是 debug、info、warn 或 error。');
  }

  return level;
}

function readLogLimit(value: unknown): number {
  const limit = readPositiveIntegerQueryValue(value, 'limit') ?? 200;

  if (limit > 500) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'limit 必须在 1-500 之间。');
  }

  return limit;
}

function readCreateWatchAccountBody(body: unknown): AdminWatchAccountValidationInput {
  if (!isRecord(body)) {
    throw new AdminApiError(400, 'INVALID_REQUEST', '请求体必须是 JSON 对象。');
  }

  if (
    body.sourceType !== undefined &&
    body.sourceType !== 'x' &&
    body.sourceType !== 'rss' &&
    body.sourceType !== 'github' &&
    body.sourceType !== 'hf_papers' &&
    body.sourceType !== 'anthropic_news' &&
    body.sourceType !== 'ai2_blog' &&
    body.sourceType !== 'moonshot_blog' &&
    body.sourceType !== 'meta_ai_blog' &&
    body.sourceType !== 'xai_news'
  ) {
    throw new AdminApiError(
      400,
      'INVALID_REQUEST',
      'sourceType 必须是 x、rss、github、hf_papers、anthropic_news、ai2_blog、moonshot_blog、meta_ai_blog 或 xai_news。',
    );
  }

  const sourceType = body.sourceType ?? 'x';

  if (
    sourceType === 'rss' ||
    sourceType === 'github' ||
    sourceType === 'hf_papers' ||
    sourceType === 'anthropic_news' ||
    sourceType === 'ai2_blog' ||
    sourceType === 'moonshot_blog' ||
    sourceType === 'meta_ai_blog' ||
    sourceType === 'xai_news'
  ) {
    return {
      sourceType,
      sourceUrl: readRssSourceUrl(body.sourceUrl),
    };
  }

  return {
    sourceType,
    xUsername: readUsername(body),
  };
}

function readRssSourceUrl(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'sourceUrl 必须是字符串。');
  }

  const sourceUrl = value.trim();

  if (sourceUrl.length === 0) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'sourceUrl 不能为空。');
  }

  if (sourceUrl.length > 2_048) {
    throw new AdminApiError(400, 'INVALID_REQUEST', 'sourceUrl 不能超过 2048 个字符。');
  }

  return sourceUrl;
}

function normalizeRssSourceUrl(sourceUrl: string): string {
  return new URL(sourceUrl.trim()).toString();
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
