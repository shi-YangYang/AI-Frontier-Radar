import type { AppConfig } from '../../../shared/config/types';
import type { AppLogger } from '../../../lib/logger';
import type { StorageContext } from '../../storage';
import type { SourceProviderRegistry } from '../types';
import { PollingOrchestrator, type PollingRunResult } from '../orchestrator';

export interface RunPollingJobOptions {
  config: Pick<AppConfig, 'polling'>;
  logger?: AppLogger;
  sourceProviders: SourceProviderRegistry;
  storage: Pick<
    StorageContext,
    'deliveryEvents' | 'deliveryTargets' | 'pollRuns' | 'watchAccounts' | 'xPosts'
  >;
}

export async function runPollingJob(options: RunPollingJobOptions): Promise<PollingRunResult> {
  const orchestrator = new PollingOrchestrator({
    logger: options.logger,
    polling: options.config.polling,
    sourceProviders: options.sourceProviders,
    storage: options.storage,
  });

  return orchestrator.runOnce();
}
