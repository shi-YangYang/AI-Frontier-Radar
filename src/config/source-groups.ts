import type { WatchAccountSourceType } from '../modules/storage/types';

export interface SourceGroupSource {
  sourceType: WatchAccountSourceType;
  sourceUrl: string;
}

export interface SourceGroupDefinition {
  description: string;
  id: string;
  name: string;
  sources: readonly SourceGroupSource[];
}

export const SOURCE_GROUPS: readonly SourceGroupDefinition[] = [
  {
    description:
      '论文（arXiv cs.AI / cs.CL / cs.LG / cs.CV、HF Daily Papers）、科技新闻（Techmeme、Hacker News）、社区（Reddit r/LocalLLaMA）、产品发布（Product Hunt）、官方博客（OpenAI、Google AI、Google DeepMind）、中文媒体（量子位）与 GitHub 热门仓库。',
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
      { sourceType: 'rss', sourceUrl: 'https://www.qbitai.com/feed' },
      { sourceType: 'github', sourceUrl: 'https://github.com/trending?since=daily' },
    ],
  },
];

export function findSourceGroup(id: string): SourceGroupDefinition | undefined {
  return SOURCE_GROUPS.find((group) => group.id === id);
}
