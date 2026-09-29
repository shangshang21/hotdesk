import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// AGENT_RULES.md is the single source for agent-facing rules (MCP instructions, get_rules, skill).
export const rulesFull = readFileSync(fileURLToPath(new URL('../AGENT_RULES.md', import.meta.url)), 'utf8');
export const rulesBrief = `${rulesFull.split('## 完整规则')[0].replace(/^# .*\n/, '').trim()}\n\n完整规则：调用 get_rules。`;
