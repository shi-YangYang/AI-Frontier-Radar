export type WatchAccountPollStatus = 'failed' | 'pending' | 'success';

export type DeliveryChannelType = 'feishu_webhook';

export type DeliveryEventStatus = 'dead' | 'failed' | 'pending' | 'retry_wait' | 'sending' | 'sent';

export type PollRunStatus = 'failed' | 'partial_failed' | 'running' | 'success';

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

export interface CreateWatchAccountInput {
  id?: string;
  xUsername: string;
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
  authorUsername: string;
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

export interface XPostPageQuery {
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
  authorUsername: string;
  authorUserId?: string | null;
  postedAt: string;
  textContent: string;
  permalinkUrl: string;
  isReply?: boolean;
  isRepost?: boolean;
  rawPayloadJson: string;
  detectedAt?: string;
}

export interface DeliveryTarget {
  id: string;
  targetKey: string;
  channelType: DeliveryChannelType;
  displayName: string;
  webhookUrl: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeliveryTargetInput {
  id?: string;
  targetKey: string;
  channelType?: DeliveryChannelType;
  displayName: string;
  webhookUrl: string;
  enabled?: boolean;
}

export interface UpdateDeliveryTargetInput {
  channelType?: DeliveryChannelType;
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

export interface CreatePollRunInput {
  id?: string;
  startedAt?: string;
  finishedAt?: string | null;
  status?: PollRunStatus;
  accountsTotal?: number;
  accountsSucceeded?: number;
  accountsFailed?: number;
  newPostsDetected?: number;
  eventsCreated?: number;
  errorSummary?: string | null;
}

export interface UpdatePollRunInput {
  finishedAt?: string | null;
  status?: PollRunStatus;
  accountsTotal?: number;
  accountsSucceeded?: number;
  accountsFailed?: number;
  newPostsDetected?: number;
  eventsCreated?: number;
  errorSummary?: string | null;
}

export interface DefaultDeliveryTargetInput {
  targetKey: string;
  webhookUrl: string;
  displayName?: string;
}
