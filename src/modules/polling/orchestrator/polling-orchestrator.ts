import type { AppLogger } from '../../../lib/logger';
import { createTimestamp } from '../../storage/database';
import type { StorageContext, WatchAccount } from '../../storage';
import type { SourceProvider } from '../types';
import { PollingAccountService } from '../services';

export interface PollingOrchestratorOptions {
  logger?: AppLogger;
  polling: {
    excludeReplies?: boolean;
    excludeReposts?: boolean;
    fetchLimitPerAccount: number;
  };
  sourceProvider: SourceProvider;
  storage: Pick<
    StorageContext,
    'deliveryEvents' | 'deliveryTargets' | 'pollRuns' | 'watchAccounts' | 'xPosts'
  >;
}

export interface PollingAccountRunResult {
  error: string | null;
  eventsCreated: number;
  newPostsDetected: number;
  status: 'failed' | 'success';
  watchAccountId: string;
  xUsername: string;
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
  private readonly accountService: PollingAccountService;
  private readonly logger: AppLogger | undefined;

  public constructor(private readonly options: PollingOrchestratorOptions) {
    this.accountService = new PollingAccountService({
      deliveryEvents: options.storage.deliveryEvents,
      excludeReplies: options.polling.excludeReplies,
      excludeReposts: options.polling.excludeReposts,
      fetchLimitPerAccount: options.polling.fetchLimitPerAccount,
      sourceProvider: options.sourceProvider,
      xPosts: options.storage.xPosts,
    });
    this.logger = options.logger?.child({ module: 'polling-orchestrator' });
  }

  public async runOnce(): Promise<PollingRunResult> {
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

      accountsTotal = watchAccounts.length;

      for (const watchAccount of watchAccounts) {
        const accountResult = await this.processAccount(watchAccount, deliveryTargets);
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

      this.logger?.info(
        {
          accountsFailed,
          accountsSucceeded,
          accountsTotal,
          eventsCreated,
          newPostsDetected,
          pollRunId: pollRun.id,
          status,
        },
        'Polling run finished.',
      );

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
        'Polling run failed before completion.',
      );

      throw error;
    }
  }

  private async processAccount(
    watchAccount: WatchAccount,
    deliveryTargets: Awaited<ReturnType<StorageContext['deliveryTargets']['listEnabled']>>,
  ): Promise<PollingAccountRunResult> {
    try {
      const result = await this.accountService.pollAccount(watchAccount, deliveryTargets);
      const updatedAccount = await this.options.storage.watchAccounts.update(watchAccount.id, {
        baselinePostId: result.baselinePostId,
        displayName: result.resolvedDisplayName,
        lastPollError: null,
        lastPolledAt: createTimestamp(),
        lastPollStatus: 'success',
        lastSeenPostId: result.lastSeenPostId,
        xUserId: result.resolvedXUserId,
      });

      if (updatedAccount === null) {
        throw new Error(`Watch account "${watchAccount.xUsername}" was not found during update.`);
      }

      return {
        error: null,
        eventsCreated: result.eventsCreated,
        newPostsDetected: result.newPostsDetected,
        status: 'success',
        watchAccountId: watchAccount.id,
        xUsername: watchAccount.xUsername,
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
          watchAccountId: watchAccount.id,
          xUsername: watchAccount.xUsername,
        },
        'Polling account failed.',
      );

      return {
        error: errorMessage,
        eventsCreated: 0,
        newPostsDetected: 0,
        status: 'failed',
        watchAccountId: watchAccount.id,
        xUsername: watchAccount.xUsername,
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
    .map((accountResult) => `${accountResult.xUsername}: ${accountResult.error}`)
    .join(' | ');
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
