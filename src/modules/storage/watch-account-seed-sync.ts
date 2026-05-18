import type { WatchAccountsSourceConfig } from '../../shared/config/types';
import type { WatchAccountRepository } from './watch-account-repository';

export interface WatchAccountSeedSyncResult {
  disabledCount: number;
  skipped: boolean;
  source: WatchAccountsSourceConfig['type'];
  syncedCount: number;
}

export async function syncWatchAccountSeeds(
  watchAccounts: WatchAccountRepository,
  sourceConfig: WatchAccountsSourceConfig,
): Promise<WatchAccountSeedSyncResult> {
  if (sourceConfig.type === 'database') {
    return {
      disabledCount: 0,
      skipped: true,
      source: sourceConfig.type,
      syncedCount: 0,
    };
  }

  for (const seed of sourceConfig.items) {
    await watchAccounts.upsertSeedByUsername({
      enabled: seed.enabled,
      xUsername: seed.xUsername,
    });
  }

  return {
    disabledCount: 0,
    skipped: false,
    source: sourceConfig.type,
    syncedCount: sourceConfig.items.length,
  };
}
