import type { PrismaClient } from '@prisma/client';

import type { AppConfig } from '../../shared/config/types';
import { DeliveryEventRepository } from './delivery-event-repository';
import { DeliveryTargetRepository } from './delivery-target-repository';
import { PollRunRepository } from './poll-run-repository';
import { createPrismaClient, ensureSqliteDirectory } from './prisma-client';
import { runPrismaMigrateDeploy } from './prisma-migrate';
import type { WatchAccountsSourceConfig } from '../../shared/config/types';
import type { DefaultDeliveryTargetInput } from './types';
import { WatchAccountRepository } from './watch-account-repository';
import { syncWatchAccountSeeds, type WatchAccountSeedSyncResult } from './watch-account-seed-sync';
import { XPostRepository } from './x-post-repository';

export interface StorageContext {
  close(): Promise<void>;
  deliveryEvents: DeliveryEventRepository;
  deliveryTargets: DeliveryTargetRepository;
  initialize(): Promise<void>;
  pollRuns: PollRunRepository;
  watchAccounts: WatchAccountRepository;
  xPosts: XPostRepository;
}

export interface CreateStorageOptions {
  databaseUrl: string;
  defaultDeliveryTarget?: DefaultDeliveryTargetInput;
  sqlitePath: string;
  watchAccountsSource?: WatchAccountsSourceConfig;
}

class PrismaStorageContext implements StorageContext {
  public readonly deliveryEvents: DeliveryEventRepository;
  public readonly deliveryTargets: DeliveryTargetRepository;
  public readonly pollRuns: PollRunRepository;
  public readonly watchAccounts: WatchAccountRepository;
  public readonly xPosts: XPostRepository;

  private readonly prisma: PrismaClient;
  private initializationPromise: Promise<void> | null = null;

  public constructor(private readonly options: CreateStorageOptions) {
    this.prisma = createPrismaClient(options.databaseUrl);
    this.watchAccounts = new WatchAccountRepository(this.prisma);
    this.xPosts = new XPostRepository(this.prisma);
    this.deliveryTargets = new DeliveryTargetRepository(this.prisma);
    this.deliveryEvents = new DeliveryEventRepository(this.prisma);
    this.pollRuns = new PollRunRepository(this.prisma);
  }

  public async close(): Promise<void> {
    await this.prisma.$disconnect();
  }

  public async initialize(): Promise<void> {
    if (this.initializationPromise !== null) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.initializeInternal();
    return this.initializationPromise;
  }

  private async initializeInternal(): Promise<void> {
    await ensureSqliteDirectory(this.options.sqlitePath);
    runPrismaMigrateDeploy({
      databaseUrl: this.options.databaseUrl,
    });
    await this.prisma.$connect();

    if (this.options.defaultDeliveryTarget !== undefined) {
      await this.deliveryTargets.ensureDefaultTarget(this.options.defaultDeliveryTarget);
    }

    if (this.options.watchAccountsSource !== undefined) {
      await this.syncWatchAccountSeeds();
    }
  }

  private async syncWatchAccountSeeds(): Promise<WatchAccountSeedSyncResult> {
    return syncWatchAccountSeeds(this.watchAccounts, this.options.watchAccountsSource!);
  }
}

export function createStorage(options: CreateStorageOptions): StorageContext {
  return new PrismaStorageContext(options);
}

export function createStorageFromConfig(
  config: Pick<AppConfig, 'delivery' | 'storage' | 'watchAccounts'>,
): StorageContext {
  return createStorage({
    databaseUrl: config.storage.prisma.databaseUrl,
    defaultDeliveryTarget: {
      targetKey: config.delivery.feishu.targetKey,
      webhookUrl: config.delivery.feishu.webhookUrl,
    },
    sqlitePath: config.storage.sqlite.path,
    watchAccountsSource: config.watchAccounts,
  });
}
