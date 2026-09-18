import { toStartupConfigLogContext } from '../shared/config';
import type { AppConfig } from '../shared/config/types';
import { createApp } from '../app/create-app';
import type { AppLogger } from '../lib/logger';
import { createAuthService } from '../modules/auth';
import { createRetentionService } from '../modules/maintenance';
import { createWechatBridgeService, syncWechatDeliveryTargets, WechatBindCoordinator } from '../modules/wechat';
import { createRuntimeScheduler, createRuntimeSourceProviders } from '../modules/scheduler';
import { createRuntimeSettingsService, createStorageFromConfig } from '../modules/storage';

export interface StartServerOptions {
  config: AppConfig;
  logger: AppLogger;
}

export async function startServer(options: StartServerOptions): Promise<void> {
  const storage = createStorageFromConfig(options.config);
  const auth = createAuthService({
    adminPassword: process.env.ADMIN_PASSWORD,
    adminUsername: process.env.ADMIN_USERNAME,
    logger: options.logger,
    storage,
  });

  await auth.ensureSeedAdmin();
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

  if (wechatBridge.isInstalled()) {
    const bridgeStatus = wechatBridge.getStatus();
    void wechatBridge
      .getAccounts()
      .then((accounts) =>
        syncWechatDeliveryTargets({
          accounts,
          bridgeBaseUrl: `http://127.0.0.1:${bridgeStatus.port}/send`,
          deliveryTargets: storage.deliveryTargets,
        }),
      )
      .catch((error) =>
        options.logger.warn(
          { err: error },
          '启动时同步微信投递通道失败',
        ),
      );
  }
  const scheduler = createRuntimeScheduler({
    config: options.config,
    logger: options.logger,
    retention,
    runtimeSettings,
    storage,
  });
  const app = createApp({
    auth,
    wechatBindCoordinator: new WechatBindCoordinator(),
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
    options.logger.info({ signal }, '收到服务关闭请求');
    try {
      await app.close();
      await wechatBridge.stop();
    } catch (error) {
      options.logger.error({ err: error, signal }, '服务关闭失败');
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
      '服务已启动',
    );
    scheduler.start();

    process.once('SIGINT', handleSigint);
    process.once('SIGTERM', handleSigterm);
    signalHandlersRegistered = true;
  } catch (error) {
    options.logger.error({ err: error }, '服务启动失败');
    await app.close();
    throw error;
  }
}
