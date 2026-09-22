import type { WatchAccountSourceType } from '../modules/storage/types';

import { SOURCE_GROUPS } from './source-groups';

export interface SourcePackSeedSourceX {
  displayName: string;
  kind: 'x';
  xUsername: string;
}

export interface SourcePackSeedSourceFeed {
  displayName?: string;
  kind: 'feed';
  sourceType: WatchAccountSourceType;
  sourceUrl: string;
}

export interface SourcePackSeedSourceYoutube {
  displayName: string;
  handle: string;
  kind: 'youtube';
}

export type SourcePackSeedSource =
  | SourcePackSeedSourceFeed
  | SourcePackSeedSourceX
  | SourcePackSeedSourceYoutube;

export interface SourcePackSeedDefinition {
  description: string;
  name: string;
  sources: readonly SourcePackSeedSource[];
}

/** 旧版首启包名：存量部署的「AI 消息」包由种子改名为「论文包」。 */
export const LEGACY_SOURCE_PACK_NAME = 'AI 消息';

const AI_NEWS_GROUP = SOURCE_GROUPS[0];

/** 论文包成员（复用 ai-news 组合源），仅作引用校验，防止清单与组合配置漂移。 */
function reusedGroupSource(sourceUrl: string): SourcePackSeedSourceFeed {
  const source = AI_NEWS_GROUP?.sources.find((entry) => entry.sourceUrl === sourceUrl);

  if (source === undefined) {
    throw new Error(`内置包种子引用的源不存在于 source-groups：${sourceUrl}`);
  }

  return {
    kind: 'feed',
    sourceType: source.sourceType,
    sourceUrl: source.sourceUrl,
  };
}

export const BUILT_IN_SOURCE_PACK_SEEDS: readonly SourcePackSeedDefinition[] = [
  {
    description:
      'AI 主线动态：OpenAI、Anthropic、Google DeepMind、Meta、xAI 等官方博客与新闻，模型发布、科技媒体、社区热点，配合 X 核心人物与 YouTube 解读频道。',
    name: 'AI 包',
    sources: [
      reusedGroupSource('https://openai.com/news/rss.xml'),
      reusedGroupSource('https://www.anthropic.com/news'),
      reusedGroupSource('https://blog.google/technology/ai/rss/'),
      reusedGroupSource('https://deepmind.google/blog/rss.xml'),
      reusedGroupSource('https://ai.meta.com/blog/'),
      reusedGroupSource('https://x.ai/news'),
      reusedGroupSource('https://mistral.ai/news/rss'),
      reusedGroupSource('https://stability.ai/news-updates?format=rss'),
      reusedGroupSource('https://huggingface.co/blog/feed.xml'),
      reusedGroupSource('https://platform.moonshot.cn/blog'),
      reusedGroupSource('https://allenai.org/blog'),
      reusedGroupSource('https://www.techmeme.com/feed.xml'),
      reusedGroupSource('https://hnrss.org/frontpage'),
      reusedGroupSource('https://www.reddit.com/r/LocalLLaMA/new/.rss'),
      reusedGroupSource('https://www.qbitai.com/feed'),
      reusedGroupSource('https://github.com/trending?since=daily'),
      { displayName: 'Sam Altman', kind: 'x', xUsername: 'sama' },
      { displayName: 'Andrej Karpathy', kind: 'x', xUsername: 'Karpathy' },
      { displayName: 'Yann LeCun', kind: 'x', xUsername: 'ylecun' },
      { displayName: 'Jim Fan', kind: 'x', xUsername: 'DrJimFan' },
      { displayName: 'swyx', kind: 'x', xUsername: 'swyx' },
      { displayName: 'Anthropic', kind: 'x', xUsername: 'AnthropicAI' },
      { displayName: 'Google DeepMind', kind: 'x', xUsername: 'GoogleDeepMind' },
      { displayName: 'xAI', kind: 'x', xUsername: 'xai' },
      { displayName: 'Two Minute Papers', handle: 'TwoMinutePapers', kind: 'youtube' },
      { displayName: 'AI Explained', handle: 'ai-explained', kind: 'youtube' },
      { displayName: 'Yannic Kilcher', handle: 'YannicKilcher', kind: 'youtube' },
    ],
  },
  {
    description:
      '机器人与具身智能：Boston Dynamics、宇树、Agility、Tesla Optimus 等厂商与人物动态，The Robot Report 行业媒体与 YouTube 频道。',
    name: '机器人包',
    sources: [
      { displayName: 'Boston Dynamics', kind: 'x', xUsername: 'BostonDynamics' },
      { displayName: 'Tesla Optimus', kind: 'x', xUsername: 'Tesla_Optimus' },
      { displayName: 'Unitree 宇树科技', kind: 'x', xUsername: 'unitreerobotics' },
      { displayName: 'Agility Robotics', kind: 'x', xUsername: 'agilityrobotics' },
      { displayName: 'Jim Fan', kind: 'x', xUsername: 'DrJimFan' },
      { displayName: 'Boston Dynamics', handle: 'BostonDynamics', kind: 'youtube' },
      { displayName: 'James Bruton', handle: 'jamesbruton', kind: 'youtube' },
      {
        displayName: 'The Robot Report',
        kind: 'feed',
        sourceType: 'rss',
        sourceUrl: 'https://www.therobotreport.com/feed/',
      },
    ],
  },
  {
    description:
      '脑机接口：Neuralink、Synchron 等公司动态，PubMed 脑机接口文献检索更新与 YouTube 官方频道。',
    name: '脑机包',
    sources: [
      { displayName: 'Neuralink', kind: 'x', xUsername: 'neuralink' },
      { displayName: 'Synchron', kind: 'x', xUsername: 'synchron' },
      {
        displayName: 'PubMed 脑机接口检索',
        kind: 'feed',
        sourceType: 'rss',
        sourceUrl: 'https://neurosciencenews.com/feed/',
      },
      { displayName: 'Neuralink', handle: 'Neuralink', kind: 'youtube' },
    ],
  },
  {
    description:
      '创业与融资动态：TechCrunch、Crunchbase News 融资报道，CB Insights、PitchBook 与 Y Combinator 的 X 动态。',
    name: '融资包',
    sources: [
      {
        displayName: 'TechCrunch Funding',
        kind: 'feed',
        sourceType: 'rss',
        sourceUrl: 'https://techcrunch.com/category/startups/feed/',
      },
      {
        displayName: 'TechCrunch Startups',
        kind: 'feed',
        sourceType: 'rss',
        sourceUrl: 'https://techcrunch.com/category/startups/feed/',
      },
      {
        displayName: 'Crunchbase News',
        kind: 'feed',
        sourceType: 'rss',
        sourceUrl: 'https://news.crunchbase.com/feed/',
      },
      { displayName: 'TechCrunch', kind: 'x', xUsername: 'TechCrunch' },
      { displayName: 'CB Insights', kind: 'x', xUsername: 'CBinsights' },
      { displayName: 'PitchBook', kind: 'x', xUsername: 'PitchBook' },
      { displayName: 'Y Combinator', kind: 'x', xUsername: 'Ycombinator' },
    ],
  },
];
