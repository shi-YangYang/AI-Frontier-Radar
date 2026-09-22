import type { AppConfig } from '../../../shared/config/types';
import type { AppLogger } from '../../../lib/logger';
import type { StorageContext } from '../../storage';
import { createSubscriptionRuleService } from '../../storage/subscription-rule-service';
import type { SourceProviderRegistry } from '../types';
import { createSubscriptionRuleMatcher } from '../services';
import { PollingOrchestrator, type PollingRunResult } from '../orchestrator';

export interface RunPollingJobOptions {
  config: Pick<AppConfig, 'polling'>;
  logger?: AppLogger;
  sourceProviders: SourceProviderRegistry;
  storage: Pick<
    StorageContext,
    'appSettings' | 'deliveryEvents' | 'deliveryTargets' | 'pollRuns' | 'sourcePacks' | 'watchAccounts' | 'xPosts'
  >;
}

export async function runPollingJob(options: RunPollingJobOptions): Promise<PollingRunResult> {
  const subscriptionRules = await createSubscriptionRuleService({
    appSettings: options.storage.appSettings,
  }).getRules();
  const orchestrator = new PollingOrchestrator({
    logger: options.logger,
    polling: options.config.polling,
    sourceProviders: options.sourceProviders,
    storage: options.storage,
    subscriptionRuleMatcher: createSubscriptionRuleMatcher(subscriptionRules),
  });

  return orchestrator.runOnce();
}
