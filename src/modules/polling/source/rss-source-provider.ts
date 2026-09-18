import { createHash } from 'node:crypto';

import { XMLParser } from 'fast-xml-parser';

import { createFetchWithProxy } from './fetch-with-proxy';

import type {
  SourceProvider,
  SourceProviderAccount,
  SourceProviderErrorDiagnostics,
  SourceProviderFetchInput,
  SourceProviderFetchResult,
  SourceProviderValidateSourceInput,
  StandardizedPost,
} from '../types';
import { SourceProviderError } from './source-provider-error';

export interface RssSourceProviderOptions {
  fetchImplementation?: typeof fetch;
  proxyUrl?: string;
  timeoutMs?: number;
  userAgent?: string;
}

interface ParsedFeed {
  items: Record<string, unknown>[];
  title?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_USER_AGENT = 'AI-Frontier-Radar/0.1 (+https://github.com/shi-YangYang/AI-Frontier-Radar)';
const MAX_CONTENT_LENGTH = 4_000;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  bull: '•',
  copy: '©',
  gt: '>',
  hellip: '…',
  ldquo: '“',
  lsquo: '‘',
  lt: '<',
  mdash: '—',
  middot: '·',
  nbsp: ' ',
  ndash: '–',
  quot: '"',
  rdquo: '”',
  reg: '®',
  rsquo: '’',
  trade: '™',
};

export class RssSourceProvider implements SourceProvider {
  public readonly sourceType = 'rss' as const;
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  public constructor(options: RssSourceProviderOptions = {}) {
    if (options.fetchImplementation !== undefined) {
      this.fetchImplementation = options.fetchImplementation;
    } else {
      this.fetchImplementation = createFetchWithProxy(options.proxyUrl);
    }

    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

    if (typeof this.fetchImplementation !== 'function') {
      throw new Error('A fetch implementation is required to create the RSS source provider.');
    }
  }

  public async fetchPosts(input: SourceProviderFetchInput): Promise<SourceProviderFetchResult> {
    const sourceUrl = validateFetchInput(input);
    const fetchedAt = new Date().toISOString();
    const feed = await this.fetchFeed(sourceUrl, 'fetch-timeline');
    const account = toSourceProviderAccount(sourceUrl, feed);
    const entries = toEntries(feed, account, sourceUrl, fetchedAt);
    const filteredEntries =
      input.sincePostId === undefined
        ? entries
        : entries.filter((entry) => comparePostIds(entry.xPostId, input.sincePostId as string) > 0);
    const posts = filteredEntries
      .sort((left, right) => comparePostIds(right.xPostId, left.xPostId))
      .slice(0, input.limit);

    return {
      account,
      meta: {
        newestPostId: posts[0]?.xPostId,
        oldestPostId: posts.at(-1)?.xPostId,
        provider: 'rss',
        requestedLimit: input.limit,
        resolvedBy: 'sourceUrl',
        sincePostId: input.sincePostId,
      },
      posts,
    };
  }

  public async validateSource(
    input: SourceProviderValidateSourceInput,
  ): Promise<SourceProviderAccount> {
    const sourceUrl = validateSourceInput(input);
    const feed = await this.fetchFeed(sourceUrl, 'resolve-account');

    return toSourceProviderAccount(sourceUrl, feed);
  }

  private async fetchFeed(
    sourceUrl: string,
    operation: 'fetch-timeline' | 'resolve-account',
  ): Promise<ParsedFeed> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      let response: Response;

      try {
        response = await this.fetchImplementation(sourceUrl, {
          headers: {
            Accept:
              'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
            'User-Agent': this.userAgent,
          },
          redirect: 'follow',
          signal: controller.signal,
        });
      } catch (error) {
        throw new SourceProviderError(
          'SOURCE_REQUEST_FAILED',
          'RSS feed request failed.',
          {
            causeMessage: toErrorMessage(error),
            endpoint: sourceUrl,
            operation,
            provider: 'rss',
            sourceUrl,
          },
          error,
        );
      }

      if (!response.ok) {
        throw createHttpStatusError(response.status, sourceUrl, operation);
      }

      let body: string;

      try {
        body = await response.text();
      } catch (error) {
        throw new SourceProviderError(
          'SOURCE_REQUEST_FAILED',
          'RSS feed response could not be read.',
          {
            causeMessage: toErrorMessage(error),
            endpoint: sourceUrl,
            operation,
            provider: 'rss',
            sourceUrl,
            statusCode: response.status,
          },
          error,
        );
      }

      return parseFeedDocument(body, sourceUrl, operation);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

export function createRssSourceProvider(options: RssSourceProviderOptions = {}): SourceProvider {
  return new RssSourceProvider(options);
}

function validateFetchInput(input: SourceProviderFetchInput): string {
  if (!Number.isInteger(input.limit) || input.limit < MIN_LIMIT || input.limit > MAX_LIMIT) {
    throw new SourceProviderError(
      'SOURCE_INVALID_INPUT',
      `RSS provider limit must be an integer between ${MIN_LIMIT} and ${MAX_LIMIT}.`,
      {
        limit: input.limit,
        operation: 'fetch-timeline',
        provider: 'rss',
        sincePostId: input.sincePostId,
        sourceUrl: input.source.sourceUrl,
      },
    );
  }

  return normalizeSourceUrl(input.source.sourceUrl, {
    limit: input.limit,
    operation: 'fetch-timeline',
    sincePostId: input.sincePostId,
  });
}

function validateSourceInput(input: SourceProviderValidateSourceInput): string {
  return normalizeSourceUrl(input.source.sourceUrl, {
    operation: 'resolve-account',
  });
}

function normalizeSourceUrl(
  sourceUrl: string | undefined,
  diagnostics: {
    limit?: number;
    operation: 'fetch-timeline' | 'resolve-account';
    sincePostId?: string;
  },
): string {
  const value = sourceUrl?.trim() ?? '';

  if (value.length === 0) {
    throw new SourceProviderError(
      'SOURCE_INVALID_INPUT',
      'RSS provider requires sourceUrl.',
      {
        ...diagnostics,
        provider: 'rss',
        sourceUrl,
      },
    );
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new SourceProviderError(
      'SOURCE_INVALID_INPUT',
      'RSS provider requires a valid absolute URL.',
      {
        ...diagnostics,
        provider: 'rss',
        sourceUrl: value,
      },
    );
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SourceProviderError(
      'SOURCE_INVALID_INPUT',
      'RSS provider only supports http and https URLs.',
      {
        ...diagnostics,
        provider: 'rss',
        sourceUrl: value,
      },
    );
  }

  return url.toString();
}

function createHttpStatusError(
  statusCode: number,
  sourceUrl: string,
  operation: 'fetch-timeline' | 'resolve-account',
): SourceProviderError {
  const diagnostics: SourceProviderErrorDiagnostics = {
    endpoint: sourceUrl,
    operation,
    provider: 'rss',
    sourceUrl,
    statusCode,
  };

  if (statusCode === 404 || statusCode === 410) {
    return new SourceProviderError(
      'SOURCE_ACCOUNT_NOT_FOUND',
      `RSS feed was not found (HTTP ${statusCode}).`,
      diagnostics,
    );
  }

  return new SourceProviderError(
    'SOURCE_REQUEST_FAILED',
    `RSS feed request failed with status ${statusCode}.`,
    diagnostics,
  );
}

function parseFeedDocument(
  xml: string,
  sourceUrl: string,
  operation: 'fetch-timeline' | 'resolve-account',
): ParsedFeed {
  let document: unknown;

  try {
    document = createXmlParser().parse(xml);
  } catch (error) {
    throw createResponseInvalidError(sourceUrl, operation, toErrorMessage(error), error);
  }

  if (!isRecord(document)) {
    throw createResponseInvalidError(sourceUrl, operation, 'RSS feed root element is not an object.');
  }

  const rss = isRecord(document.rss) ? document.rss : undefined;

  if (rss !== undefined) {
    const channel = isRecord(rss.channel) ? rss.channel : undefined;

    if (channel === undefined) {
      throw createResponseInvalidError(sourceUrl, operation, 'RSS channel element is missing.');
    }

    return {
      items: toRecordArray(channel.item),
      title: cleanHtmlText(extractText(channel.title)),
    };
  }

  const atomFeed = isRecord(document.feed) ? document.feed : undefined;

  if (atomFeed !== undefined) {
    return {
      items: toRecordArray(atomFeed.entry),
      title: cleanHtmlText(extractText(atomFeed.title)),
    };
  }

  const rdf =
    (isRecord(document['rdf:RDF']) ? document['rdf:RDF'] : undefined) ??
    (isRecord(document.RDF) ? document.RDF : undefined);

  if (rdf !== undefined) {
    const channel = isRecord(rdf.channel) ? rdf.channel : undefined;

    return {
      items: toRecordArray(rdf.item),
      title: cleanHtmlText(extractText(channel?.title)),
    };
  }

  throw createResponseInvalidError(
    sourceUrl,
    operation,
    'RSS feed root element was not rss, feed or rdf:RDF.',
  );
}

function createResponseInvalidError(
  sourceUrl: string,
  operation: 'fetch-timeline' | 'resolve-account',
  causeMessage: string,
  cause?: unknown,
): SourceProviderError {
  return new SourceProviderError(
    'SOURCE_RESPONSE_INVALID',
    'RSS feed content could not be parsed.',
    {
      causeMessage,
      endpoint: sourceUrl,
      operation,
      provider: 'rss',
      sourceUrl,
    },
    cause,
  );
}

function createXmlParser(): XMLParser {
  return new XMLParser({
    attributeNamePrefix: '@_',
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true,
  });
}

function toSourceProviderAccount(sourceUrl: string, feed: ParsedFeed): SourceProviderAccount {
  const title = feed.title;

  return {
    displayName: title,
    sourceId: `rss:${hashToHex(sourceUrl)}`,
    sourceLabel: title ?? resolveSourceHost(sourceUrl),
  };
}

function toEntries(
  feed: ParsedFeed,
  account: SourceProviderAccount,
  sourceUrl: string,
  fetchedAt: string,
): StandardizedPost[] {
  const posts: StandardizedPost[] = [];
  const seenPostIds = new Set<string>();

  for (const item of feed.items) {
    const post = toEntryPost(item, account, sourceUrl, fetchedAt);

    if (post === null || seenPostIds.has(post.xPostId)) {
      continue;
    }

    seenPostIds.add(post.xPostId);
    posts.push(post);
  }

  return posts;
}

function toEntryPost(
  entry: Record<string, unknown>,
  account: SourceProviderAccount,
  sourceUrl: string,
  fetchedAt: string,
): StandardizedPost | null {
  const link = extractLink(entry) ?? toHttpUrl(extractGuid(entry));
  const postedAt = resolveEntryDate(entry) ?? fetchedAt;
  const guid = extractGuid(entry) ?? link;

  if (link === undefined || guid === undefined) {
    return null;
  }

  const title = cleanHtmlText(extractText(pickValue(entry, ['title'])));
  const content = truncateText(
    cleanHtmlText(
      extractText(pickValue(entry, ['content:encoded', 'description', 'summary', 'content'])),
    ),
    MAX_CONTENT_LENGTH,
  );
  const textContent = [title, content].filter((part): part is string => isPresent(part)).join('\n\n');

  return {
    author: {
      displayName: account.displayName,
      sourceId: account.sourceId,
      sourceLabel: cleanHtmlText(extractAuthor(entry)) ?? account.sourceLabel,
    },
    dedupeKey: createDedupeKey(sourceUrl, guid),
    isReply: false,
    isRepost: false,
    permalinkUrl: link,
    postedAt,
    rawPayload: {
      entry,
      sourceUrl,
    },
    textContent,
    ...(title === undefined || title.length === 0 ? {} : { title }),
    xPostId: createStablePostId(postedAt, guid, fetchedAt),
  };
}

function extractLink(entry: Record<string, unknown>): string | undefined {
  const candidates = Array.isArray(entry.link) ? entry.link : [entry.link];
  let alternateFallback: string | undefined;

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const url = toHttpUrl(candidate);

      if (url !== undefined) {
        return url;
      }

      continue;
    }

    if (!isRecord(candidate)) {
      continue;
    }

    const href = typeof candidate['@_href'] === 'string' ? candidate['@_href'] : undefined;
    const url = href === undefined ? undefined : toHttpUrl(href);

    if (url === undefined) {
      continue;
    }

    const rel = typeof candidate['@_rel'] === 'string' ? candidate['@_rel'].toLowerCase() : '';

    if (rel.length === 0 || rel === 'alternate') {
      return url;
    }

    alternateFallback = alternateFallback ?? url;
  }

  return alternateFallback;
}

function extractGuid(entry: Record<string, unknown>): string | undefined {
  return (
    extractText(pickValue(entry, ['guid', 'id', 'dc:identifier'])) ??
    (typeof entry['@_rdf:about'] === 'string' ? entry['@_rdf:about'] : undefined)
  );
}

function extractAuthor(entry: Record<string, unknown>): string | undefined {
  const author = pickValue(entry, ['author', 'dc:creator', 'creator', 'itunes:author']);
  const candidates = Array.isArray(author) ? author : [author];

  for (const candidate of candidates) {
    if (isRecord(candidate)) {
      const name = extractText(candidate.name);

      if (isPresent(name)) {
        return name;
      }
    }

    const text = extractText(candidate);

    if (isPresent(text)) {
      return text;
    }
  }

  return undefined;
}

function resolveEntryDate(entry: Record<string, unknown>): string | undefined {
  const candidates = pickValue(entry, ['pubDate', 'published', 'updated', 'dc:date', 'date']);
  const values = Array.isArray(candidates) ? candidates : [candidates];

  for (const value of values) {
    const isoDate = parseDateValue(value);

    if (isoDate !== undefined) {
      return isoDate;
    }
  }

  return undefined;
}

function parseDateValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  const text = extractText(value);

  if (!isPresent(text)) {
    return undefined;
  }

  const timestamp = Date.parse(text);

  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

function createDedupeKey(sourceUrl: string, guid: string): string {
  const digest = createHash('sha256').update(`${sourceUrl}#${guid}`).digest('hex').slice(0, 32);

  return `rss:${digest}`;
}

function createStablePostId(postedAt: string, guid: string, fetchedAt: string): string {
  const timestamp = Date.parse(postedAt);
  const fallbackTimestamp = Date.parse(fetchedAt);
  const timestampMs =
    Number.isFinite(timestamp) && timestamp > 0
      ? timestamp
      : Number.isFinite(fallbackTimestamp) && fallbackTimestamp > 0
        ? fallbackTimestamp
        : Date.now();

  return `${String(timestampMs).padStart(16, '0')}${toHashDigits(guid)}`;
}

function toHashDigits(value: string): string {
  return String(hashString(value) % 100_000_000).padStart(8, '0');
}

function hashToHex(value: string): string {
  return hashString(value).toString(16).padStart(8, '0');
}

function hashString(value: string): number {
  let hash = 2_166_136_261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

function comparePostIds(left: string, right: string): number {
  try {
    const leftValue = BigInt(left);
    const rightValue = BigInt(right);

    if (leftValue === rightValue) {
      return 0;
    }

    return leftValue > rightValue ? 1 : -1;
  } catch {
    return left.localeCompare(right);
  }
}

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(?:#x([0-9a-fA-F]+)|#(\d+)|([a-zA-Z][a-zA-Z0-9]*));/gu,
    (match, hexCode: string | undefined, decimalCode: string | undefined, entity: string | undefined) => {
      if (hexCode !== undefined) {
        return toCodePointString(Number.parseInt(hexCode, 16)) ?? match;
      }

      if (decimalCode !== undefined) {
        return toCodePointString(Number.parseInt(decimalCode, 10)) ?? match;
      }

      if (entity !== undefined) {
        return NAMED_HTML_ENTITIES[entity.toLowerCase()] ?? match;
      }

      return match;
    },
  );
}

function toCodePointString(codePoint: number): string | undefined {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return undefined;
  }

  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return undefined;
  }
}

function stripHtmlTags(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|tr|table|blockquote)>/giu, '\n')
    .replace(/<[^>]*>/gu, ' ');
}

function cleanHtmlText(value: string | undefined): string | undefined {
  if (!isPresent(value)) {
    return undefined;
  }

  let text = value;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    text = stripHtmlTags(decodeHtmlEntities(text));
  }

  const normalized = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/gu, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();

  return normalized.length === 0 ? undefined : normalized;
}

function truncateText(value: string | undefined, maxLength: number): string | undefined {
  if (value === undefined || value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength);
}

function resolveSourceHost(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return sourceUrl;
  }
}

function toHttpUrl(value: string | undefined): string | undefined {
  if (!isPresent(value)) {
    return undefined;
  }

  try {
    const url = new URL(value.trim());

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined;
    }

    return url.toString();
  } catch {
    return undefined;
  }
}

function pickValue(entry: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (entry[key] !== undefined) {
      return entry[key];
    }
  }

  return undefined;
}

function extractText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = extractText(item);

      if (isPresent(text)) {
        return text;
      }
    }

    return undefined;
  }

  if (isRecord(value)) {
    return extractText(value['#text']) ?? extractText(value['__cdata']);
  }

  return undefined;
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  const candidates = Array.isArray(value) ? value : [value];

  return candidates.filter((candidate): candidate is Record<string, unknown> => isRecord(candidate));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPresent(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.name === 'AbortError' ? 'Request timed out.' : error.message;
  }

  return String(error);
}
