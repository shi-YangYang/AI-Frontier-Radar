import type { AppConfig } from '../../../shared/config/types';
import type { AppLogger } from '../../../lib/logger';
import type { StorageContext } from '../../storage';
import type { SourceProvider } from '../types';
import { PollingOrchestrator, type PollingRunResult } from '../orchestrator';

export interface RunPollingJobOptions {
  config: Pick<AppConfig, 'polling'>;
  logger?: AppLogger;
  sourceProvider: SourceProvider;
  storage: Pick<
    StorageContext,
    'deliveryEvents' | 'deliveryTargets' | 'pollRuns' | 'watchAccounts' | 'xPosts'
  >;
}

export async function runPollingJob(options: RunPollingJobOptions): Promise<PollingRunResult> {
  const orchestrator = new PollingOrchestrator({
    logger: options.logger,
    polling: options.config.polling,
    sourceProvider: options.sourceProvider,
    storage: options.storage,
  });

  return orchestrator.runOnce();
}
