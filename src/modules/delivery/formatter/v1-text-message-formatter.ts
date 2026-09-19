export interface V1TextMessageFormatterInput {
  authorDisplayName?: string | null;
  authorUsername: string;
  permalinkUrl: string;
  postedAt: string;
  textContent: string;
  title?: string | null;
}

export interface V1TextMessageFormatterOptions {
  bodyMaxLength?: number;
}

export interface FormattedTextMessage {
  text: string;
  title: string;
  truncated: boolean;
  type: 'text';
}

const DEFAULT_BODY_MAX_LENGTH = 1_500;
const DEFAULT_DIGEST_MAX_LENGTH = 3_000;
const TITLE_SNIPPET_MAX_LENGTH = 40;
const EMPTY_CONTENT_PLACEHOLDER = '(no text content)';

export class V1TextMessageFormatter {
  private readonly bodyMaxLength: number;

  public constructor(options: V1TextMessageFormatterOptions = {}) {
    this.bodyMaxLength = normalizeBodyMaxLength(options.bodyMaxLength);
  }

  public format(input: V1TextMessageFormatterInput): FormattedTextMessage {
    const normalizedContent = normalizePostBody(input.textContent);
    const rawTitle = normalizeOptionalDisplayName(input.title) ?? '';
    const contentWithoutTitle =
      rawTitle.length > 0 && normalizedContent.startsWith(rawTitle)
        ? normalizedContent.slice(rawTitle.length).replace(/^[\s:：\-—]+/u, '')
        : normalizedContent;
    const hasBody = contentWithoutTitle.trim().length > 0;
    const truncationResult = truncateText(
      hasBody ? contentWithoutTitle : EMPTY_CONTENT_PLACEHOLDER,
      this.bodyMaxLength,
    );
    const normalizedPermalink = input.permalinkUrl.trim();
    const postId = extractPostId(normalizedPermalink);
    const authorLabel = formatAuthorLabel(input.authorUsername, input.authorDisplayName);
    const channelTitleSource =
      rawTitle.length > 0 ? rawTitle : truncationResult.value.split('\n')[0]?.trim() ?? '';
    const channelTitle = truncateText(channelTitleSource, TITLE_SNIPPET_MAX_LENGTH).value;

    return {
      text: [
        '🚀【AI前沿消息】发现新帖',
        `👤 作者：${authorLabel}`,
        `🕘 北京时间：${formatChinaTimestamp(input.postedAt)}`,
        `🌐 UTC 时间：${formatUtcTimestamp(input.postedAt)}`,
        postId === undefined ? undefined : `🆔 帖子 ID：${postId}`,
        rawTitle.length === 0 ? undefined : `📌 标题：${rawTitle}`,
        hasBody || rawTitle.length === 0 ? `📝 内容：${truncationResult.value}` : undefined,
        truncationResult.truncated
          ? `（内容已截断，最多显示 ${this.bodyMaxLength} 字符）`
          : undefined,
        `🔗 原文链接：${normalizedPermalink}`,
      ].filter((line): line is string => line !== undefined).join('\n'),
      title: `【AI前沿消息】${authorLabel}：${channelTitle}`,
      truncated: truncationResult.truncated,
      type: 'text',
    };
  }

  public formatDigest(inputs: V1TextMessageFormatterInput[]): FormattedTextMessage {
    const total = inputs.length;
    const lines: string[] = [`🚀【AI前沿消息】夜间安静时段共 ${total} 条新帖`];
    let included = 0;

    for (const input of inputs) {
      const block = this.formatDigestItem(input, included + 1);
      const currentLength = lines.join('\n').length;

      if (included > 0 && currentLength + block.length > DEFAULT_DIGEST_MAX_LENGTH) {
        break;
      }

      lines.push('', block);
      included += 1;
    }

    if (included < total) {
      lines.push('', `……等 ${total} 条新帖`);
    }

    return {
      text: lines.join('\n'),
      title: `【AI前沿消息】安静时段 ${total} 条新帖`,
      truncated: included < total,
      type: 'text',
    };
  }

  private formatDigestItem(input: V1TextMessageFormatterInput, index: number): string {
    const rawTitle = normalizeOptionalDisplayName(input.title) ?? '';
    const summarySource =
      rawTitle.length > 0
        ? rawTitle
        : normalizePostBody(input.textContent).split('\n')[0]?.trim() ?? '';
    const summary = truncateText(summarySource.length === 0 ? EMPTY_CONTENT_PLACEHOLDER : summarySource, 60).value;
    const authorLabel = formatAuthorLabel(input.authorUsername, input.authorDisplayName);

    return [
      `${index}. ${summary}`,
      `   👤 ${authorLabel} · 🕘 ${formatChinaTimestamp(input.postedAt)}`,
      `   🔗 ${input.permalinkUrl.trim()}`,
    ].join('\n');
  }
}

export function createV1TextMessageFormatter(
  options: V1TextMessageFormatterOptions = {},
): V1TextMessageFormatter {
  return new V1TextMessageFormatter(options);
}

function formatAuthorLabel(authorUsername: string, authorDisplayName?: string | null): string {
  const normalizedUsername = normalizeUsername(authorUsername);
  const normalizedDisplayName = normalizeOptionalDisplayName(authorDisplayName);

  if (normalizedDisplayName === undefined) {
    return `@${normalizedUsername}`;
  }

  return `${normalizedDisplayName} (@${normalizedUsername})`;
}

function formatUtcTimestamp(value: string): string {
  return formatTimestamp(value, 'UTC');
}

function formatChinaTimestamp(value: string): string {
  return formatTimestamp(value, 'Asia/Shanghai');
}

function formatTimestamp(value: string, timeZone: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));
  const year = valueByType.get('year');
  const month = valueByType.get('month');
  const day = valueByType.get('day');
  const hours = valueByType.get('hour');
  const minutes = valueByType.get('minute');
  const seconds = valueByType.get('second');

  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hours === undefined ||
    minutes === undefined ||
    seconds === undefined
  ) {
    return value;
  }

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function normalizePostBody(textContent: string): string {
  const normalized = normalizeXTextLineBreaks(textContent.replace(/\r\n/g, '\n')).trim();

  if (normalized.length === 0) {
    return EMPTY_CONTENT_PLACEHOLDER;
  }

  return normalized;
}

function truncateText(
  value: string,
  maxLength: number,
): {
  truncated: boolean;
  value: string;
} {
  if (value.length <= maxLength) {
    return {
      truncated: false,
      value,
    };
  }

  const sliced = value.slice(0, Math.max(0, maxLength - 1)).trimEnd();

  return {
    truncated: true,
    value: `${sliced}…`,
  };
}

function normalizeBodyMaxLength(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_BODY_MAX_LENGTH;
  }

  if (!Number.isInteger(value) || value < 32) {
    throw new Error('The V1 text message formatter bodyMaxLength must be an integer >= 32.');
  }

  return value;
}

function normalizeOptionalDisplayName(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/u, '');
}

function normalizeXTextLineBreaks(value: string): string {
  let normalized = value
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\b(Blog|Demo|Paper|Code|Website|Link):\n+/giu, '$1: ')
    .replace(/https?:\/\/\n+/giu, (match) => match.replace(/\n+/gu, ''))
    .replace(/(https?:\/\/[^\s\n]*)\n+([^\s\n]+)/giu, '$1$2')
    .replace(/(@[A-Za-z0-9_]{1,15})\n+(@[A-Za-z0-9_]{1,15})/gu, '$1 $2')
    .replace(/(\bby)\n+(@[A-Za-z0-9_]{1,15})/giu, '$1 $2')
    .replace(/(\s)\n+(@[A-Za-z0-9_]{1,15})/gu, '$1$2')
    .replace(/…(Blog|Demo|Paper|Code|Website|Link):/giu, '…\n$1:')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n[ \t]+/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n');

  for (let index = 0; index < 3; index += 1) {
    normalized = normalized
      .replace(/(https?:\/\/[^\s\n]+)\n+([^\s\n]+)/giu, '$1$2')
      .replace(/(@[A-Za-z0-9_]{1,15})\n+(@[A-Za-z0-9_]{1,15})/gu, '$1 $2');
  }

  return normalized;
}

function extractPostId(permalinkUrl: string): string | undefined {
  try {
    const url = new URL(permalinkUrl);
    const match = /\/status\/(\d+)/u.exec(url.pathname);
    return match?.[1];
  } catch {
    return undefined;
  }
}
