# Spec

## 背景

主题包机制上线后仅有 1 个种子包（AI 消息，22 源）。产品希望内置 5 个主题包覆盖细分领域（论文 / 机器人 / 脑机 / AI / 融资），其中机器人、脑机、AI、融资四个主题的针对性内容源不足，需要补充 YouTube / X / RSS 源。同时管理端主题包列表存在横向滚动条（名称列展示全部描述导致过宽），操作列的上移/下移价值低，缺少包详情查看。

## 目标

1. **内置 5 个主题包**（种子迁移）：
   - 「论文包」= 原「AI 消息」包改名（22 源成员不变）
   - 「AI 包」「机器人包」「脑机包」「融资包」新建，成员 = 相关现有源复用 + 新增针对性源（见候选清单）
2. **新增内容源**（ensure 幂等）：X 账号（浏览器轮询）、YouTube 频道（resolve 后以 feed URL 入库）、RSS
3. **管理端 UI**：
   - 包列表名称/描述列单行省略号截断，消除横向滚动条
   - 操作列删除「上移/下移」，新增「查看详情」→ 弹层展示包详情（名称/描述/启停/成员源列表带平台徽标）

## 非目标

- 不改主题包机制本身（spec-024 已定）
- 不改用户端选择逻辑
- 推送到 IM 的 author 署名、README 品牌等站外文案不动
- 融资包不添加 YouTube 源（无优质频道，RSS+X 已覆盖）

## 种子内容清单（候选，用户可删改）

### 论文包
= 原「AI 消息」改名，成员不变（22 源）。

### AI 包
- 复用现有源：OpenAI News、Anthropic News、Google AI、DeepMind、Meta AI、xAI News、Mistral、Stability、HF Blog、Moonshot、AI2、Techmeme、Hacker News、Reddit r/LocalLLaMA、量子位、GitHub Trending
- 新增 X：`@sama`（Sam Altman）、`@Karpathy`（Andrej Karpathy）、`@ylecun`（Yann LeCun）、`@DrJimFan`（Jim Fan，兼机器人）、`@swyx`（AI 工程评论）、`@AnthropicAI`、`@GoogleDeepMind`、`@xai`（官方号）
- 新增 YouTube：`@TwoMinutePapers`、`@AIExplained`、`@YannicKilcher`

### 机器人包
- 新增 X：`@BostonDynamics`、`@Tesla_Optimus`、`@unitreerobotics`（宇树）、`@agilityrobotics`、`@DrJimFan`（共用）
- 新增 YouTube：Boston Dynamics 官方频道、`@jamesbruton`（机器人 DIY）
- 新增 RSS：The Robot Report（`https://www.therobotreport.com/feed/`）

### 脑机包
- 新增 X：`@neuralink`、`@synchron`
- 新增 RSS：PubMed 检索订阅（`https://pubmed.ncbi.nlm.nih.gov/rss/search/brain-computer+interface/?limit=20`）
- 新增 YouTube：Neuralink 官方频道（更新频率低，可接受）

### 融资包
- 新增 RSS：TechCrunch Funding（`https://techcrunch.com/category/funding/feed/`）、TechCrunch Startups（`https://techcrunch.com/category/startups/feed/`）、Crunchbase News（`https://news.crunchbase.com/feed/`）
- 新增 X：`@TechCrunch`、`@CBinsights`、`@PitchBook`、`@Ycombinator`

> 新增源共 29 个（X×18、YouTube×6、RSS×5）。X 源走浏览器轮询（服务器已配代理），轮询时长随账号数线性增长（23 → ~35+），spec-024 已有单周期解析缓存，不影响正确性；轮询间隔可在设置页调整。

## 种子机制

- 扩展 `seedSourcePacks`（幂等）：
  1. 存量「AI 消息」包 → 改名「论文包」（成员不变，仅首次执行）
  2. 逐条 ensure 种子源存在（X 按 xUsername、YouTube 走 `resolveYoutubeChannel` 解析为 feed URL、RSS 按 sourceUrl 去重；已存在跳过）
  3. 创建 4 个新包并挂成员（同名包跳过）；描述按主题撰写
- YouTube 解析失败（网络）→ 记日志跳过该源，下次启动重试；不阻塞其余种子
- 任何单条源失败（含 YouTube 解析）不影响其余种子与建包；包允许部分成员创建，缺失成员下次启动重试
- 每个启动周期对已存在的内置包补挂缺失的种子成员：内置包跟随种子收敛到完整成员（管理员从内置包删除的种子成员会在重启后被重新补挂，这是有意语义，见 rework.md）；管理员的非内置包完全不动
- 管理员可随后自由增删（种子不覆盖管理员对包属性与非内置包成员的修改）

## UI 细节

- 包列表名称列/描述列：`text-overflow: ellipsis` 单行截断（不换行、不出横向滚动）
- 操作列 = 「查看详情」「编辑」「删除」「启停开关」；查看详情为只读弹层（名称、描述、启停、成员源列表：来源中文友好名 + 平台小标，复用 source-labels）
- 上移/下移逻辑与 sortOrder 字段保留在数据层（用户端排序仍生效），仅 UI 入口删除

## 边界条件

- 新增源首轮按 spec-009 锚定（不入库不推送），不轰炸用户
- X 源轮询失败（网络/风控）不影响其它源；管理员可手动禁用单个源
- 种子重复执行：不重复建源/建包/改包名（幂等）
- 用户已选旧「AI 消息」包的 → 改名后仍指向同一包（id 不变），无感

## 技术约束

- YouTube 解析仅在 seed 内调用现有 resolver；失败不阻塞启动
- X 源新增通过现有 xUsername 存储，不改抓取实现
- 不新增运行时依赖

## 验收标准

- [ ] 重启后：论文包（原 AI 消息改名）+ 4 个新包齐全；新源按清单入库并挂包
- [ ] 种子重复执行幂等（不重复建源/建包/改名）
- [ ] 包列表无横向滚动条（长名称/描述省略号）
- [ ] 操作列无上移/下移；「查看详情」弹层正确展示包信息与成员源
- [ ] 用户端可选 5 个包（按包订阅语义不变）
- [ ] `npm run typecheck` + `npm run smoke:e2e` 通过（smoke 补种子幂等/改名断言）

## 待确认问题

- [x] 种子源清单为候选方案，用户确认/删减后实施
- [x] 新增源首轮锚定不推送（沿用 spec-009）
