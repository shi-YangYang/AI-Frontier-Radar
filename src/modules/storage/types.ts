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

export type DeliveryChannelType =
  | 'bark'
  | 'dingtalk_webhook'
  | 'feishu_webhook'
  | 'generic_webhook'
  | 'wechat_clawbot'
  | 'wecom_webhook';

export type DeliveryEventStatus = 'dead' | 'failed' | 'pending' | 'retry_wait' | 'sending' | 'sent';

export type PollRunStatus = 'failed' | 'partial_failed' | 'running' | 'success';

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

export interface CreateWatchAccountInput {
  id?: string;
  sourceType?: WatchAccountSourceType;
  sourceUrl?: string | null;
  xUsername?: string | null;
  xUserId?: string | null;
  displayName?: string | null;
  enabled?: boolean;
  baselinePostId?: string | null;
  lastSeenPostId?: string | null;
  lastPolledAt?: string | null;
  lastPollStatus?: WatchAccountPollStatus | null;
  lastPollError?: string | null;
}

export interface UpdateWatchAccountInput {
  displayName?: string | null;
  enabled?: boolean;
  xUserId?: string | null;
  baselinePostId?: string | null;
  lastSeenPostId?: string | null;
  lastPolledAt?: string | null;
  lastPollStatus?: WatchAccountPollStatus | null;
  lastPollError?: string | null;
}

export interface XPostRaw {
  id: string;
  xPostId: string;
  dedupeKey: string | null;
  authorUsername: string;
  title: string | null;
  authorUserId: string | null;
  postedAt: string;
  textContent: string;
  permalinkUrl: string;
  isReply: boolean;
  isRepost: boolean;
  rawPayloadJson: string;
  detectedAt: string;
  createdAt: string;
}

export interface XPostRawWithDeliveryEvents extends XPostRaw {
  deliveryEvents: DeliveryEvent[];
}

export interface XPostAuthorUserIdMatch {
  /** 命中筛选的源账号 authorUserId 集合 */
  in: string[];
  /** 全部源账号 authorUserId 集合（用于识别无源账号的帖子） */
  known: string[];
  /** 将无源账号的帖子并入结果（来源缺失兜底） */
  orUnmapped: boolean;
}

export interface XPostPageQuery {
  authorUserIdMatch?: XPostAuthorUserIdMatch;
  authorUsername?: string;
  detectedFrom?: string;
  detectedTo?: string;
  isReply?: boolean;
  isRepost?: boolean;
  page: number;
  pageSize: number;
  postedFrom?: string;
  postedTo?: string;
  query?: string;
}

export interface XPostSummary {
  latestDetectedAt: string | null;
  todayPosts: number;
  totalPosts: number;
}

export interface CreateXPostRawInput {
  id?: string;
  xPostId: string;
  dedupeKey?: string;
  authorUsername: string;
  authorUserId?: string | null;
  postedAt: string;
  textContent: string;
  permalinkUrl: string;
  title?: string;
  isReply?: boolean;
  isRepost?: boolean;
  rawPayloadJson: string;
  detectedAt?: string;
}

export interface DeliveryTargetQuietHours {
  enabled: boolean;
  endHour: number;
  startHour: number;
}

export interface DeliveryTargetConfig {
  accountId?: string;
  packIds?: string[];
  quietHours?: DeliveryTargetQuietHours;
  secret?: string;
  sourceIds?: string[];
  target?: string;
}

export interface SourcePack {
  createdAt: string;
  description: string | null;
  enabled: boolean;
  id: string;
  name: string;
  sortOrder: number;
  updatedAt: string;
}

export interface SourcePackWithMembers extends SourcePack {
  memberSourceIds: string[];
}

export interface CreateSourcePackInput {
  description?: string | null;
  enabled?: boolean;
  name: string;
  sortOrder?: number;
  sourceIds?: string[];
}

export interface UpdateSourcePackInput {
  description?: string | null;
  enabled?: boolean;
  name?: string;
  sortOrder?: number;
  sourceIds?: string[];
}

export interface DeliveryTarget {
  config: DeliveryTargetConfig;
  id: string;
  ownerUserId: string | null;
  targetKey: string;
  channelType: DeliveryChannelType;
  displayName: string;
  webhookUrl: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeliveryTargetInput {
  config?: DeliveryTargetConfig;
  id?: string;
  ownerUserId?: string | null;
  targetKey: string;
  channelType?: DeliveryChannelType;
  displayName: string;
  webhookUrl: string;
  enabled?: boolean;
}

export interface UpdateDeliveryTargetInput {
  channelType?: DeliveryChannelType;
  config?: DeliveryTargetConfig;
  ownerUserId?: string | null;
  displayName?: string;
  webhookUrl?: string;
  enabled?: boolean;
}

export interface AppSetting {
  id: string;
  settingKey: string;
  valueJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAppSettingInput {
  id?: string;
  settingKey: string;
  valueJson: string;
}

export interface UpdateAppSettingInput {
  valueJson?: string;
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

export interface CreateDeliveryEventInput {
  id?: string;
  xPostId: string;
  targetKey: string;
  status?: DeliveryEventStatus;
  attemptCount?: number;
  nextRetryAt?: string | null;
  lastError?: string | null;
  lockedAt?: string | null;
  sentAt?: string | null;
}

export interface UpdateDeliveryEventInput {
  status?: DeliveryEventStatus;
  attemptCount?: number;
  nextRetryAt?: string | null;
  lastError?: string | null;
  lockedAt?: string | null;
  sentAt?: string | null;
}

export interface PollRun {
  createdAt: string;
  errorSummary: string | null;
  eventsCreated: number;
  finishedAt: string | null;
  id: string;
  newPostsDetected: number;
  accountsFailed: number;
  accountsSucceeded: number;
  accountsTotal: number;
  repeatCount: number;
  startedAt: string;
  status: PollRunStatus;
}

export interface CreatePollRunInput {
  accountsFailed?: number;
  accountsSucceeded?: number;
  accountsTotal?: number;
  errorSummary?: string | null;
  eventsCreated?: number;
  finishedAt?: string | null;
  id?: string;
  newPostsDetected?: number;
  repeatCount?: number;
  startedAt?: string;
  status?: PollRunStatus;
}

export interface UpdatePollRunInput {
  accountsFailed?: number;
  accountsSucceeded?: number;
  accountsTotal?: number;
  errorSummary?: string | null;
  eventsCreated?: number;
  finishedAt?: string | null;
  newPostsDetected?: number;
  repeatCount?: number;
  status?: PollRunStatus;
}

export interface DefaultDeliveryTargetInput {
  targetKey: string;
  webhookUrl: string;
  displayName?: string;
}

export type UserRole = 'admin' | 'user';

export interface User {
  createdAt: string;
  id: string;
  /** 显示昵称（钉钉登录用户为钉钉昵称；本地创建用户为空） */
  nickname: string | null;
  role: UserRole;
  updatedAt: string;
  username: string;
}

export interface UserWithPassword extends User {
  passwordHash: string;
}

export interface CreateUserInput {
  dingtalkUnionId?: string;
  id?: string;
  nickname?: string | null;
  passwordHash: string;
  role: UserRole;
  username: string;
}

export interface UserSession {
  createdAt: string;
  expiresAt: string;
  id: string;
  userId: string;
}
