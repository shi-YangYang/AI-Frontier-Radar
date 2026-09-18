import { toStartupConfigLogContext } from '../shared/config';
import type { AppConfig } from '../shared/config/types';
import { createApp } from '../app/create-app';
import type { AppLogger } from '../lib/logger';
import { createRetentionService } from '../modules/maintenance';
import { createWechatBridgeService } from '../modules/wechat';
import { createRuntimeScheduler, createRuntimeSourceProviders } from '../modules/scheduler';
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
  const retention = createRetentionService({
    logger: options.logger,
    storage,
  });
  const wechatBridge = createWechatBridgeService({ logger: options.logger });
  wechatBridge.start();
  const scheduler = createRuntimeScheduler({
    config: options.config,
    logger: options.logger,
    retention,
    runtimeSettings,
    storage,
  });
  const app = createApp({
    wechatBridge,
    adminActions: {
      runDeliveryWorkerNow: (runOptions) => scheduler.runDeliveryWorkerNow(runOptions),
      runPollingNow: (runOptions) => scheduler.runPollingNow(runOptions),
      updatePollingSchedule: (intervalSeconds) => scheduler.updatePollingSchedule(intervalSeconds),
      validateWatchAccount: async (input) => {
        const effectiveConfig = await runtimeSettings.getEffectiveAppConfig();
        const sourceProviders = createRuntimeSourceProviders(effectiveConfig);

        if (input.sourceType === 'rss') {
          return sourceProviders.rss.validateSource({
            source: {
              sourceType: 'rss',
              sourceUrl: input.sourceUrl,
            },
          });
        }

        if (input.sourceType === 'github') {
          return sourceProviders.github.validateSource({
            source: {
              sourceType: 'github',
              sourceUrl: input.sourceUrl,
            },
          });
        }

        if (input.sourceType === 'ai2_blog') {
          return sourceProviders.ai2_blog.validateSource({
            source: {
              sourceType: 'ai2_blog',
              sourceUrl: input.sourceUrl,
            },
          });
        }

        if (input.sourceType === 'moonshot_blog') {
          return sourceProviders.moonshot_blog.validateSource({
            source: {
              sourceType: 'moonshot_blog',
              sourceUrl: input.sourceUrl,
            },
          });
        }

        if (input.sourceType === 'meta_ai_blog') {
          return sourceProviders.meta_ai_blog.validateSource({
            source: {
              sourceType: 'meta_ai_blog',
              sourceUrl: input.sourceUrl,
            },
          });
        }

        if (input.sourceType === 'xai_news') {
          return sourceProviders.xai_news.validateSource({
            source: {
              sourceType: 'xai_news',
              sourceUrl: input.sourceUrl,
            },
          });
        }

        if (input.sourceType === 'anthropic_news') {
          return sourceProviders.anthropic_news.validateSource({
            source: {
              sourceType: 'anthropic_news',
              sourceUrl: input.sourceUrl,
            },
          });
        }

        if (input.sourceType === 'hf_papers') {
          return sourceProviders.hf_papers.validateSource({
            source: {
              sourceType: 'hf_papers',
              sourceUrl: input.sourceUrl,
            },
          });
        }

        return sourceProviders.x.validateSource({
          source: {
            sourceType: 'x',
            xUsername: input.xUsername,
          },
        });
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
      await wechatBridge.stop();
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
