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
- Keep `confirmed`, `disputed`, `unknown` distinct. A claim that a publisher made a statement is different from endorsing the statement. Quotes must be present in the referenced original text. Unknown facts cannot enter drafts.
- Opinion points require actual comment source IDs. No comments means `insufficient`, empty opinion arrays, and a visible limitation. Do not turn these samples into a claim about all users.
- Choose 1–5 angles, with hooks and evidence. Respect a user-selected angle. Produce the three required platforms: `toutiao`, `penguin`, `baijiahao`. Topic and audience positioning are intentionally not fixed yet; prioritize a usable workflow over elaborate prose.
- Content can be lively, concise, opinionated and discussion-oriented. Titles must be supported by their materials. Keep inference and reported comments distinct from verified facts.
- `review` must inspect the actual wording against source excerpts, not just IDs. Return `revise`/`blocked` when necessary. Do not claim machine validation proves truth.
- Release a lease when pausing or failing. The web UI supports human editing and invalidates downstream artifacts; old versions remain traceable.

Use the root README for setup and supported adapter boundaries. The stage instructions and `output_example` returned by `get_task` are the maintained output contracts; do not duplicate a competing schema.
