import type { AppLogger } from '../../lib/logger';
import type { AppConfig } from '../../shared/config/types';
import { runDeliveryWorkerJob, type DeliveryWorkerRunOnceResult } from '../delivery';
import {
  createBrowserXSourceProvider,
  createXSourceProvider,
  runPollingJob,
  type PollingRunResult,
  type SourceProvider,
} from '../polling';
import type { StorageContext } from '../storage';

type TimerHandle = ReturnType<typeof setInterval>;

export interface RuntimeSchedulerOptions {
  config: AppConfig;
  deliveryIntervalMs?: number;
  logger: AppLogger;
  pollingIntervalMs?: number;
  sourceProvider?: SourceProvider;
  storage: StorageContext;
}

export interface RuntimeScheduler {
  runDeliveryWorkerNow(options?: { recoverStartupState?: boolean; trigger?: string }): Promise<void>;
  runPollingNow(options?: { trigger?: string }): Promise<void>;
  start(): void;
  stop(): Promise<void>;
}

const DEFAULT_DELIVERY_INTERVAL_MS = 30_000;

export function createRuntimeScheduler(options: RuntimeSchedulerOptions): RuntimeScheduler {
  return new IntervalRuntimeScheduler(options);
}

export function createRuntimeSourceProvider(config: AppConfig): SourceProvider {
  if (config.source.mode === 'browser') {
    return createBrowserXSourceProvider({
      baseUrl: config.source.x.browser.baseUrl,
      headless: config.source.x.browser.headless,
      navigationTimeoutMs: config.source.x.browser.navigationTimeoutMs,
      postLoadTimeoutMs: config.source.x.browser.postLoadTimeoutMs,
      userDataDir: config.source.x.browser.userDataDir,
    });
  }

  if (config.source.x.apiBaseUrl === undefined || config.source.x.bearerToken === undefined) {
    throw new Error('API X source requires apiBaseUrl and bearerToken.');
  }

  return createXSourceProvider({
    apiBaseUrl: config.source.x.apiBaseUrl,
    bearerToken: config.source.x.bearerToken,
  });
}

class IntervalRuntimeScheduler implements RuntimeScheduler {
  private readonly deliveryIntervalMs: number;
  private readonly logger: AppLogger;
  private readonly pollingIntervalMs: number;
  private readonly sourceProvider: SourceProvider;
  private deliveryInterval: TimerHandle | null = null;
  private deliveryRunPromise: Promise<void> | null = null;
  private pollingInterval: TimerHandle | null = null;
  private pollingRunPromise: Promise<void> | null = null;
  private started = false;

  public constructor(private readonly options: RuntimeSchedulerOptions) {
    this.logger = options.logger.child({ module: 'runtime-scheduler' });
    this.pollingIntervalMs =
      options.pollingIntervalMs ?? options.config.polling.intervalSeconds * 1_000;
    this.deliveryIntervalMs = options.deliveryIntervalMs ?? DEFAULT_DELIVERY_INTERVAL_MS;
    this.sourceProvider = options.sourceProvider ?? createRuntimeSourceProvider(options.config);
  }

  public start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.logger.info(
      {
        deliveryIntervalMs: this.deliveryIntervalMs,
        pollingIntervalMs: this.pollingIntervalMs,
      },
      'runtime scheduler starting',
    );

    void this.runDeliveryWorkerNow({
      recoverStartupState: true,
      trigger: 'startup-recovery',
    });
    void this.runPollingNow({ trigger: 'startup' });

    this.pollingInterval = setInterval(() => {
      void this.runPollingNow({ trigger: 'interval' });
    }, this.pollingIntervalMs);
    this.deliveryInterval = setInterval(() => {
      void this.runDeliveryWorkerNow({
        recoverStartupState: false,
        trigger: 'interval',
      });
    }, this.deliveryIntervalMs);
  }

  public async stop(): Promise<void> {
    if (this.pollingInterval !== null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    if (this.deliveryInterval !== null) {
      clearInterval(this.deliveryInterval);
      this.deliveryInterval = null;
    }

    this.started = false;
    this.logger.info('runtime scheduler stopped');

    await Promise.allSettled([
      this.pollingRunPromise ?? Promise.resolve(),
      this.deliveryRunPromise ?? Promise.resolve(),
    ]);
  }

  public async runPollingNow(options: { trigger?: string } = {}): Promise<void> {
    if (this.pollingRunPromise !== null) {
      this.logger.warn(
        {
          job: 'polling',
          trigger: options.trigger ?? 'manual',
        },
        'scheduler skipped polling tick because previous run is still active',
      );
      return;
    }

    const runPromise = this.runPollingTick(options.trigger ?? 'manual').finally(() => {
      this.pollingRunPromise = null;
    });
    this.pollingRunPromise = runPromise;

    await runPromise;
  }

  public async runDeliveryWorkerNow(
    options: { recoverStartupState?: boolean; trigger?: string } = {},
  ): Promise<void> {
    if (this.deliveryRunPromise !== null) {
      this.logger.warn(
        {
          job: 'delivery-worker',
          trigger: options.trigger ?? 'manual',
        },
        'scheduler skipped delivery worker tick because previous run is still active',
      );
      return;
    }

    const runPromise = this.runDeliveryWorkerTick({
      recoverStartupState: options.recoverStartupState ?? false,
      trigger: options.trigger ?? 'manual',
    }).finally(() => {
      this.deliveryRunPromise = null;
    });
    this.deliveryRunPromise = runPromise;

    await runPromise;
  }

  private async runPollingTick(trigger: string): Promise<void> {
    this.logger.info(
      {
        job: 'polling',
        trigger,
      },
      'scheduler job started',
    );

    try {
      const result = await runPollingJob({
        config: this.options.config,
        logger: this.options.logger,
        sourceProvider: this.sourceProvider,
        storage: this.options.storage,
      });

      this.logPollingCompleted(result, trigger);
    } catch (error) {
      this.logger.error(
        {
          err: error,
          job: 'polling',
          trigger,
        },
        'scheduler job failed',
      );
    }
  }

  private async runDeliveryWorkerTick(input: {
    recoverStartupState: boolean;
    trigger: string;
  }): Promise<void> {
    this.logger.info(
      {
        job: 'delivery-worker',
        recoverStartupState: input.recoverStartupState,
        trigger: input.trigger,
      },
      'scheduler job started',
    );

    try {
      const result = await runDeliveryWorkerJob({
        logger: this.options.logger,
        recoverStartupState: input.recoverStartupState,
        storage: this.options.storage,
      });

      this.logDeliveryWorkerCompleted(result, input);
    } catch (error) {
      this.logger.error(
        {
          err: error,
          job: 'delivery-worker',
          recoverStartupState: input.recoverStartupState,
          trigger: input.trigger,
        },
        'scheduler job failed',
      );
    }
  }

  private logPollingCompleted(result: PollingRunResult, trigger: string): void {
    this.logger.info(
      {
        accountsFailed: result.accountsFailed,
        accountsSucceeded: result.accountsSucceeded,
        accountsTotal: result.accountsTotal,
        errorSummary: result.errorSummary,
        eventsCreated: result.eventsCreated,
        job: 'polling',
        newPostsDetected: result.newPostsDetected,
        pollRunId: result.pollRunId,
        status: result.status,
        trigger,
      },
      'scheduler job completed',
    );
    this.logger.info(
      {
        accountsFailed: result.accountsFailed,
        accountsSucceeded: result.accountsSucceeded,
        accountsTotal: result.accountsTotal,
        eventsCreated: result.eventsCreated,
        job: 'polling',
        newPostsDetected: result.newPostsDetected,
        pollRunId: result.pollRunId,
        status: result.status,
        trigger,
      },
      `抓取汇总 | 账号 ${result.accountsTotal} 个 | 成功 ${result.accountsSucceeded} 个 | 失败 ${result.accountsFailed} 个 | 新帖 ${result.newPostsDetected} 条 | 待发送 ${result.eventsCreated} 条`,
    );
  }

  private logDeliveryWorkerCompleted(
    result: DeliveryWorkerRunOnceResult,
    input: {
      recoverStartupState: boolean;
      trigger: string;
    },
  ): void {
    const statusCounts = result.processed.reduce<Record<string, number>>((counts, eventResult) => {
      counts[eventResult.status] = (counts[eventResult.status] ?? 0) + 1;
      return counts;
    }, {});
    const failedCount = result.processed.filter(
      (eventResult) => eventResult.status === 'dead' || eventResult.status === 'retry_wait',
    ).length;

    this.logger.info(
      {
        failedCount,
        job: 'delivery-worker',
        processedCount: result.processed.length,
        recoverStartupState: input.recoverStartupState,
        restoredSendingCount: result.restoredSendingCount,
        statusCounts,
        trigger: input.trigger,
      },
      'scheduler job completed',
    );
  }
}
