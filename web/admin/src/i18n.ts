import { computed, ref } from 'vue';

export type AdminLanguage = 'zh-CN' | 'en-US';

const DEFAULT_LANGUAGE: AdminLanguage = 'zh-CN';
const LANGUAGE_STORAGE_KEY = 'admin.language';

const messages = {
  'zh-CN': {
    'accounts.add': '添加',
    'accounts.deleteBody': '删除后该账号不再参与后续轮询，历史记录不会被删除。',
    'accounts.deleteTitle': '删除监听账号',
    'accounts.disabled': '已禁用',
    'accounts.empty': '暂无监听账号。',
    'accounts.placeholder': 'openai 或 @openai',
    'accounts.title': '监听账号',
    'accounts.subtitle': '维护本地 SQLite 中的公开 X 账号监听列表。',
    'actions.cancel': '取消',
    'actions.clearQuery': '清空',
    'actions.close': '关闭',
    'actions.confirmDelete': '确认删除',
    'actions.delete': '删除',
    'actions.deliveryNow': '立即发送',
    'actions.nextPage': '下一页',
    'actions.pollNow': '立即轮询',
    'actions.previousPage': '上一页',
    'actions.query': '查询',
    'actions.refresh': '刷新',
    'actions.viewError': '查看错误',
    'delivery.deleteBody': '确认删除此发送记录。',
    'delivery.deletePendingBody': '确认删除此发送记录。删除后不会继续发送或重试。',
    'delivery.deleteTitle': '删除发送记录',
    'delivery.empty': '暂无发送记录。',
    'delivery.title': '最近发送',
    'delivery.subtitle': '查询和维护最近的飞书投递事件。',
    'empty.noData': '暂无数据',
    'form.fromTime': '开始时间',
    'form.pagePlaceholder': '页码',
    'form.toTime': '结束时间',
    'jobs.background': '后台任务',
    'jobs.delivery-worker': '发送任务',
    'jobs.polling': '轮询任务',
    'language.switchTo': 'English',
    'modal.accountColumn': '账号',
    'modal.errorColumn': '报错',
    'modal.errorTitle': '错误详情',
    'nav.accounts': '监听账号',
    'nav.deliveryEvents': '最近发送',
    'nav.overview': '总览',
    'nav.pollRuns': '最近轮询',
    'notice.accountCreated': '已保存监听账号。',
    'notice.accountDeleted': '已删除监听账号。',
    'notice.actionResult': '{job}：{status}',
    'notice.deliveryEventDeleted': '已删除发送记录。',
    'notice.invalidPage': '页码必须是数字。',
    'notice.invalidTimeRange': '开始时间不能晚于结束时间。',
    'notice.pollRunDeleted': '已删除轮询记录。',
    'notice.refreshed': '已刷新 {time}',
    'overview.deliveryReady': '飞书 Webhook',
    'overview.entryAccounts': '管理账号',
    'overview.entryDelivery': '查看发送',
    'overview.entryPollRuns': '查看轮询',
    'overview.latestPollRun': '最近一次轮询',
    'overview.service': '服务',
    'overview.sourceMode': 'X 数据源',
    'overview.subtitle': '查看运行摘要，并执行本地手动轮询或发送。',
    'overview.title': '总览',
    'overview.watchSource': '账号来源',
    'pagination.jump': '跳转',
    'pagination.summary': '第 {page} / {totalPages} 页，共 {total} 条，每页 {pageSize} 条',
    'poll.deleteBody': '删除后此轮询记录将从历史列表移除。',
    'poll.deleteTitle': '删除轮询记录',
    'poll.empty': '暂无轮询记录。',
    'poll.progress': '{succeeded}/{total} 成功，{failed} 失败',
    'poll.title': '最近轮询',
    'poll.subtitle': '按时间范围查看轮询历史、删除记录并查看账号错误。',
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
    'accounts.add': 'Add',
    'accounts.deleteBody': 'This account will no longer be polled. Historical records are kept.',
    'accounts.deleteTitle': 'Delete watch account',
    'accounts.disabled': 'Disabled',
    'accounts.empty': 'No watch accounts.',
    'accounts.placeholder': 'openai or @openai',
    'accounts.title': 'Watch accounts',
    'accounts.subtitle': 'Maintain the local SQLite list of public X accounts to watch.',
    'actions.cancel': 'Cancel',
    'actions.clearQuery': 'Clear',
    'actions.close': 'Close',
    'actions.confirmDelete': 'Delete',
    'actions.delete': 'Delete',
    'actions.deliveryNow': 'Send now',
    'actions.nextPage': 'Next',
    'actions.pollNow': 'Poll now',
    'actions.previousPage': 'Previous',
    'actions.query': 'Query',
    'actions.refresh': 'Refresh',
    'actions.viewError': 'View error',
    'delivery.deleteBody': 'Delete this delivery event.',
    'delivery.deletePendingBody': 'Delete this delivery event. It will not be sent or retried afterward.',
    'delivery.deleteTitle': 'Delete delivery event',
    'delivery.empty': 'No delivery events.',
    'delivery.title': 'Delivery events',
    'delivery.subtitle': 'Query and maintain recent Feishu delivery events.',
    'empty.noData': 'No data',
    'form.fromTime': 'From',
    'form.pagePlaceholder': 'Page',
    'form.toTime': 'To',
    'jobs.background': 'Background job',
    'jobs.delivery-worker': 'Delivery worker',
    'jobs.polling': 'Polling job',
    'language.switchTo': '中文',
    'modal.accountColumn': 'Account',
    'modal.errorColumn': 'Error',
    'modal.errorTitle': 'Error details',
    'nav.accounts': 'Accounts',
    'nav.deliveryEvents': 'Delivery',
    'nav.overview': 'Overview',
    'nav.pollRuns': 'Poll runs',
    'notice.accountCreated': 'Watch account saved.',
    'notice.accountDeleted': 'Watch account deleted.',
    'notice.actionResult': '{job}: {status}',
    'notice.deliveryEventDeleted': 'Delivery event deleted.',
    'notice.invalidPage': 'Page must be a number.',
    'notice.invalidTimeRange': 'Start time cannot be later than end time.',
    'notice.pollRunDeleted': 'Poll run deleted.',
    'notice.refreshed': 'Refreshed {time}',
    'overview.deliveryReady': 'Feishu webhook',
    'overview.entryAccounts': 'Manage accounts',
    'overview.entryDelivery': 'View delivery',
    'overview.entryPollRuns': 'View poll runs',
    'overview.latestPollRun': 'Latest poll run',
    'overview.service': 'Service',
    'overview.sourceMode': 'X source',
    'overview.subtitle': 'Review runtime status and run local manual polling or delivery.',
    'overview.title': 'Overview',
    'overview.watchSource': 'Watch source',
    'pagination.jump': 'Go',
    'pagination.summary': 'Page {page} / {totalPages}, {total} records, {pageSize} per page',
    'poll.deleteBody': 'This poll run will be removed from the history list.',
    'poll.deleteTitle': 'Delete poll run',
    'poll.empty': 'No poll runs.',
    'poll.progress': '{succeeded}/{total} succeeded, {failed} failed',
    'poll.title': 'Poll runs',
    'poll.subtitle': 'Query poll history by time range, delete records, and inspect account errors.',
    'status.completed': 'Completed',
    'status.dead': 'Dead',
    'status.failed': 'Failed',
    'status.partial_failed': 'Partial failure',
    'status.pending': 'Pending',
    'status.retry_wait': 'Retry wait',
    'status.running': 'Running',
    'status.sending': 'Sending',
    'status.sent': 'Sent',
    'status.skipped': 'Skipped',
    'status.success': 'Success',
    'summary.enabledAccounts': 'Enabled accounts',
    'summary.pendingDelivery': 'Pending',
    'summary.retryWait': 'Retry wait',
    'summary.sentDelivery': 'Sent',
    'summary.totalAccounts': 'Total accounts',
    'table.account': 'Account',
    'table.actions': 'Actions',
    'table.attemptCount': 'Attempts',
    'table.baselinePost': 'Baseline post',
    'table.createdAt': 'Created at',
    'table.finishedAt': 'Finished at',
    'table.lastError': 'Last error',
    'table.lastPollStatus': 'Last poll status',
    'table.lastPolledAt': 'Last polled at',
    'table.latestPost': 'Latest post',
    'table.nextRetryAt': 'Next retry',
    'table.newPosts': 'New posts',
    'table.pendingEvents': 'Pending events',
    'table.pollProgress': 'Account progress',
    'table.postId': 'Post ID',
    'table.sentAt': 'Sent at',
    'table.startedAt': 'Started at',
    'table.status': 'Status',
    'table.target': 'Target',
  },
} as const;

type MessageKey = keyof typeof messages['zh-CN'];

const language = ref<AdminLanguage>(readInitialLanguage());

export function useI18n() {
  const htmlLanguage = computed(() => language.value);

  return {
    htmlLanguage,
    language,
    t,
    toggleLanguage,
  };
}

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const template = messages[language.value][key] ?? messages[DEFAULT_LANGUAGE][key] ?? key;
  let result: string = template;

  for (const [paramKey, value] of Object.entries(params)) {
    result = result.replaceAll('{' + paramKey + '}', String(value));
  }

  return result;
}

function toggleLanguage(): void {
  language.value = language.value === 'zh-CN' ? 'en-US' : 'zh-CN';

  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language.value);
  } catch {
    // localStorage can be unavailable in hardened browsers.
  }
}

function readInitialLanguage(): AdminLanguage {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);

    if (stored === 'zh-CN' || stored === 'en-US') {
      return stored;
    }
  } catch {
    // Fall back to Chinese when localStorage is unavailable.
  }

  return DEFAULT_LANGUAGE;
}
