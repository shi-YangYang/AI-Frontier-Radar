import { toStartupConfigLogContext } from '../shared/config';
import type { AppConfig } from '../shared/config/types';
import { createApp } from '../app/create-app';
import type { AppLogger } from '../lib/logger';
import { createRuntimeScheduler, createRuntimeSourceProvider } from '../modules/scheduler';
import { createRuntimeSettingsService, createStorageFromConfig } from '../modules/storage';

export interface StartServerOptions {
  config: AppConfig;
  logger: AppLogger;
}

export async function startServer(options: StartServerOptions): Promise<void> {
  const storage = createStorageFromConfig(options.config);
  const runtimeSettings = createRuntimeSettingsService({
    config: options.config,
    storage,
  });
  const scheduler = createRuntimeScheduler({
    config: options.config,
    logger: options.logger,
    runtimeSettings,
    storage,
  });
  const app = createApp({
    adminActions: {
      runDeliveryWorkerNow: (runOptions) => scheduler.runDeliveryWorkerNow(runOptions),
      runPollingNow: (runOptions) => scheduler.runPollingNow(runOptions),
      updatePollingSchedule: (intervalSeconds) => scheduler.updatePollingSchedule(intervalSeconds),
      validateWatchAccount: async (input) => {
        const effectiveConfig = await runtimeSettings.getEffectiveAppConfig();
        const sourceProvider = createRuntimeSourceProvider(effectiveConfig);

        return sourceProvider.validateAccount(input);
      },
    },
    config: options.config,
    logger: options.logger,
    runtimeSettings,
    storage,
  });
  let closing = false;
  let signalHandlersRegistered = false;

  const closeServer = async (signal: NodeJS.Signals): Promise<void> => {
    if (closing) {
      return;
    }

    closing = true;
    options.logger.info({ signal }, 'server shutdown requested');
    try {
      await app.close();
    } catch (error) {
      options.logger.error({ err: error, signal }, 'server shutdown failed');
      process.exitCode = 1;
    }
  };
  const handleSigint = (): void => {
    void closeServer('SIGINT');
  };
  const handleSigterm = (): void => {
    void closeServer('SIGTERM');
  };

  app.addHook('onClose', async () => {
    if (signalHandlersRegistered) {
      process.removeListener('SIGINT', handleSigint);
      process.removeListener('SIGTERM', handleSigterm);
      signalHandlersRegistered = false;
    }

    await scheduler.stop();
    await storage.close();
  });

  try {
    await storage.initialize();
    await app.listen({
      host: options.config.service.host,
      port: options.config.service.port,
    });
    options.logger.info(
      {
        config: toStartupConfigLogContext(options.config),
      },
      'server listening',
    );
    scheduler.start();

    process.once('SIGINT', handleSigint);
    process.once('SIGTERM', handleSigterm);
    signalHandlersRegistered = true;
  } catch (error) {
    options.logger.error({ err: error }, 'server failed to start');
    await app.close();
    throw error;
  }
}
