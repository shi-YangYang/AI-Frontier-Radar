import type { AppLogger } from '../../lib/logger';
import type { WatchAccountSourceType } from './types';
import type { WatchAccountRepository } from './watch-account-repository';
import type { AppSettingRepository } from './app-setting-repository';

export interface DefaultWatchSource {
  sourceType: WatchAccountSourceType;
  sourceUrl: string;
}

export const DEFAULT_WATCH_SOURCES: readonly DefaultWatchSource[] = [
  { sourceType: 'rss', sourceUrl: 'https://export.arxiv.org/rss/cs.AI' },
  { sourceType: 'rss', sourceUrl: 'https://export.arxiv.org/rss/cs.CL' },
  { sourceType: 'rss', sourceUrl: 'https://export.arxiv.org/rss/cs.LG' },
  { sourceType: 'rss', sourceUrl: 'https://export.arxiv.org/rss/cs.CV' },
  { sourceType: 'rss', sourceUrl: 'https://www.techmeme.com/feed.xml' },
  { sourceType: 'rss', sourceUrl: 'https://hnrss.org/frontpage' },
  { sourceType: 'rss', sourceUrl: 'https://www.producthunt.com/feed' },
  { sourceType: 'rss', sourceUrl: 'https://www.reddit.com/r/LocalLLaMA/new/.rss' },
  { sourceType: 'rss', sourceUrl: 'https://openai.com/news/rss.xml' },
  { sourceType: 'rss', sourceUrl: 'https://blog.google/technology/ai/rss/' },
  { sourceType: 'rss', sourceUrl: 'https://deepmind.google/blog/rss.xml' },
  { sourceType: 'rss', sourceUrl: 'https://www.qbitai.com/feed' },
  { sourceType: 'github', sourceUrl: 'https://github.com/trending?since=daily' },
];

const DEFAULT_SOURCES_MARKER_KEY = 'sources.defaultsImportedAt';

export interface ImportDefaultWatchSourcesResult {
  importedCount: number;
  skipped: boolean;
}

export async function importDefaultWatchSources(
  storage: {
    appSettings: Pick<AppSettingRepository, 'getJson' | 'setJson'>;
    watchAccounts: Pick<WatchAccountRepository, 'countAll' | 'createIfAbsentBySource'>;
  },
  logger?: AppLogger,
  now: Date = new Date(),
): Promise<ImportDefaultWatchSourcesResult> {
  const marker = await storage.appSettings.getJson<string>(DEFAULT_SOURCES_MARKER_KEY);

  if (marker !== null) {
    return {
      importedCount: 0,
      skipped: true,
    };
  }

  const existingCount = await storage.watchAccounts.countAll();

  if (existingCount > 0) {
    await storage.appSettings.setJson(DEFAULT_SOURCES_MARKER_KEY, now.toISOString());

    return {
      importedCount: 0,
      skipped: true,
    };
  }

  let importedCount = 0;

  for (const source of DEFAULT_WATCH_SOURCES) {
    const result = await storage.watchAccounts.createIfAbsentBySource({
      sourceType: source.sourceType,
      sourceUrl: source.sourceUrl,
    });

    if (result.created) {
      importedCount += 1;
    }
  }

  await storage.appSettings.setJson(DEFAULT_SOURCES_MARKER_KEY, now.toISOString());
  logger?.info({ importedCount }, 'default watch sources imported');

  return {
    importedCount,
    skipped: false,
  };
}
