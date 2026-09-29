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
- Research: preserve factual boundaries. For causal analysis, fill `causal_chains` and conditional `scenarios` with fact IDs, mechanism, evidence gaps, observable indicators and invalidators. No need to force these into an unrelated topic.
- Angles: provide `reader_promise`, `core_contrast`, `template` and `fulfillment`. Choose the strongest supported angle when the user has not selected one; respect an existing human selection.
- Writing: the three profiles are experiments, not proved platform demographics. Toutiao uses result/contrast/detail/disagreement; Penguin uses verifiable scene/causes/choice/consequences; Baijiahao answers a concrete question with evidence and boundaries. Rewrite the title, opening and reader question, not just synonyms. Keep information substantial and expression accessible; length follows the material, not a compulsory daily longform quota. Titles require refs. The project's Toutiao title cap is 30 characters.
- Discussion follows the actual sample: two views, multiple interests or an unanswered question. Never invent opposing camps, inner thoughts, netizen quotes or total-public-opinion claims.
- Images: inspect actual images and verify identity, event/time and source before `collect_image`. `collect_url` may return image candidates; candidates are not vetted. Associate each chosen image with an existing article/post source, accurate caption, credit and usage note. Use own/authorized/reusable pictures with clear usage scope; a source URL alone does not grant reuse. Background images must be captioned as background, not current-event scenes. Usually 1–3 pictures per platform, fewer if appropriate; do not force nine or use AI fake event photos. Folders and similarity hashes do not guarantee platform originality or recommendation.
- Save images before final review. New images invalidate Review; release any active lease before adding images. Review must inspect reader-promise fulfillment, title support, time boundaries, conditional reasoning, and image context as well as factual errors. Warnings may pass; hard errors must be revised.
- Call `export_publish_pack` after the reviewed drafts and pictures are complete. Its ZIP contains per-platform `标题.txt`, `正文.txt`, `images/`, `插图说明.txt`, plus a separate audit document and manifest. Read `ready_for_handoff`, `warnings` and `human_approved`: missing drafts/images or failed checks are incomplete, not success. Correct gaps autonomously where possible; report an actual access/evidence blocker without inventing material. No platform login or publication tool is needed for handoff.
- Deliver the ZIP link/path and a short account of the topic, chosen angle, source gaps and review state. User only needs to review, copy/paste and upload images. Do not mark human approval yourself.

## Optional performance feedback

When the user supplies real platform analytics, associate platform, angle, title type, length, impressions, clicks, reading completion and follows with the draft version. Missing metrics stay missing. Treat cross-topic comparisons as clues, not causal proof; do not invent results or infer CTR from rank. No analytics scraping or recurring schedule is authorized by default.

## Decision points

- Data acquisition failures are failures or partial results, not empty public opinion. Reddit may require an authorized API token; Xiaohongshu v0.1 does not implement private signed search/comment endpoints. Return useful source gaps if access is blocked.
- Before adding research material during an active lease, release it. New sources invalidate the prior analysis; run the updated initial evaluation before proceeding. Finish source gathering early when practical.
- Goal is click-through on timely hot topics. Find what is worth writing: origin, twists, details, numbers, conflicting sides. Keep `confirmed`, `disputed`, `unknown` distinct; quotes must be present in the referenced original text; unknown facts cannot enter drafts.
- Comments are a bonus, not a requirement. No comments means `insufficient` and empty arrays; keep going. With comments, mine disputes, opposing camps and punchy lines; attribute them as netizen views, never as facts.
- Choose 1–5 angles with 5–10 attention-grabbing titles each (question, take-a-side, twist, "netizens found…", number/detail). Titles may be dramatic in tone but must not invent events. Respect a user-selected angle.
- Default to the three platform profiles above. Fact and opinion blocks need refs; analysis/transition blocks may omit refs but must not add new facts. Keep audit notes separate from publishable text.
- `review` checks hard errors only: names, numbers, dates, quotes vs sources; netizen claims stated as fact; invented events; personal/regional/gender attacks or high-risk sensitive content. Hard errors are `error` → `revise`/`blocked`; minor issues are `warning` and may still pass. Use `info` to suggest punchier titles and openings.
- Release a lease when pausing or failing. The web UI supports human editing and invalidates downstream artifacts; old versions remain traceable.

Use the root README for setup and supported adapter boundaries. The stage instructions and `output_example` returned by `get_task` are the maintained output contracts; do not duplicate a competing schema.
