import { loadAppConfig } from '../config';
import { createLogger } from '../lib/logger';
import { startServer } from './start-server';

async function main(): Promise<void> {
  const bootstrapLogger = createLogger({
    bindings: { service: 'ai-news-monitor' },
    level: 'info',
  });

  try {
    const config = await loadAppConfig();
    const logger = createLogger({
      bindings: {
        env: config.service.env,
        service: config.service.name,
      },
      level: config.logging.level,
    });

    await startServer({ config, logger });
  } catch (error) {
    bootstrapLogger.fatal({ err: error }, 'server startup failed');
    process.exitCode = 1;
  }
}

void main();
