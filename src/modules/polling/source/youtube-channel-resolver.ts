import { createFetchWithProxy, type FetchImplementation } from './fetch-with-proxy';

export interface YoutubeChannelResolveOptions {
  fetchImplementation?: FetchImplementation;
  proxyUrl?: string;
}

export interface ResolvedYoutubeChannel {
  feedUrl: string;
  label?: string;
}

export class YoutubeChannelResolveError extends Error {
  public constructor(
    public readonly kind: 'invalid-input' | 'resolve-failed',
    message: string,
  ) {
    super(message);
    this.name = 'YoutubeChannelResolveError';
  }
}

const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{20,}$/u;
const FEED_URL_PREFIX = 'https://www.youtube.com/feeds/videos.xml?channel_id=';
const YOUTUBE_REQUEST_HEADERS = {
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
};

export async function resolveYoutubeChannel(
  rawInput: string,
  options: YoutubeChannelResolveOptions = {},
): Promise<ResolvedYoutubeChannel> {
  const input = rawInput.trim();

  if (input.length === 0) {
    throw new YoutubeChannelResolveError('invalid-input', 'YouTube 频道输入不能为空。');
  }

  const directChannelId = extractDirectChannelId(input);

  if (directChannelId !== undefined) {
    return {
      feedUrl: `${FEED_URL_PREFIX}${directChannelId}`,
    };
  }

  const pageUrl = toChannelPageUrl(input);

  if (pageUrl === undefined) {
    throw new YoutubeChannelResolveError(
      'invalid-input',
      '无法识别的 YouTube 频道地址，请填写频道链接或 @handle。',
    );
  }

  const fetchImplementation = options.fetchImplementation ?? createFetchWithProxy(options.proxyUrl);
  let html: string;

  try {
    const response = await fetchImplementation(pageUrl, {
      headers: YOUTUBE_REQUEST_HEADERS,
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new YoutubeChannelResolveError(
        'resolve-failed',
        `YouTube 频道页面请求失败（HTTP ${response.status}）。`,
      );
    }

    html = await response.text();
  } catch (error) {
    if (error instanceof YoutubeChannelResolveError) {
      throw error;
    }

    throw new YoutubeChannelResolveError(
      'resolve-failed',
      `YouTube 频道页面请求失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const channelId = extractChannelIdFromHtml(html);

  if (channelId === undefined) {
    throw new YoutubeChannelResolveError(
      'resolve-failed',
      '未能从频道页面解析出 channel_id，可改用频道 RSS 地址直接添加。',
    );
  }

  const label = extractTitleFromHtml(html);

  return {
    feedUrl: `${FEED_URL_PREFIX}${channelId}`,
    ...(label === undefined ? {} : { label }),
  };
}

function extractDirectChannelId(input: string): string | undefined {
  if (CHANNEL_ID_PATTERN.test(input)) {
    return input;
  }

  const match = /(?:^|\/)channel\/(UC[A-Za-z0-9_-]{20,})(?:[/?#]|$)/u.exec(input);

  return match?.[1];
}

function toChannelPageUrl(input: string): string | undefined {
  if (/^https?:\/\//iu.test(input)) {
    try {
      const url = new URL(input);

      if (!/(^|\.)youtube\.com$/iu.test(url.hostname)) {
        return undefined;
      }

      return url.toString();
    } catch {
      return undefined;
    }
  }

  const handle = input.replace(/^@/u, '').trim();

  if (/^[A-Za-z0-9._-]{1,100}$/u.test(handle)) {
    return `https://www.youtube.com/@${handle}`;
  }

  return undefined;
}

function extractChannelIdFromHtml(html: string): string | undefined {
  const patterns = [
    /"channelId"\s*:\s*"(UC[A-Za-z0-9_-]{20,})"/u,
    /"externalId"\s*:\s*"(UC[A-Za-z0-9_-]{20,})"/u,
    /channel_id=(UC[A-Za-z0-9_-]{20,})/u,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);

    if (match?.[1] !== undefined) {
      return match[1];
    }
  }

  return undefined;
}

function extractTitleFromHtml(html: string): string | undefined {
  const match =
    /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/u.exec(html) ??
    /<title>([^<]+)<\/title>/u.exec(html);
  const title = match?.[1]?.trim();

  if (title === undefined || title.length === 0) {
    return undefined;
  }

  return decodeHtmlTitle(title);
}

function decodeHtmlTitle(value: string): string {
  return value
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/\s+-\s+YouTube$/u, '')
    .trim();
}
