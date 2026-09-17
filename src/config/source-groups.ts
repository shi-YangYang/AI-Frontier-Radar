import type { WatchAccountSourceType } from '../modules/storage/types';

export interface SourceGroupSource {
  sourceType: WatchAccountSourceType;
  sourceUrl: string;
}

export interface SourceGroupDefinition {
  description: string;
  details?: string;
  id: string;
  name: string;
  sources: readonly SourceGroupSource[];
}

export const SOURCE_GROUPS: readonly SourceGroupDefinition[] = [
  {
    description: '人工智能前沿：论文、科技新闻、社区、产品发布、官方博客（含 Anthropic）、中文媒体与 GitHub 热门仓库。',
    details:
      'arXiv cs.AI / cs.CL / cs.LG / cs.CV、HF Daily Papers、Techmeme、Hacker News、Reddit r/LocalLLaMA、Product Hunt、OpenAI News、Google AI、Google DeepMind、Anthropic News、量子位、GitHub Trending（每日）。',
    id: 'ai-news',
    name: 'AI 消息',
    sources: [
      { sourceType: 'rss', sourceUrl: 'https://export.arxiv.org/rss/cs.AI' },
      { sourceType: 'rss', sourceUrl: 'https://export.arxiv.org/rss/cs.CL' },
      { sourceType: 'rss', sourceUrl: 'https://export.arxiv.org/rss/cs.LG' },
      { sourceType: 'rss', sourceUrl: 'https://export.arxiv.org/rss/cs.CV' },
      { sourceType: 'hf_papers', sourceUrl: 'https://huggingface.co/api/daily_papers?limit=50' },
      { sourceType: 'rss', sourceUrl: 'https://www.techmeme.com/feed.xml' },
      { sourceType: 'rss', sourceUrl: 'https://hnrss.org/frontpage' },
      { sourceType: 'rss', sourceUrl: 'https://www.reddit.com/r/LocalLLaMA/new/.rss' },
      { sourceType: 'rss', sourceUrl: 'https://www.producthunt.com/feed' },
      { sourceType: 'rss', sourceUrl: 'https://openai.com/news/rss.xml' },
      { sourceType: 'rss', sourceUrl: 'https://blog.google/technology/ai/rss/' },
      { sourceType: 'rss', sourceUrl: 'https://deepmind.google/blog/rss.xml' },
      { sourceType: 'anthropic_news', sourceUrl: 'https://www.anthropic.com/news' },
      { sourceType: 'rss', sourceUrl: 'https://www.qbitai.com/feed' },
      { sourceType: 'github', sourceUrl: 'https://github.com/trending?since=daily' },
    ],
  },
];

export function findSourceGroup(id: string): SourceGroupDefinition | undefined {
  return SOURCE_GROUPS.find((group) => group.id === id);
}
