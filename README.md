# 热点工坊 Hotdesk 0.1

本地优先、Agent 可调用的热点内容生产工作台。当前版本以流程可用为重点，未固定账号画像或细分领域，没有自动发布功能。

**已跑通：真实 B站热门 → 投稿简介与评论样本 → 初筛 → 事实素材 → 网友讨论 → 角度标题 → 今日头条/企鹅号/百家号三版 → 检查 → 待人工审核导出。**

这是可运行的流程版，采集平台覆盖仍有明确边界，见下表。页面有真实运行记录，不会把受阻请求显示成已抓到数据。

## 默认生产方式（2026-09-29）

以后让接入本项目的 Agent 生产一个选题，默认完成「读者利益初筛 → 原始来源核实 → 真实讨论 → 自动选择有依据的角度 → 三平台分别写稿 → 核对并保存真实配图 → 最终审稿 → 交付 ZIP」。用户不必反复说明文风、平台或插图安排；明确指定范围和已有人工修改仍优先。完整操作规则维护在 `skills/hotdesk/SKILL.md`，每次工序资料也携带 `production_policy`。

- 今日头条用结果、反差与真实分歧切入；企鹅号用可核实的事件变化组织故事；百家号回答具体问题并解释证据。这是待验证的内容模板，不是固定年龄画像或流量保证。
- 标题吸引点击，但承诺必须在正文兑现。旧事不能写成“刚刚”；分析保留前提、依据、观察指标和失效条件。素材决定长度，不强制日更长文、二选一站队或固定领域。
- 每平台通常 1–3 张真实相关配图，保存图片文件、原文来源、图注、署名与使用说明；不凑九张，也不以改文件名/裁剪声称可以规避重复检测。公开来源不等于拥有转载许可，Agent 要核对适用的使用范围。
- 看板增加「交付包 / 标题正文与图片」：三个平台分别有复制标题、复制纯正文入口，并可下载 ZIP。ZIP 里的标题、正文不混入审核过程说明，来源与引用单独保存在审核资料和 manifest。
- `ready_for_handoff` 表示所选平台稿件、已核对图片及检查齐备；缺图、缺稿、未通过审稿或文件损坏会标为待补全。它不等于人工确认或已发布。用户看一遍后在平台手动粘贴并上传图片。

交付目录：

```text
toutiao/、penguin/、baijiahao/
  标题.txt
  正文.txt
  插图说明.txt
  images/                 # 可直接上传的图片文件
审核资料.md               # 来源和过程，与正文分开
manifest.json             # 稿件版本、图片哈希、来源与完整性状态
发布说明.txt
```

`collect_url` 可返回网页里的候选图片链接；候选图不代表已经核验。Agent 先查看并核对后调用 `collect_image`，再审稿，最后调用 `export_publish_pack`。新增图片使原审稿和人工确认失效，历史结果及图片记录保留。图片文件保存在 `data/images/`，交付文件夹及 ZIP 保存在 `data/publish-packs/`；它们不上传 GitHub。

本次验证使用明确标注的合成选题和测试 PNG，验证的是文件、版本与交付流程；并未把测试图当新闻配图，也未进行真实模型调用或账号发布。后续生产仍由已接入、具备实际搜索和看图能力的 Agent 执行。独立模型按钮目前只推进已有材料的六道文字工序，配图核验及完整交付由 Agent 补齐。

## 更新与历史验收记录

**Windows 上更新步骤**（顺序不要乱）：

1. `git pull` 拉取最新代码。
2. `npm ci` —— 安装锁定依赖，包括正文提取和 ZIP 打包所需的依赖。
3. 运行 `npm run setup:agents -- --refresh-skills`：先备份旧 skill 副本，再生成指向项目统一规则的入口。无需删除文件夹；后续更新会读取项目当前规则。脚本仍保护不同的 MCP 配置，不修改全局客户端设置。
4. 重启 Hotdesk（`Stop.cmd` → `Start.cmd`），并重启正在连接的 Agent 客户端。

**NewsNow 热榜**

- 要先双击 `Start-NewsNow.cmd`，看板里的「NewsNow · 微博/知乎/抖音…」才能用；没启动时会提示「连不上 NewsNow」。
- 首次运行需要 `git` 和能访问 GitHub、npm 的网络，安装和构建大约 5–10 分钟；之后秒开。占用端口 `4444`。
- 热榜只有标题和链接，正文要在「素材采集」里补（粘贴新闻链接或让 Agent 搜索）。
- Windows 启动脚本是照着现有启动器写的，还没在 Windows 上现场跑过；第一次如果报错，看 `data/newsnow.err.log`。

**采集**

- Clash/Surge 的 TUN fake-IP（198.18.0.0/15）可以采集；DNS 返回的地址逐个检查，不能因为其中存在 fake-IP 就放过同组内网地址。本地 RSSHub 仍需显式开启 `allowLocal`。
- 正文清理保留段落边界，按页面结构移除导航与推荐侧栏，仅清除已识别的独立尾部平台附注。新闻中出现“为你推荐”“相关阅读”“特别声明”等词，不会据此截断后文；无法明确识别的声明会保留。
- 正文提取改用 Readability 之后，**旧话题里已采集的素材不会自动变干净**。对同一链接重新「采集素材」即可覆盖更新（下游工序会失效重跑）。
- 部分站点正文靠 JS 渲染（如头条 trending 页、知乎），采集不到正文属正常，换一篇新闻原文链接即可。Reddit 必须配置 `REDDIT_ACCESS_TOKEN`，匿名请求会被 Reddit 拒绝（403），和网络环境无关。

**写稿与发布**

- 新规则追求点击，但**事实段仍必须引用素材原文**、unknown 不能进稿。标题可以夸张语气，不能编造没发生的事；“网友扒出”类标题要评论里真有这句话。
- 审稿的 `warning` 不拦截，但建议看一眼再发；`error` 必须改。
- 系统不会自动发布。发布前人工过一遍；按平台要求勾选 AI 生成内容相关声明，避免限流或被扣收益。
- 同一事件别在多个平台发几乎一样的稿子，容易被判同质化；多平台时让 Agent 分别重写标题和开头。

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

1. 左侧选 B站或贴吧，点「发现热点」；也可手动添加选题。
2. 打开一个热点，在「素材采集」粘贴原始报道/帖子/视频链接；也可以搜索帖子再选择采集。无法自动读取的平台，使用「导入可见正文/评论」或让有浏览器工具的 Agent 导入。
3. 点击「交给 Agent 继续」，把指令交给已接入项目的 Agent。看板每四秒同步一次结果。
4. 工序依次显示：素材采集、热点初筛、事实素材、网友讨论、角度与标题、正文生产、成稿检查。
5. 选角度、编辑 JSON 结果、重跑某一步均会使相应下游失效，旧版本仍可在「过程与版本」查看。失败的编辑不会覆盖旧结果。
6. Agent 完成配图和审稿后，用「交付包 / 标题正文与图片」复制或下载。缺少必要内容会列出待补项。Markdown 审核稿也可独立导出；人工确认只记录本地状态，不发布。

建议先打开 **「蛙跳爬泰山」**：它是本次真实链路验收样例，可以查看素材、评分、角度、三平台短稿、来源引用和版本。稿件只证明流程通了，尚未做文风/转化率优化，用户人工确认保持待办。

## 数据源能力与当前现场状态

| 数据源 | 已实现 | 2026-09-28 现场状态 |
|---|---|---|
| B站 | 热门列表、BV 链接投稿简介、热门评论有限采样；关键词搜索适配器 | 热门、简介、三条评论采集成功；关键词搜索返回 HTTP 412 |
| 百度贴吧 | 热议榜、公开帖可见楼层解析、搜索结果解析 | 热议榜成功；搜索 HTTP 403；测试热议页未取得帖子正文。楼层解析仅在本地样例验证，不能称全站实测通过 |
| Reddit | 热门、关键词搜索、帖子及顶层评论；可读 `REDDIT_ACCESS_TOKEN` | 匿名访问出现 HTTP 403 / DNS 失败，授权访问未验证 |
| 小红书 | 公开分享页正文尝试、浏览器搜索入口、实际可见正文和评论导入 | 私有签名搜索/评论接口不在本版中；完整自动采集未实现。公开探索页仅为页面外壳，不算正文成功 |
| TrendRadar | 只读导入现有 `output/news/*.db`，保留排名历史 | 依据上游 schema 实现，并通过兼容数据库样例验证；未安装/启动完整 TrendRadar |
| NewsNow（本地） | 微博/知乎/抖音/头条/百度/B站热搜等热榜 | 公共实例 HTTP 403；本机自建实测可用，见下文 |
| 原生 RSS / RSSHub | 可配置 RSS/Atom 解析、原始响应存档；本地 RSSHub 可显式 allowLocal | 解析和导入测试通过；未部署 RSSHub 实例，需用户配置可用路由 |
| 公开 Web 原文 | HTML 正文抓取（Mozilla Readability 提取正文，去导航/推荐/平台声明，失败回退整页文本）、原始响应和来源保存 | 为 Research 提供 URL 采集；公开 Web 搜索由外部 Agent 的搜索工具执行。本程序未绑定商业 Web 搜索 API |

采集器是本项目独立实现，没有引入或复制 MediaCrawler 代码，没有修改 TrendRadar/RSSHub 核心源码。它们均按外部接口/文件接入。平台可访问性、授权条件与页面变化仍独立存在。

默认每次导入 12 条热门（最多 50），单次响应最多 3MB，每域请求至少间隔约 1.2 秒。评论是有限样本，不是全站舆情。B站视频仅取标题/简介，未实现转写或看视频。

## 本地热榜：NewsNow（微博/知乎/抖音/头条/百度…）

公共 NewsNow 实例拒绝外部调用（HTTP 403），所以改为本机自建。[NewsNow](https://github.com/ourongxing/newsnow)（MIT）直接用 Node 运行，不需要 Docker。

- 双击 `Start-NewsNow.cmd`：首次会把 NewsNow `v0.0.42` 克隆到 `vendor/newsnow/` 并构建（约数分钟），之后秒开；服务只监听 `127.0.0.1:4444`。
- 双击 `Stop-NewsNow.cmd` 停止。升级/重建：`powershell -File scripts/Start-NewsNow.ps1 -Rebuild`。
- 看板「发现热点」下拉里选 `NewsNow · 微博热搜 / 知乎热榜 / 抖音热点 / 今日头条 / 百度热搜 / B站热搜 / 贴吧 / 虎扑 / 快手 / 豆瓣 / 澎湃`。默认地址 `http://127.0.0.1:4444/api/s`，可在「数据源设置」修改。
- 热榜只给标题和链接；正文由 Agent 在「素材采集」里补。
- 2026-09-28 在 macOS 用同样的 Node 流程实测：微博、知乎、抖音、头条、百度、B站热搜均返回 20–30 条，Hotdesk `discover newsnow:weibo` 导入成功。Windows 启动脚本按现有启动器写法编写，尚未在 Windows 上现场运行。

## Agent 接入

项目提供同一套 **18 个 MCP 工具** 和对应 CLI。SQLite 数据位置由服务器脚本所在目录决定；从不同客户端工作目录启动仍指向本项目 `data/`，除非明确设置 `HOTDESK_DATA`。

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

> 使用 hotdesk 工具处理我选中的话题。先查看素材，必要时补充公开来源，再领取下一工序并按约定提交结果，按默认规则连续推进到三平台稿件、已核对配图、最终审稿和完整交付包。把中间结果写回看板，不要发布。

### CLI

```powershell
node src/cli.mjs tools
node src/cli.mjs list_topics
node src/cli.mjs claim_task --file input.json
node src/cli.mjs submit_result --file result.json
node src/cli.mjs export_draft --file input.json --out review.md
node src/cli.mjs list_images --file input.json
node src/cli.mjs export_publish_pack --file input.json --out pack-result.json
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
- 该模式只分析已采集材料，不自动搜索、核验图片或完成 ZIP 交付；尚未配置真实模型并做现场调用验证，不能据此声称完全无人值守。完整交付由外部 Agent 按项目规则完成。

## 数据、追溯与版本

`data/hotdesk.sqlite` 存放话题、素材、来源修订、榜单观察、工序版本、任务租约、配置和运行记录。`data/raw/<sha256>.txt` 保存原始响应/导入材料。备份整个 `data/`，复制前先停止服务和 MCP 客户端，避免遗漏 SQLite WAL 中的近期写入。

- `Fact Pack` 逐条区分 confirmed/disputed/unknown。非 unknown 主张必须有原文连续引文；评论和热榜不能直接作事实证据。
- `Opinion Pack` 的观点必须引用真实 comment 素材。没有评论则明确 insufficient。
- `Writer` 默认输出今日头条、企鹅号、百家号三版，采用不同标题、开头和读者问题；追求具体问题、真实反差和有材料的分歧。事实段/网友说法段必须引用，分析与过渡段可不引用但不得夹带新事实；unknown 主张不能进稿。
- `Review` 只拦硬伤（事实错误、网友说法写成事实、编造、人身/地域/性别攻击、高危敏感）；warning 可通过，并用 info 给出更抓人的标题建议。
- 验证器检查结构、ID、引文存在性和流程版本；**不会证明语义蕴含或绝对真实性**。审稿步骤和人工判断仍有必要。
- 相同规范化 URL/近期相同标题保守归并，不同标题的同一事件由 Agent 判断后调用 merge_topics 或在 UI 合并。没有宣称全自动语义聚类已经解决。
- 热度变化只比较实际收集到的同平台排名；缺历史时是未知。首次发现是系统时间，不能等同事件首次发生。
- UI 的编辑结果目前为 JSON 编辑器，适合流程验证；精美前端、富文本编辑、账号画像及反馈分析留到后续。

## 验证与代码结构

```powershell
npm test
npm run check
```

自动化测试还覆盖三平台交付、图片与原文快照绑定、失效重审、文件校验、纯文本/ZIP、HTTP 图片和下载入口，以及以下原有能力：完整状态流转、重复导入、失效与保留、来源/引文检查、租约互斥、暂停继续、只读 TrendRadar 导入、RSS/Atom、HTTP 会话限制、编辑失败不丢稿、标准 MCP 跨进程操作。所有测试数据写在本工作区 `work/hotdesk-tests/`，不会使用生产 `data/`。

`examples/live-run-evidence.json` 是本次实际 MCP 工序记录；`examples/live-review-draft.md` 是导出的审核样稿；`examples/live-run-results.json` 是本次 Codex 依据真实资料写出的工序输入，**不是应用运行时内置的假 AI 生成器**。

主要代码：`src/production-policy.mjs`（默认打法）、`src/publish-pack.mjs`（配图与交付 ZIP）、`src/store.mjs`（SQLite/版本）、`src/adapters.mjs`（独立采集）、`src/pipeline.mjs`（资料包合同/校验）、`src/tools.mjs`（共用工具）、`src/mcp.mjs` / `src/cli.mjs`、`src/server.mjs` / `public/`、`src/worker.mjs`（可选模型运行器）。

当前没有：自动发布、定时全平台爬取、登录/验证码代办、图片视频生成、账号数据分析、PostgreSQL、复杂 CMS。这些不会以占位成功状态混入第一版。
