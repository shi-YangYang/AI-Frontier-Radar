import type { MessageKey } from './i18n';

export interface SourceLike {
  displayName?: string | null;
  id?: string;
  sourceType: string;
  sourceUrl?: string | null;
  xUsername?: string | null;
}

export type SourceGroupKey = 'ai' | 'dev' | 'news' | 'other' | 'paper' | 'social';

export const SOURCE_GROUP_ORDER: SourceGroupKey[] = ['ai', 'paper', 'dev', 'news', 'social', 'other'];

export const SOURCE_GROUP_LABEL_KEYS: Record<SourceGroupKey, MessageKey> = {
  ai: 'sourceGroup.ai',
  dev: 'sourceGroup.dev',
  news: 'sourceGroup.news',
  other: 'sourceGroup.other',
  paper: 'sourceGroup.paper',
  social: 'sourceGroup.social',
};

const AI_SOURCE_TYPES = new Set(['ai2_blog', 'anthropic_news', 'meta_ai_blog', 'moonshot_blog', 'xai_news']);
const AI_HOST_PATTERN =
  /(anthropic\.com|openai\.com|ai\.meta\.com|x\.ai|moonshot|mistral\.ai|stability\.ai|huggingface\.co\/blog)/iu;
const NEWS_SOURCE_TYPES = new Set(['hackernews', 'producthunt', 'reddit', 'youtube']);
const NEWS_HOST_PATTERN = /(hnrss\.org|reddit\.com|producthunt\.com|techmeme\.com|youtube\.com)/iu;

export function sourceLabel(source: SourceLike): string {
  const url = source.sourceUrl ?? '';
  const arxivMatch = url.match(/arxiv\.org\/rss\/([\w.-]+)/iu);

  if (arxivMatch !== null) {
    return `arXiv ${arxivMatch[1]}`;
  }

  if (url.includes('hnrss.org')) {
    if (url.includes('points=300')) return 'Hacker News 300+ 分';
    if (url.includes('points=100')) return 'Hacker News 100+ 分';
    if (url.includes('/newest')) return 'Hacker News 最新';
    if (url.includes('/frontpage')) return 'Hacker News 首页';

    return 'Hacker News';
  }

  if (url.includes('producthunt.com')) return 'Product Hunt 热榜';
  if (url.includes('techmeme.com')) return 'Techmeme';

  const redditMatch = url.match(/reddit\.com\/r\/([\w]+)/iu);

  if (redditMatch !== null) return `Reddit r/${redditMatch[1]}`;

  if (source.sourceType === 'youtube' || url.includes('youtube.com/feeds')) {
    return source.displayName?.trim() || 'YouTube 频道';
  }

  if (url.includes('openai.com')) return 'OpenAI 新闻';
  if (url.includes('anthropic.com')) return 'Anthropic 新闻';
  if (url.includes('ai.meta.com')) return 'Meta AI 博客';
  if (url.includes('x.ai')) return 'xAI 新闻';
  if (url.includes('moonshot.cn') || url.includes('moonshot.ai')) return 'Moonshot 博客';
  if (url.includes('mistral.ai')) return 'Mistral 博客';
  if (url.includes('stability.ai')) return 'Stability 博客';
  if (url.includes('huggingface.co/papers')) return 'HF Daily Papers';
  if (url.includes('huggingface.co')) return 'Hugging Face 博客';

  if (source.sourceType === 'github' || url.includes('github.com')) {
    if (url.includes('/releases')) return source.displayName?.trim() || 'GitHub Releases';
    if (url.includes('/activity')) return source.displayName?.trim() || 'GitHub 活跃仓库';

    return source.displayName?.trim() || 'GitHub Trending';
  }

  if (source.sourceType === 'x') {
    if (source.xUsername !== null && source.xUsername !== undefined && source.xUsername.length > 0) {
      return `@${source.xUsername}`;
    }

    return source.displayName?.trim() || 'X 账号';
  }

  const displayName = source.displayName?.trim() ?? '';

  if (displayName.length > 0 && !looksLikeFeedTitle(displayName)) {
    return displayName;
  }

  if (url.length > 0) {
    return shortenUrl(url);
  }

  return displayName.length > 0 ? displayName : source.sourceType;
}

export function sourceSubtitle(source: SourceLike): string {
  const url = source.sourceUrl ?? '';

  if (source.sourceType === 'x') {
    return source.displayName?.trim() ?? '';
  }

  if (url.length === 0) {
    return source.displayName?.trim() ?? '';
  }

  return shortenUrl(url);
}

export function sourceGroup(source: SourceLike): SourceGroupKey {
  const url = source.sourceUrl ?? '';

  if (AI_SOURCE_TYPES.has(source.sourceType) || AI_HOST_PATTERN.test(url)) {
    return 'ai';
  }

  if (source.sourceType === 'hf_papers' || url.includes('arxiv.org') || url.includes('huggingface.co/papers')) {
    return 'paper';
  }

  if (source.sourceType === 'github' || url.includes('github.com')) {
    return 'dev';
  }

  if (NEWS_SOURCE_TYPES.has(source.sourceType) || NEWS_HOST_PATTERN.test(url)) {
    return 'news';
  }

  if (source.sourceType === 'x') {
    return 'social';
  }

  return 'other';
}

function looksLikeFeedTitle(value: string): boolean {
  return /updates on arxiv\.org|^rss$|^feed$/iu.test(value);
}

function shortenUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === '/' ? '' : parsed.pathname;

    return `${parsed.hostname}${path}`;
  } catch {
    return url;
  }
}
