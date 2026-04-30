import type { AppConfig, AppConfigSummary } from '../../../shared/config/types';
import type { StorageContext } from '../../storage';

export async function getConfigSummary(config: AppConfig, storage: StorageContext): Promise<{ ok: true; data: AppConfigSummary }> {
  const [watchAccounts, deliveryTargets] = await Promise.all([
    storage.watchAccounts.listAll(),
    storage.deliveryTargets.listEnabled(),
  ]);

  return {
    ok: true,
    data: {
      deliveryTargetsCount: deliveryTargets.length,
      excludeReplies: config.polling.excludeReplies,
      excludeReposts: config.polling.excludeReposts,
      fetchLimitPerAccount: config.polling.fetchLimitPerAccount,
      pollIntervalSeconds: config.polling.intervalSeconds,
      watchAccountsCount: watchAccounts.length,
      watchAccountsSource: config.watchAccounts.type,
    },
  };
}
