import { XMLBuilder } from 'fast-xml-parser';

import { createSubscriptionRuleMatcher } from '../../polling';
import type { StorageContext, XPostRaw } from '../../storage';
import { createSubscriptionRuleService } from '../../storage';

export interface FeedQuery {
  limit: number;
  matched: boolean;
}

export interface FeedRenderOptions {
  baseUrl: string;
  query: FeedQuery;
}

const DEFAULT_FEED_LIMIT = 50;
const MAX_FEED_LIMIT = 200;
const MATCHED_SCAN_LIMIT = 500;
const FEED_TITLE = 'AI 前沿雷达';
const FEED_DESCRIPTION = '本地 AI 与计算机技术消息雷达';
const MAX_TITLE_LENGTH = 120;

export function readFeedQuery(query: unknown): FeedQuery {
  const record = typeof query === 'object' && query !== null ? (query as Record<string, unknown>) : {};
  const limit = readLimit(record.limit);
  const matched = record.matched === '1' || record.matched === 'true';

  return { limit, matched };
}

export async function renderRssFeed(
  storage: Pick<StorageContext, 'appSettings' | 'xPosts'>,
  options: FeedRenderOptions,
): Promise<string> {
  const posts = await resolveFeedPosts(storage, options.query);
  const builder = new XMLBuilder({
    format: true,
    ignoreAttributes: false,
    suppressEmptyNode: true,
  });

  const document = {
    '?xml': {
      '@_version': '1.0',
      '@_encoding': 'UTF-8',
    },
    rss: {
      '@_version': '2.0',
      channel: {
        description: FEED_DESCRIPTION,
        item: posts.map((post) => ({
          author: post.authorUsername,
          description: post.textContent,
          guid: {
            '#text': post.xPostId,
            '@_isPermaLink': 'false',
          },
          link: post.permalinkUrl,
          pubDate: new Date(post.postedAt).toUTCString(),
          title: toFeedTitle(post),
        })),
        language: 'zh-cn',
        lastBuildDate: new Date().toUTCString(),
        link: options.baseUrl,
        title: FEED_TITLE,
      },
    },
  };

  return builder.build(document);
}

export async function renderJsonFeed(
  storage: Pick<StorageContext, 'appSettings' | 'xPosts'>,
  options: FeedRenderOptions,
): Promise<string> {
  const posts = await resolveFeedPosts(storage, options.query);
  const document = {
    feed_url: `${options.baseUrl}/feed.json`,
    home_page_url: options.baseUrl,
    items: posts.map((post) => ({
      authors: [{ name: post.authorUsername }],
      content_text: post.textContent,
      date_published: post.postedAt,
      id: post.xPostId,
      title: toFeedTitle(post),
      url: post.permalinkUrl,
    })),
    title: FEED_TITLE,
    version: 'https://jsonfeed.org/version/1.1',
  };

  return JSON.stringify(document, null, 2);
}

async function resolveFeedPosts(
  storage: Pick<StorageContext, 'appSettings' | 'xPosts'>,
  query: FeedQuery,
): Promise<XPostRaw[]> {
  const posts = await storage.xPosts.listLatest(
    query.matched ? MATCHED_SCAN_LIMIT : query.limit,
  );

  if (!query.matched) {
    return posts;
  }

  const rules = await createSubscriptionRuleService({
    appSettings: storage.appSettings,
  }).getRules();
  const matcher = createSubscriptionRuleMatcher(rules);

  if (!matcher.hasEnabledRules) {
    return posts.slice(0, query.limit);
  }

  return posts.filter((post) => matcher.matches(post.textContent)).slice(0, query.limit);
}

function readLimit(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : NaN;

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return DEFAULT_FEED_LIMIT;
  }

  return Math.min(parsed, MAX_FEED_LIMIT);
}

function toFeedTitle(post: XPostRaw): string {
  const firstLine = post.textContent
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (firstLine === undefined) {
    return `@${post.authorUsername}`;
  }

  return firstLine.length <= MAX_TITLE_LENGTH
    ? firstLine
    : `${firstLine.slice(0, MAX_TITLE_LENGTH)}…`;
}
