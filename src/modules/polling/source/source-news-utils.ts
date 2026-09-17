import type { StandardizedPost, SourceProviderAccount } from '../types';

export interface NewsEntry {
  category?: string;
  publishedAt: string;
  slug: string;
  summary?: string;
  title: string;
}

export function cleanHtmlText(value: string): string {
  return value
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&#x([0-9a-fA-F]+);/gu, (_, hex: string) => toCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/gu, (_, decimal: string) => toCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&nbsp;/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function resolvePublishedAt(dateText: string | undefined, fallbackIso: string): string {
  const value = dateText?.trim() ?? '';

  if (value.length > 0) {
    const timestamp = Date.parse(value);

    if (Number.isFinite(timestamp)) {
      return new Date(timestamp).toISOString();
    }
  }

  return fallbackIso;
}

export function buildNumericPostId(publishedAt: string, slug: string): string {
  const timestamp = Date.parse(publishedAt);
  const prefix = String(Number.isFinite(timestamp) ? timestamp : Date.now()).padStart(16, '0');

  return `${prefix}${toHashDigits(slug)}`;
}

export function toHashDigits(value: string): string {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.codePointAt(0)!) % 100_000_000;
  }

  return String(hash).padStart(8, '0');
}

export function buildTextContent(entry: NewsEntry): string {
  const sections = [entry.title];

  if (entry.summary !== undefined && entry.summary.length > 0) {
    sections.push(entry.summary);
  }

  if (entry.category !== undefined && entry.category.length > 0) {
    sections.push(entry.category);
  }

  return sections.join('\n\n');
}

export function toNewsPost(
  entry: NewsEntry,
  account: SourceProviderAccount,
  permalinkUrl: string,
  dedupePrefix: string,
): StandardizedPost {
  return {
    author: account,
    dedupeKey: `${dedupePrefix}${entry.slug}`,
    isReply: false,
    isRepost: false,
    permalinkUrl,
    postedAt: entry.publishedAt,
    rawPayload: entry,
    textContent: buildTextContent(entry),
    xPostId: buildNumericPostId(entry.publishedAt, `${dedupePrefix}${entry.slug}`),
  };
}

function toCodePoint(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0x10ffff) {
    return '';
  }

  return String.fromCodePoint(value);
}
