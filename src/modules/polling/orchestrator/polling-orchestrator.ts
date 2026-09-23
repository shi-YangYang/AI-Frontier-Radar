import type { AppLogger } from '../../../lib/logger';
import { createTimestamp } from '../../storage/database';
import type { StorageContext, WatchAccount } from '../../storage';
import type { SourceProviderRegistry } from '../types';
import { PollingAccountService, resolveEffectiveSourceSets, type EffectiveSourceSet, type SubscriptionRuleMatcher } from '../services';

export const ACCOUNT_DEADLINE_MS = 60_000;

export interface PollingOrchestratorOptions {
  accountDeadlineMs?: number;
  logger?: AppLogger;
  polling: {
    excludeReplies?: boolean;
    excludeReposts?: boolean;
    fetchLimitPerAccount: number;
  };
  sourceProviders: SourceProviderRegistry;
  storage: Pick<
    StorageContext,
    'deliveryEvents' | 'deliveryTargets' | 'pollRuns' | 'sourcePacks' | 'watchAccounts' | 'xPosts'
  >;
  subscriptionRuleMatcher?: SubscriptionRuleMatcher;
}

export interface PollingAccountRunResult {
  error: string | null;
  eventsCreated: number;
  newPostsDetected: number;
  sourceLabel: string;
  status: 'failed' | 'success';
  watchAccountId: string;
}

export interface PollingRunResult {
  accountsFailed: number;
  accountsSucceeded: number;
  accountsTotal: number;
  errorSummary: string | null;
  eventsCreated: number;
  newPostsDetected: number;
  pollRunId: string;
  status: 'failed' | 'partial_failed' | 'success';
  watchAccounts: PollingAccountRunResult[];
}

export class PollingOrchestrator {
  private readonly accountDeadlineMs: number;
  private readonly accountService: PollingAccountService;
  private readonly logger: AppLogger | undefined;

  public constructor(private readonly options: PollingOrchestratorOptions) {
    this.accountDeadlineMs = options.accountDeadlineMs ?? ACCOUNT_DEADLINE_MS;
    this.accountService = new PollingAccountService({
      deliveryEvents: options.storage.deliveryEvents,
      excludeReplies: options.polling.excludeReplies,
      excludeReposts: options.polling.excludeReposts,
      fetchLimitPerAccount: options.polling.fetchLimitPerAccount,
      sourceProviders: options.sourceProviders,
      subscriptionRuleMatcher: options.subscriptionRuleMatcher,
      xPosts: options.storage.xPosts,
    });
    this.logger = options.logger?.child({ module: 'polling-orchestrator' });
  }

  public async runOnce(): Promise<PollingRunResult> {
    const previousRun = await this.options.storage.pollRuns.findLatest();
    const pollRun = await this.options.storage.pollRuns.create({
      startedAt: createTimestamp(),
      status: 'running',
    });
    const accountResults: PollingAccountRunResult[] = [];
    let accountsTotal = 0;
    let accountsSucceeded = 0;
    let accountsFailed = 0;
    let eventsCreated = 0;
    let newPostsDetected = 0;
    let errorSummary: string | null = null;

    try {
      const watchAccounts = await this.options.storage.watchAccounts.listEnabled();
      const deliveryTargets = await this.options.storage.deliveryTargets.listEnabled();
      // 每个 target 的生效源集在整个轮询周期只解析一次，避免逐条消息查库。
      const effectiveSourceSets = await resolveEffectiveSourceSets(
        this.options.storage.sourcePacks,
        deliveryTargets,
      );

      accountsTotal = watchAccounts.length;

      for (const watchAccount of watchAccounts) {
        const accountResult = await this.processAccountWithDeadline(
          watchAccount,
          deliveryTargets,
          effectiveSourceSets,
        );
        accountResults.push(accountResult);

        if (accountResult.status === 'success') {
          accountsSucceeded += 1;
          eventsCreated += accountResult.eventsCreated;
          newPostsDetected += accountResult.newPostsDetected;
        } else {
          accountsFailed += 1;
        }
      }

      errorSummary = summarizeErrors(accountResults);
      const status = resolvePollRunStatus(accountsSucceeded, accountsFailed);

      await this.options.storage.pollRuns.update(pollRun.id, {
        accountsFailed,
        accountsSucceeded,
        accountsTotal,
        errorSummary,
        eventsCreated,
        finishedAt: createTimestamp(),
        newPostsDetected,
        status,
      });

      if (status === 'success' && newPostsDetected === 0) {
        await this.options.storage.pollRuns.delete(pollRun.id);
        this.logger?.debug?.(
          {
            pollRunId: pollRun.id,
          },
          '空轮询未记录（无新帖）',
        );
      } else if (status !== 'success') {
        if (
          previousRun !== null &&
          previousRun.status === status &&
          (previousRun.errorSummary ?? '') === (errorSummary ?? '') &&
          previousRun.errorSummary !== null
        ) {
          await this.options.storage.pollRuns.update(previousRun.id, {
            finishedAt: createTimestamp(),
            repeatCount: previousRun.repeatCount + 1,
          });
          await this.options.storage.pollRuns.delete(pollRun.id);
          this.logger?.debug?.(
            {
              mergedIntoPollRunId: previousRun.id,
              pollRunId: pollRun.id,
              repeatCount: previousRun.repeatCount + 1,
            },
            '连续相同失败已合并到上一条记录',
          );
        }
      }

      return {
        accountsFailed,
        accountsSucceeded,
        accountsTotal,
        errorSummary,
        eventsCreated,
        newPostsDetected,
        pollRunId: pollRun.id,
        status,
        watchAccounts: accountResults,
      };
    } catch (error) {
      errorSummary = toErrorMessage(error);

      await this.options.storage.pollRuns.update(pollRun.id, {
        accountsFailed,
        accountsSucceeded,
        accountsTotal,
        errorSummary,
        eventsCreated,
        finishedAt: createTimestamp(),
        newPostsDetected,
        status: 'failed',
      });

      this.logger?.error(
        {
          err: error,
          pollRunId: pollRun.id,
        },
        '轮询在完成前失败。',
      );

      throw error;
    }
  }

  private async processAccountWithDeadline(
    watchAccount: WatchAccount,
    deliveryTargets: Awaited<ReturnType<StorageContext['deliveryTargets']['listEnabled']>>,
    effectiveSourceSets: Map<string, EffectiveSourceSet>,
  ): Promise<PollingAccountRunResult> {
    let deadlineTimer: NodeJS.Timeout | undefined;
    const deadline = new Promise<PollingAccountRunResult>((resolve) => {
      deadlineTimer = setTimeout(() => {
        resolve(this.createDeadlineFailure(watchAccount));
      }, this.accountDeadlineMs);
    });

    try {
      return await Promise.race([
        this.processAccount(watchAccount, deliveryTargets, effectiveSourceSets),
        deadline,
      ]);
    } finally {
      clearTimeout(deadlineTimer);
    }
  }

  private createDeadlineFailure(watchAccount: WatchAccount): PollingAccountRunResult {
    const sourceLabel = toWatchAccountLabel(watchAccount);
    const timeoutSeconds = this.accountDeadlineMs / 1000;

    this.logger?.warn(
      {
        deadlineMs: this.accountDeadlineMs,
        sourceLabel,
        watchAccountId: watchAccount.id,
      },
      '轮询账号超过单账号截止时间，本轮按失败跳过（底层流程不取消，结果丢弃）。',
    );

    return {
      error: `轮询超时（${timeoutSeconds} 秒），本轮已跳过`,
      eventsCreated: 0,
      newPostsDetected: 0,
      sourceLabel,
      status: 'failed',
      watchAccountId: watchAccount.id,
    };
  }

  private async processAccount(
    watchAccount: WatchAccount,
    deliveryTargets: Awaited<ReturnType<StorageContext['deliveryTargets']['listEnabled']>>,
    effectiveSourceSets: Map<string, EffectiveSourceSet>,
  ): Promise<PollingAccountRunResult> {
    const sourceLabel = toWatchAccountLabel(watchAccount);

    try {
      const result = await this.accountService.pollAccount(
        watchAccount,
        deliveryTargets,
        effectiveSourceSets,
      );
      const updatedAccount = await this.options.storage.watchAccounts.update(watchAccount.id, {
        baselinePostId: result.baselinePostId,
        displayName: result.resolvedDisplayName,
        lastPollError: null,
        lastPolledAt: createTimestamp(),
        lastPollStatus: 'success',
        lastSeenPostId: result.lastSeenPostId,
        xUserId: result.resolvedSourceId,
      });

      if (updatedAccount === null) {
        throw new Error(`Watch account "${sourceLabel}" was not found during update.`);
      }

      return {
        error: null,
        eventsCreated: result.eventsCreated,
        newPostsDetected: result.newPostsDetected,
        sourceLabel,
        status: 'success',
        watchAccountId: watchAccount.id,
      };
    } catch (error) {
      const errorMessage = toErrorMessage(error);

      await this.options.storage.watchAccounts.update(watchAccount.id, {
        lastPollError: errorMessage,
        lastPolledAt: createTimestamp(),
        lastPollStatus: 'failed',
      });

      this.logger?.warn(
        {
          err: error,
          sourceLabel,
          watchAccountId: watchAccount.id,
        },
        '轮询账号失败。',
      );

      return {
        error: errorMessage,
        eventsCreated: 0,
        newPostsDetected: 0,
        sourceLabel,
        status: 'failed',
        watchAccountId: watchAccount.id,
      };
    }
  }
}

function resolvePollRunStatus(
  accountsSucceeded: number,
  accountsFailed: number,
): PollingRunResult['status'] {
  if (accountsFailed === 0) {
    return 'success';
  }

  if (accountsSucceeded === 0) {
    return 'failed';
  }

  return 'partial_failed';
}

function summarizeErrors(accountResults: PollingAccountRunResult[]): string | null {
  const failedResults = accountResults.filter(
    (accountResult) => accountResult.status === 'failed' && accountResult.error !== null,
  );

  if (failedResults.length === 0) {
    return null;
  }

  return failedResults
    .map((accountResult) => `${accountResult.sourceLabel}: ${accountResult.error}`)
    .join(' | ');
}

function toWatchAccountLabel(watchAccount: WatchAccount): string {
  if (watchAccount.xUsername !== null) {
    return `@${watchAccount.xUsername}`;
  }

  return watchAccount.sourceUrl ?? watchAccount.id;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
