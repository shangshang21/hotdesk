# Hotdesk workspace

This is a local-first content production application, not an auto-publisher.

- Start with `README.md` for running and verification status.
- For operating the content pipeline, read `skills/hotdesk/SKILL.md`; use MCP or CLI rather than writing SQLite directly.
- Preserve `data/`: it contains real captures, local work, immutable raw snapshots and user edits. Tests use a separate directory under the parent workspace's `work/hotdesk-tests`.
- Do not mark a source adapter verified merely because its parser tests pass. Report live platform failures and partial collection honestly.
- Use `npm test` for pipeline changes and `npm run check` for syntax; inspect the browser for UI behavior changes.
- Runtime is Node.js 24+ with built-in SQLite. No external database or mandatory model API key is needed in Agent-driven mode.
- The canonical operation skill is in `skills/hotdesk/`; generated project-local copies under `.agents/skills` and `.claude/skills` are for client discovery.
- For a production request, apply the canonical skill's default reader-focused strategy and continue through three-platform text, verified images, final review and `export_publish_pack` unless the user bounds the scope. Do not require the user to repeat preferences or assemble the delivery files. No publication is authorized.
