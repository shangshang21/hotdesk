# 热点工坊 Hotdesk 0.1

本地优先、Agent 可调用的热点内容生产工作台。当前版本以流程可用为重点，未固定账号画像或细分领域，没有自动发布功能。

> 📖 **核心架构与原理深度文档**：请参考 **[`WORKFLOW_ARCHITECTURE.md`](./WORKFLOW_ARCHITECTURE.md)**。详细阐述了自媒体“爆款营销号流”运作逻辑、Local-first 与 Node.js 24 SQLite 架构、Fact/Opinion Pack 双层解耦、**跨平台防风控与图文指纹隔离机制（SimHash 解耦 + `D:\营销号图片` 专属图库隔断 pHash）**、**每日硬核深度专题（1500~2500字）与全球科技/宏观推演流水线（黄仁勋/存储三巨头监控、海外人物影响评级矩阵、传导链模型与合规免责声明）**，以及端到端实战案例。

**已跑通：真实 百度实时热搜 / B站热门 → 投稿简介与评论样本 → 初筛 → 事实素材 (Fact Pack) → 网友讨论 (Opinion Pack) → 角度标题 → 今日头条/企鹅号/百家号三版 → 检查 → 真实新闻配图引擎 → 待人工审核导出。**

这是可运行的流程版，采集平台覆盖仍有明确边界，见下表。页面有真实运行记录，不会把受阻请求显示成已抓到数据。

## 启动与停止

本机依赖已安装，可直接双击 `Start.cmd`。打开 **http://127.0.0.1:4317**。

- `Start.cmd`：后台启动服务并打开浏览器；已有服务时复用。
- `Stop.cmd`：仅停止由本项目启动器记录且身份匹配的 Node 服务；保留数据。
- 启动器只运行进程级 PowerShell 参数，不修改系统执行策略。

换机器需要 **Node.js 24+**：

```powershell
npm ci
npm run setup:agents
npm start
```

`npm start` 在当前终端运行，Ctrl+C 停止。服务仅监听 `127.0.0.1`。

GitHub 仓库只包含源码、启动器、说明和公开素材样例，不包含本机 `data/`、密钥、依赖目录或带本机绝对路径的 Agent 配置。克隆后首次启动会创建空的本地数据库；运行 `npm run setup:agents` 生成适合当前机器的配置。下文提到的既有热点和生产记录属于本次本机验收数据，克隆仓库不会自动带入；公开样例保存在 `examples/`。

## 实际使用

1. 左侧选 百度实时热搜、B站或贴吧，点「发现热点」；也可手动添加选题。
2. 打开一个热点，在「素材采集」粘贴原始报道/帖子/视频链接；也可以搜索帖子再选择采集。无法自动读取的平台，使用「导入可见正文/评论」或让有浏览器工具的 Agent 导入。
3. 点击「交给 Agent 继续」，把指令交给已接入项目的 Agent。看板每四秒同步一次结果。
4. 工序依次显示：素材采集、热点初筛、事实素材、网友讨论、角度与标题、正文生产、成稿检查。
5. 选角度、编辑 JSON 结果、重跑某一步均会使相应下游失效，旧版本仍可在「过程与版本」查看。失败的编辑不会覆盖旧结果。
6. 导出 Markdown 可在人工确认前进行，但文件会标记待审核。人工确认只记录本地状态，不发布。

建议先查看完整实战案例 **「爱知·名古屋亚运会男单决赛：林诗栋4-0王楚钦夺冠」**（详见 `work/wang_chuqin_review.md` 及 [`WORKFLOW_ARCHITECTURE.md`](./WORKFLOW_ARCHITECTURE.md)），该案例完整演示了核心事实失误放大（第3局10-8领先遭逆转）、阵营对立情绪挖掘、真实官方新闻配图与头条/企鹅/百家号三平台成稿。也可打开 `examples/` 中的 **「蛙跳爬泰山」** 查看基础流程。

## 跨平台防风控与全球深度推演体系

### 1. 跨平台防风控与图文指纹隔离（Anti-Risk Control & Fingerprint Isolation）
- **痛点与算法机制**：各大平台算法采用文本 SimHash 与图片 pHash 联动识别跨平台矩阵。浅层微调词汇及混用同一套配图，极易被判定为“矩阵低质搬运”，导致冷启动推荐流被腰斩。
- **文本叙事结构绝对解耦**：
  - **今日头条（极速争议流·短句前置开火）**：3 秒内直击刺眼赛果与失误，短句密集爆破，激化两派矛盾，引爆评论区二选一站队；
  - **腾讯企鹅号（纪实故事流·人物命运与时代挽歌）**：特稿笔法刻画微表情与关键时刻心态崩解，新老交替残酷宿命，反思饭圈乱象；
  - **百度百家号（权威专业流·技战术复盘与长尾词布局）**：严谨交代官方时空信源，深度拆解正反手战术与攻防数据，前瞻性铺设百度搜索高权重长尾词条；
  - 三版本文本 SimHash 汉明距离 $\Delta \ge 20$，完全独立生成。
- **专属分流配图库机制（D:\营销号图片）**：
  - 物理路径分流：`D:\营销号图片\toutiao\`、`penguin\`、`baijiahao\`；
  - 视觉调性分化：头条专属高对抗与冲突表情、企鹅专属人物命运特写与空镜、百家专属官方全景与数据统计图；彻底隔绝视觉 pHash 碰撞。

### 2. 每日硬核深度专题与全球科技/宏观情报推演（Daily Deep Dive & Global Tech/Macro Deduction）
- **每日深度专题（Daily Deep Dive）**：打破单一快餐争议，每日固定排期输出 1~2 篇 1500~2500 字深度长文，进行全景历史坐标、微观利益博弈与逻辑架构拆解。
- **全球科技与半导体产业链全景监控**：
  - **黄仁勋（Jensen Huang / 英伟达）**：GPU 产能配额（CoWoS 封装瓶颈）、封仓停供预期、Blackwell/Rubin 架构迭代与出口管制对冲；
  - **存储半导体三巨头（三星、SK海力士、美光）**：HBM 产能虹吸导致 DDR5/SSD 产能紧缩、原厂减产挺价与国内硬件暴涨传导；
  - **上游先进制程与 AI 算力基建**：ASML 光刻机交付、台积电先进制程代工涨价、Sam Altman / OpenAI 算力中心扩张。
- **海外重量级人物与事件影响评级体系（Impact Rating Matrix）**：
  - **人物权重层级**：Tier 1（黄仁勋/马斯克/特朗普/美联储主席）、Tier 2（美国商贸财长/Sam Altman/库克/纳德拉等）；
  - **产业冲击评级**：S 级（全球供应链断裂/硬件暴涨潮）、A 级（行业格局重组/国产替代风口）、B 级（短期情绪扰动）；
- **产业微观传导链与情景推演**：
  - 传导路径：`海外管制/产能收紧/巨头表态 ──▶ 国内硬件市场映射（显卡溢价/内存暴涨/算力租金） ──▶ 国内自主替代机遇 ──▶ 微观落地应对`；
  - 情景矩阵：基准情形（Baseline）、极限施压（High-Tension）、替代分流（Resilience），不预测绝对事实，推演因果链条。
- **平台合规免责声明机制**：
  - 机器审查员强拦截：凡涉及宏观/半导体推演，必须嵌入标准化免责声明，坚决杜绝金融炒作与政策误读。

## 数据源能力与当前现场状态

| 数据源 | 已实现 | 2026-09-28 现场状态 |
|---|---|---|
| 百度实时热搜 | 原生实时热搜榜爬虫（`top.baidu.com/board?tab=realtime`）、标题/摘要/排名解析与落地检索 | 实测全成功，稳定抓取 Top 实时热搜榜，支持一键创建选题 |
| B站 | 热门列表、BV 链接投稿简介、热门评论有限采样；关键词搜索适配器 | 热门、简介、三条评论采集成功；关键词搜索返回 HTTP 412 |
| 百度贴吧 | 热议榜、公开帖可见楼层解析、搜索结果解析 | 热议榜成功；搜索 HTTP 403；测试热议页未取得帖子正文。楼层解析仅在本地样例验证，不能称全站实测通过 |
| Reddit | 热门、关键词搜索、帖子及顶层评论；可读 `REDDIT_ACCESS_TOKEN` | 匿名访问出现 HTTP 403 / DNS 失败，授权访问未验证 |
| 小红书 | 公开分享页正文尝试、浏览器搜索入口、实际可见正文和评论导入 | 私有签名搜索/评论接口不在本版中；完整自动采集未实现。公开探索页仅为页面外壳，不算正文成功 |
| TrendRadar | 只读导入现有 `output/news/*.db`，保留排名历史 | 依据上游 schema 实现，并通过兼容数据库样例验证；未安装/启动完整 TrendRadar。默认 NewsNow 上游现场 HTTP 403 |
| 原生 RSS / RSSHub | 可配置 RSS/Atom 解析、原始响应存档；本地 RSSHub 可显式 allowLocal | 解析和导入测试通过；未部署 RSSHub 实例，需用户配置可用路由 |
| 公开 Web 原文 | HTML 正文抓取、原始响应和来源保存 | 为 Research 提供 URL 采集；公开 Web 搜索由外部 Agent 的搜索工具执行。本程序未绑定商业 Web 搜索 API |

采集器是本项目独立实现，没有引入或复制 MediaCrawler 代码，没有修改 TrendRadar/RSSHub 核心源码。它们均按外部接口/文件接入。平台可访问性、授权条件与页面变化仍独立存在。

默认每次导入 12 条热门（最多 50），单次响应最多 3MB，每域请求至少间隔约 1.2 秒。评论是有限样本，不是全站舆情。B站视频仅取标题/简介，未实现转写或看视频。

## Agent 接入

项目提供同一套 **16 个 MCP 工具** 和对应 CLI。SQLite 数据位置由服务器脚本所在目录决定；从不同客户端工作目录启动仍指向本项目 `data/`，除非明确设置 `HOTDESK_DATA`。

已在本项目生成：

| 客户端 | 项目配置 |
|---|---|
| Codex | `.codex/config.toml` + `.agents/skills/hotdesk/SKILL.md` |
| Claude Code | `.mcp.json` + `.claude/skills/hotdesk/SKILL.md` + `CLAUDE.md` |
| Antigravity | `.agents/mcp_config.json` + `GEMINI.md` |

这些配置包含本机 Node 和服务入口绝对路径，且不包含密钥。**没有更改全局客户端设置，也没有替你接受客户端信任提示。** 在相应客户端打开本项目目录并按其正常项目加载流程连接即可。已验证标准 MCP SDK 客户端的真实 stdio 握手、发现、领取、提交；尚未逐个启动三种客户端验证加载与模型调用，因此不宣称“三款全部端到端验收”。CLI 可作为统一后备入口。

目录移动时，配置里的旧绝对路径需要更新。`setup:agents` 会保护已有不同配置，不会静默覆盖；请查看脚本输出后调整本项目的 `hotdesk` 条目。

官方配置依据：[Codex MCP](https://developers.openai.com/codex/mcp)、[Claude Code MCP](https://code.claude.com/docs/en/mcp)、[Antigravity MCP](https://antigravity.google/docs/mcp)。

给 Agent 的示例：

> 使用 hotdesk 工具处理我选中的话题。先查看素材，必要时补充公开来源，再领取下一工序并按约定提交结果，连续推进到成稿检查。把中间结果写回看板，不要发布。

### CLI

```powershell
node src/cli.mjs tools
node src/cli.mjs list_topics
node src/cli.mjs claim_task --file input.json
node src/cli.mjs submit_result --file result.json
node src/cli.mjs export_draft --file input.json --out review.md
```

领取任务 `input.json`：

```json
{"topic_id":"替换为真实话题ID","actor":"你的Agent名称"}
```

返回中含 `claim_id`、`basis`、20 分钟有效期、完整任务资料和 `output_example`。提交必须带同一租约和版本指纹。新增资料、暂停、重跑、修改上游会使旧租约失效。完成后再领取下一步即可；写入不需要运行网页服务。

### 可选独立模型模式

默认是外部 Agent 驱动，不需要单独的模型 API key。它允许当前 Agent 使用平台生产内容；不等于关闭所有 Agent 后仍会自己写稿。

如需在网页点击按钮后由本程序自己调用模型，将 `.env.example` 复制为 `.env`，填写 `HOTDESK_MODEL_ENDPOINT`（完整兼容 `chat/completions` URL）、`HOTDESK_MODEL` 和 `HOTDESK_MODEL_KEY`，重启服务。

- 每次最多推进 6 个 AI 工序；每步 120 秒超时、输出上限 6000 tokens、输入文本预算 180000 字符。
- 初筛建议观察/跳过时，独立模型模式停止自动 Research；可由 Agent 手动决定后续。
- 不自动无限重试，不自动购买额度，不把密钥存进 SQLite、草稿或 MCP 配置。
- 该模式只分析已采集材料；尚未配置真实模型并做现场调用验证，不能据此声称完全无人值守。

## 数据、追溯与版本

`data/hotdesk.sqlite` 存放话题、素材、来源修订、榜单观察、工序版本、任务租约、配置和运行记录。`data/raw/<sha256>.txt` 保存原始响应/导入材料。备份整个 `data/`，复制前先停止服务和 MCP 客户端，避免遗漏 SQLite WAL 中的近期写入。

- `Fact Pack` 逐条区分 confirmed/disputed/unknown。非 unknown 主张必须有原文连续引文；评论和热榜不能直接作事实证据。
- `Opinion Pack` 的观点必须引用真实 comment 素材。没有评论则明确 insufficient。
- `Writer` 输出三个必需平台；事实/观点/分析段有对应引用，unknown 主张不能进稿。
- 验证器检查结构、ID、引文存在性和流程版本；**不会证明语义蕴含或绝对真实性**。审稿步骤和人工判断仍有必要。
- 相同规范化 URL/近期相同标题保守归并，不同标题的同一事件由 Agent 判断后调用 merge_topics 或在 UI 合并。没有宣称全自动语义聚类已经解决。
- 热度变化只比较实际收集到的同平台排名；缺历史时是未知。首次发现是系统时间，不能等同事件首次发生。
- UI 的编辑结果目前为 JSON 编辑器，适合流程验证；精美前端、富文本编辑、账号画像及反馈分析留到后续。

## 验证与代码结构

```powershell
npm test
npm run check
```

自动化测试覆盖完整状态流转、重复导入、失效与保留、来源/引文检查、租约互斥、暂停继续、只读 TrendRadar 导入、RSS/Atom、HTTP 会话限制、编辑失败不丢稿、标准 MCP 跨进程操作。所有测试数据写在本工作区 `work/hotdesk-tests/`，不会使用生产 `data/`。

`examples/live-run-evidence.json` 是本次实际 MCP 工序记录；`examples/live-review-draft.md` 是导出的审核样稿；`examples/live-run-results.json` 是本次 Codex 依据真实资料写出的工序输入，**不是应用运行时内置的假 AI 生成器**。

主要代码：`src/store.mjs`（SQLite/版本）、`src/adapters.mjs`（独立采集）、`src/pipeline.mjs`（资料包合同/校验）、`src/tools.mjs`（共用工具）、`src/mcp.mjs` / `src/cli.mjs`、`src/server.mjs` / `public/`、`src/worker.mjs`（可选模型运行器）。

当前没有：自动发布、定时全平台爬取、登录/验证码代办、账号数据分析、PostgreSQL、复杂 CMS。配图方案坚守真实官方新闻媒体直链（News Photo Engine），坚决不用 AI 虚假生图以防平台风控限流。这些不会以占位成功状态混入第一版。
