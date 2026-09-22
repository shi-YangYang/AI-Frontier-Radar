# Spec

## 背景

用户绑定端的消息页（`/portal` -> 消息）目前只有搜索和分页，帖子多时难以按类型浏览。产品希望在帖子列表增加**分类筛选**。

**用户决策（已确认）**：
- 分类维度 = **平台类型**：X / YouTube / 官方博客 / 论文 / 社区榜单
- 呈现形式 = **筛选标签栏**（单选，与搜索叠加，与分页联动）

## 目标

1. 消息页帖子列表顶部增加分类标签栏：`全部 ｜ X ｜ YouTube ｜ 官方博客 ｜ 论文 ｜ 社区榜单`
2. 点选分类后，列表按帖子**来源的平台类型**过滤（服务端过滤，正确联动分页计数）
3. 与现有搜索叠加：搜索 + 分类同时生效（AND 关系）
4. 分类信息由后端计算并随每条帖子返回，前端只渲染

## 非目标

- 不做管理端消息页的同类改动（另行决策）
- 不做"按主体/公司"维度（需先补源的主体标签，成本高）
- 不改帖子卡片本身的展示结构（不加分页徽标）

## 当前行为

- `GET /user/api/posts?page&pageSize&query`：按作者/内容搜索 + 分页；每条 post 已带 `sourceType`（来自源账号行）
- 无任何按来源类型的过滤能力

## 目标行为

### 分类体系（后端为唯一权威）

新增 `sourcePlatformCategory(sourceType, sourceUrl)` → `'x' | 'youtube' | 'blog' | 'paper' | 'community'`：

| 分类 | 归类规则 |
| --- | --- |
| `x` | sourceType='x' |
| `youtube` | sourceUrl 为 youtube.com feeds（spec-027 起 YouTube 频道以 feed URL 入库） |
| `paper` | arxiv.org、hf_papers 类型、PubMed 检索订阅（pubmed.ncbi.nlm.nih.gov/rss） |
| `blog` | 官方博客 provider 类型（ai2_blog / anthropic_news / meta_ai_blog / moonshot_blog / xai_news）+ 官方/媒体域名 RSS（openai、deepmind、google、mistral、stability、huggingface blog、qbitai 等） |
| `community` | hnrss、reddit、producthunt、techmeme、github |
| 兜底 | 其余 rss → `blog` |

### 后端（user-controller 消息接口）

- `GET /user/api/posts` 新增：
  - 每条 post 返回 `platformCategory`（按其来源账号的 sourceType + sourceUrl 计算）
  - 查询参数 `category=x|youtube|blog|paper|community`（可选）：服务端按来源分类过滤帖子与分页计数（join 源账号后按分类过滤）
- 非法 category 值忽略（等同全部）

### 前端（PortalPage 消息页）

- 搜索表单下方渲染分类标签栏：单选 pill（选中态 accent），默认「全部」
- 切换分类 → 回到第 1 页重新请求（携带 `category` 参数）；与搜索框组合（AND）；翻页保持当前分类
- 固定显示 5 个分类（不隐藏空分类），空分类点击显示空态
- 长文展开状态在切换分类时重置（与翻页/搜索行为一致）

## 边界条件

- 分类与搜索组合：AND 关系，结果为空显示现有空态文案
- 来源被删除的帖子：来源信息缺失 → 兜底归 `blog`（与现有 `sourceType ?? 'x'` 兜底风格一致，以实现时的归类函数为准）
- 分类枚举扩展（未来新增平台）只改归类函数与 i18n，不改接口结构

## 技术约束

- 后端：`user-controller.ts`（消息查询 + 分类计算/过滤）；归类函数放服务端共享位置（`src/config/source-groups.ts` 或相邻模块），不新增依赖
- 前端：`PortalPage.vue` + `i18n.ts`；分类标签栏复用现有 segmented/状态徽标样式语言
- 不改 admin 端

## 兼容性要求

- 接口仅新增可选返回字段与可选查询参数，旧前端无回归
- 既有搜索/分页行为不变

## 验收标准

- [ ] 消息页出现分类标签栏（全部/X/YouTube/官方博客/论文/社区榜单），默认全部
- [ ] 点选分类后列表正确过滤、分页计数正确；与搜索叠加正确；翻页保持分类
- [ ] 每条 post 的分类与来源平台一致（X 源→X、YouTube 频道→YouTube、arXiv→论文、HN→社区榜单）
- [ ] i18n 中英齐全
- [ ] `npm run typecheck` + `npm run smoke:e2e` 通过；smoke 补分类过滤用例（≥2 项）

## 待确认问题

- [x] 维度=平台类型、形式=筛选标签栏（用户已确认）
- [x] 中文媒体（量子位等）归入「官方博客」标签（归类函数兜底规则，可后续调整清单）
