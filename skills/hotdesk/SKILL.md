---
name: hotdesk
description: Produce Hotdesk hotspot content from discovery through sourced research, reader-focused angles, three platform drafts, verified real images and a copy/paste handoff ZIP. Use for Hotdesk production tasks, not ordinary writing outside this project.
---

# Hotdesk production

**Read `AGENT_RULES.md` (or call the `get_rules` tool) first. It is the canonical rule set shared by every agent; server validation enforces it.** Key hard rules: never invent sources, links, comments or numbers (agent imports are re-checked against the live page); benchmark articles teach structure, never sentences (20-char copy check); each draft needs ≥3 information increments; images only from the source article body.

Use the `hotdesk` MCP tools if connected. Otherwise run the project CLI from the Hotdesk root: `node src/cli.mjs tools` and `node src/cli.mjs <tool_name> --file input.json`. Write UTF-8 JSON files for complex inputs on Windows. Data resolves relative to the installed server script, not the client's current directory. `HOTDESK_DATA` can explicitly select a different workspace.

## Operate an existing topic

1. `list_topics` / `get_topic` show the shared queue, sources, current stage, versions, and events. Preserve human edits; don't reset completed stages merely to apply your own style.
2. If `next=collect`, gather actual source material with `collect_url` or `import_sources`. Search only the requested platforms/topics. Public search/browser tools available in your host can supplement blocked adapters. Import only content you actually read, with original URLs, platform, kind, and sampling notes. A hotlist title isn't substantive research material.
3. `claim_task` returns a 20-minute lease, current `basis`, stage instructions and output example. Generate that stage's JSON using the provided sources. Do not invent source IDs, comments, statistics, or growth scores.
4. `submit_result` needs `topic_id`, `stage`, `actor`, `claim_id`, `basis`, and `content`. State the real Agent/model identity you know; don't guess a model version. A stale basis or lease requires fetching fresh context; do not reuse the old answer blindly.
5. When asked to produce a topic, continue autonomously through the default handoff below; do not ask the user to choose routine angles, repeat these preferences or assemble files. Preserve explicit requests to stop at an earlier stage. Final `done` means review artifacts exist, not human approval or a complete image handoff.

## Default production and handoff

The user wants to copy platform text and upload prepared pictures manually. Default targets are `toutiao`, `penguin`, `baijiahao`; follow explicit overrides. Do not fix an industry or audience age. `get_task` supplies the maintained `production_policy`, schemas and examples. Read them rather than inventing fields.

- Editor: record `reader_entry` (new event/data/progress, target reader, concrete stake, actual source IDs, unanswered questions). A famous person alone does not make a good topic. Clearly date old background; don't manufacture urgency.
- Research: answer the reader's unanswered questions with background, mechanisms, concrete examples, counterevidence and consequences. Reprints of the same platform release are not independent corroboration. Every `essence` needs confirmed `fact_ids` and a `boundary`; don't invent collective motives. Mine quotable lines: record interviewees'/experts' exact words as facts (claim names the speaker, quote holds the verbatim line) so drafts can cite them with attribution. Optional `foreign_parallels` (max 1): a structurally similar foreign case with a mechanism mapping and what it means for Chinese readers — leave empty if that layer does not land. For causal analysis, fill `causal_chains` and conditional `scenarios` with fact IDs, mechanism, evidence gaps, observable indicators and invalidators.
- Angles: provide `reader_promise`, `core_contrast`, `template` and `fulfillment`. Choose the strongest supported angle when the user has not selected one; respect an existing human selection.
- Writing: the three profiles are experiments, not proved platform demographics. Toutiao uses result/contrast/detail/disagreement; Penguin uses verifiable scene/causes/choice/consequences; Baijiahao answers a concrete question with evidence and boundaries. Rewrite the title, opening and reader question, not just synonyms. Keep information substantial and expression accessible; length follows the material, not a compulsory daily longform quota. Titles require refs. The project's Toutiao title cap is 30 characters.
- Style (`production_policy.style`): this is social-media prose, not a research memo. Open with a concrete contrast/conflict within the first three sentences (never a definition, lecture, or abstract question); include at least one specific person/place/scene per article (fact-backed); end with a take-a-side question, not consumer advice. Do not pad heat with inflation words (`style.banned_words`).
- Brand restraint (server rejects violations): a commercial platform named as a data provider may appear at most once per draft (`brand_cap`; exempt when the brand is the topic itself). Cite it once with its data scope, then refer to "the platform data". Organize the article around travelers, scenes and the phenomenon — not around the platform's data report.
- Hedge restraint (server rejects violations): hedge phrasings like "不能证明/不代表/不能直接推出" appear at most twice per draft (`hedging_cap`). State the boundary naturally at most once; never stack caveats paragraph after paragraph.
- Secondary analysis (server rejects violations): quote interviewees with attribution ("晚点LatePost采访的一位从业者说……") and Fact refs. Long verbatim runs (≥20 chars identical) stay under 20% of the draft (`quote_cap`); numbers and short phrases may be quoted directly, everything else must be rephrased — the increment is original analysis, not rehash. A `foreign_parallels` entry may appear at most once, in at most three sentences, landing on what it means for Chinese readers, then return to the domestic mainline.
- Discussion follows the actual sample: two views, multiple interests or an unanswered question. Never invent opposing camps, inner thoughts, netizen quotes or total-public-opinion claims.
- Each multi-platform draft needs a distinct `reader_question`, answered through different information order, examples or explanatory emphasis. Concept paragraphs need confirmed fact refs. Keep units intact: ticket volume is not ticket price; booked users are not orders; searches are not visitor counts. A new title and a few synonyms do not make a different article.
- Images: inspect actual downloaded pixels and verify identity, event/time and source before `collect_image`. Fill `image_type`, `seen_description`, `article_relation`; for a text card include `visible_text` and an explanatory-card caption. Do not describe a text card as a real travel scene. Associate each image with its original article/post, accurate caption, credit and usage note. Background images must be captioned as background. Usually 1–3 relevant pictures per platform; do not force nine or use AI fake event photos.
- Save images before final review. New images invalidate Review; release any active lease before adding images. Review must inspect reader-promise fulfillment, title support, time boundaries, analysis evidence, platform differences and factual errors. For each image in the task fill `image_checks` with `image_id`, `sha256`, `visible_content` and `article_relation` after opening the real file. Correct a wrong stored description by collecting it again. Warnings may pass; hard errors must be revised.
- Call `export_publish_pack` after the reviewed drafts and pictures are complete. Its ZIP contains per-platform `标题.txt`, `正文.txt`, `插图说明.txt`, one shared `图片/` folder, a `配图需求单.txt` (per-slot placement, picture requirements, stock-library search keywords and avoid-list — the user picks licensed images in each platform's own editor library), a separate audit document and manifest. Complete exports update the fixed `data/上传图片/` folder and remove its previous generated images; incomplete exports leave it unchanged. Read `upload_images.directory` and `upload_warning` and deliver the folder path, too. Missing drafts/images or failed checks are incomplete, not success. No platform login or publication tool is needed for handoff.
- Deliver the ZIP link/path and a short account of the topic, chosen angle, source gaps and review state. User only needs to review, copy/paste and upload images. Do not mark human approval yourself.

## Optional performance feedback

When the user supplies real platform analytics, associate platform, angle, title type, length, impressions, clicks, reading completion and follows with the draft version. Missing metrics stay missing. Treat cross-topic comparisons as clues, not causal proof; do not invent results or infer CTR from rank. No analytics scraping or recurring schedule is authorized by default.

## Decision points

- Data acquisition failures are failures or partial results, not empty public opinion. Reddit may require an authorized API token; Xiaohongshu v0.1 does not implement private signed search/comment endpoints. Return useful source gaps if access is blocked.
- Before adding research material during an active lease, release it. New article/comment sources invalidate research onward; benchmark sources invalidate benchmark onward. Fetch fresh task context before continuing.
- Goal is click-through on timely hot topics. Find what is worth writing: origin, twists, details, numbers, conflicting sides. Keep `confirmed`, `disputed`, `unknown` distinct; quotes must be present in the referenced original text; unknown facts cannot enter drafts.
- Comments are a bonus, not a requirement. No comments means `insufficient` and empty arrays; keep going. With comments, mine disputes, opposing camps and punchy lines; attribute them as netizen views, never as facts.
- Choose 1–5 angles with 5–10 attention-grabbing titles each (question, take-a-side, twist, "netizens found…", number/detail). Titles may be dramatic in tone but must not invent events. Respect a user-selected angle.
- Default to the three platform profiles above. Fact and opinion blocks need refs; analysis/transition blocks may omit refs but must not add new facts. Keep audit notes separate from publishable text.
- `review` checks hard errors only: names, numbers, dates, quotes vs sources; netizen claims stated as fact; invented events; personal/regional/gender attacks or high-risk sensitive content. Hard errors are `error` → `revise`/`blocked`; minor issues are `warning` and may still pass. Use `info` to suggest punchier titles and openings.

## 💬 Gemini 对话式纯血 Skill 模式（免 Web、免 MCP、当前话题即开即用）

当用户在当前聊天窗口直接提出写自媒体文章需求（如“写篇今日头条文章”、“复盘这个热点”、“产出三平台稿件”）时，**完全不需要启动 Web 看板或外部 MCP 客户端**，直接激活本 Skill 作为纯智能体工作流：

1. **自动调度子智能体小队 (Tri-Agent Pro)**：
   - 派生 **Material Scout (素材与事实侦查员)**：通过宿主机静默网络/搜索获取真实一手新闻、大盘数据、公开报道（坚决杜绝 AI 凭空捏造数据）；
   - 派生 **Scholar Pro (Gemini 3.1 Pro 深度学者，Model="pro")**：深挖底层商业/博弈运行规律、客观经济账，将逻辑深度拉满；
   - 派生 **Viral Master (Gemini 3.1 Pro 爆款大师，Model="pro")**：捕捉人性欲望、避坑恐惧、开篇反常识冲突与痛点利益算账；
2. **心理学终极熔铸 (Master Agent)**：
   - 彻底剔除学者说教与冰冷学术名词，严格执行 **今日头条 Rule 25 平民化烟火气实战铁律**：
     - **标题严格 ≤ 30 字符，严禁使用感叹号**；
     - **前三句内必须见具体反差或冲突**；
     - **文风是“老江湖在路边摊吃串唠嗑”**：用生动的生活化比喻拉近距离；
     - **算清柴米油盐经济账**；
     - **单篇字数严格锁定在 800~1100 字黄金区间**；
     - **绝对禁绝 Markdown `**` 符号**（改用双引号“”或破折号——，避免平台富文本编辑器解析失真）；
     - **纯文本编号**（使用 `1、`、`2、`、`• `，杜绝不可复制的列表缩进）；
3. **平台分层定位**：
   - 今日头条：独享最高深度、平民烟火气与现实算账；
   - 腾讯企鹅号 / 百度百家号：极端反差争议引战，直接引爆评论区；
4. **极速配图需求单**：
   - 不再下载图片，文末输出官方正版图库关键词与画面描述，创作者在平台后台 2 秒一键检索插入；
5. **秒级交付**：
   - 直接在对话中交付完整可全选复制的正文与标题矩阵，同时自动备份写入本地 `data/`。

## Video Studio (短视频二创工坊 MCP 工作流)

Hotdesk 提供全套针对海外科技/游戏/演讲短视频的汉化二创自动化生产线与 MCP 工具：
1. `create_video_project({ title, url, file_path })`: 创建视频二创项目（传入本地 MP4 文件路径或视频源 URL）。
2. `get_video_project({ project_id })`: 获取项目当前工序、元数据与产物路径。
3. `separate_video_audio({ project_id })`: 调用 Demucs v4 彻底分离人声与现场伴奏/音效（路线 A：剥离消灭外语原声，提取纯伴奏/掌声/环境音）。
4. `transcribe_video_audio({ project_id })`: 调用 Faster-Whisper 毫秒级提取原始台词与绝对起止时间戳。
5. `rewrite_video_script({ project_id, segments: [{ start, end, en_text, zh_text }] })`: 写入/更新符合国内短视频网感的中文解说词（句式短促、信息密集、突出戏剧冲突）。
6. `synthesize_video_voiceover({ project_id, voice })`: 调用 Edge-TTS 生成微软神经语音配音，并通过 `atempo` 算法自适应微加速嵌合原片时间轴。
7. `mix_video_audio({ project_id })`: 执行 EBU R128 (-14.8 LUFS) 广播级母带压限混音（伴奏衰减至 35%，解说提升至 135%）。
8. `render_video_master({ project_id, mask_orig_sub })`: 压制 1080P MP4 母带成片，并自动在剪映目录导出 4 轨独立草稿工程（视频原画、纯净伴奏、中文配音、智能字幕）。

Use the root README for setup and supported adapter boundaries. The stage instructions and `output_example` returned by `get_task` are the maintained output contracts; do not duplicate a competing schema.
