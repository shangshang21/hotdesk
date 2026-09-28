---
name: hotdesk
description: Operate the local Hotdesk content pipeline to discover topics, gather real posts and comments, generate sourced content packs and platform drafts, and write results back to its dashboard. Use for Hotdesk production tasks, not ordinary writing outside this project.
---

# Hotdesk production

Use the `hotdesk` MCP tools if connected. Otherwise run the project CLI from the Hotdesk root: `node src/cli.mjs tools` and `node src/cli.mjs <tool_name> --file input.json`. Write UTF-8 JSON files for complex inputs on Windows. Data resolves relative to the installed server script, not the client's current directory. `HOTDESK_DATA` can explicitly select a different workspace.

## Operate an existing topic

1. `list_topics` / `get_topic` show the shared queue, sources, current stage, versions, and events. Preserve human edits; don't reset completed stages merely to apply your own style.
2. If `next=collect`, gather actual source material with `collect_url` or `import_sources`. Search only the requested platforms/topics. Public search/browser tools available in your host can supplement blocked adapters. Import only content you actually read, with original URLs, platform, kind, and sampling notes. A hotlist title isn't substantive research material.
3. `claim_task` returns a 20-minute lease, current `basis`, stage instructions and output example. Generate that stage's JSON using the provided sources. Do not invent source IDs, comments, statistics, or growth scores.
4. `submit_result` needs `topic_id`, `stage`, `actor`, `claim_id`, `basis`, and `content`. State the real Agent/model identity you know; don't guess a model version. A stale basis or lease requires fetching fresh context; do not reuse the old answer blindly.
5. Continue to the next stage when authorized to run the pipeline. Final `done` means review artifacts exist, not human approval. `export_draft` produces a marked review document; publication is outside this product.

## Decision points

- Data acquisition failures are failures or partial results, not empty public opinion. Reddit may require an authorized API token; Xiaohongshu v0.1 does not implement private signed search/comment endpoints. Return useful source gaps if access is blocked.
- Before adding research material during an active lease, release it. New sources invalidate the prior analysis; run the updated initial evaluation before proceeding. Finish source gathering early when practical.
- Goal is click-through on timely hot topics. Find what is worth writing: origin, twists, details, numbers, conflicting sides. Keep `confirmed`, `disputed`, `unknown` distinct; quotes must be present in the referenced original text; unknown facts cannot enter drafts.
- Comments are a bonus, not a requirement. No comments means `insufficient` and empty arrays; keep going. With comments, mine disputes, opposing camps and punchy lines; attribute them as netizen views, never as facts.
- Choose 1–5 angles with 5–10 attention-grabbing titles each (question, take-a-side, twist, "netizens found…", number/detail). Titles may be dramatic in tone but must not invent events. Respect a user-selected angle.
- Default to one `toutiao` draft; if writing more platforms, rewrite title and opening per platform. Hook within three sentences, short colloquial paragraphs, clear stance, end with a take-a-side question. No disclaimer boilerplate. Fact and opinion blocks need refs; analysis/transition blocks may omit refs but must not add new facts.
- `review` checks hard errors only: names, numbers, dates, quotes vs sources; netizen claims stated as fact; invented events; personal/regional/gender attacks or high-risk sensitive content. Hard errors are `error` → `revise`/`blocked`; minor issues are `warning` and may still pass. Use `info` to suggest punchier titles and openings.
- Release a lease when pausing or failing. The web UI supports human editing and invalidates downstream artifacts; old versions remain traceable.

Use the root README for setup and supported adapter boundaries. The stage instructions and `output_example` returned by `get_task` are the maintained output contracts; do not duplicate a competing schema.
