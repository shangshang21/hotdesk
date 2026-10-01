import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Store } from '../src/store.mjs';
import { callTool } from '../src/tools.mjs';
import { validate } from '../src/pipeline.mjs';
import { matches } from '../src/verify.mjs';
import { searchLog } from './depth-fixture.mjs';

const root = resolve('../../work/hotdesk-tests'); mkdirSync(root, { recursive: true });
const page = '<html><body><article><p>第三局林诗栋在4-4后连得3分拉开差距，虽错失两个局点被王楚钦追至11-10，但最终以13-11拿下。</p></article></body></html>';

test('核验：原文片段能在页面找到，改写标点仍算命中；编造内容不命中', () => {
  assert.ok(matches('林诗栋在4-4后连得3分拉开差距 虽错失两个局点被王楚钦追至11-10', page).ok);
  assert.equal(matches('王楚钦在10-8领先握有两个局点的情况下，关键分连续出现反拉失误', page).ok, false);
});

test('Agent 导入打不开的链接标 unverified，不能作事实证据或观点；看板人工导入可信', async () => {
  const s = new Store(mkdtempSync(join(root, 'verify-'))), t = s.createTopic('[TEST] 核验');
  const r = await callTool(s, 'import_sources', { topic_id: t.id, sources: [
    { platform: 'web', kind: 'article', title: '假报道', url: 'https://fabricated.invalid/news.shtml', body: '王楚钦在10-8领先握有两个局点的情况下被逆转。' },
    { platform: 'weibo', kind: 'comment', title: '假评论', url: 'https://fabricated.invalid/12345678#c1', body: '领军人物的关键时刻抗压能力到底在哪？' }] });
  assert.equal(r.unverified, 2);
  const [article, comment] = r.sources;
  const facts = { facts: [{ id: 'F1', claim: '逆转', status: 'confirmed', evidence: [{ source_id: article.id, quote: '10-8领先握有两个局点' }], reason: 'x' }], gaps: [], as_of: 'now', search_log: searchLog.slice(0, 3), essence: [] };
  assert.throws(() => validate(s, t.id, 'research', facts), /未通过核验/);
  const op = { status: 'available', sample_note: 'x', focus: [{ id: 'O1', text: '质疑抗压', source_ids: [comment.id] }], support: [], oppose: [], questions: [], keywords: [], platform_differences: [], limitations: [] };
  assert.throws(() => validate(s, t.id, 'opinion', op), /核验/);
  const human = await callTool(s, 'import_sources', { topic_id: t.id, sources: [{ platform: 'web', kind: 'article', title: '人工粘贴', url: 'https://fabricated.invalid/real', body: '人工确认过的原文内容。' }] }, { origin: 'web' });
  assert.equal(human.sources[0].verification.status, 'human');
  facts.facts[0].evidence = [{ source_id: human.sources[0].id, quote: '人工确认过的原文内容' }];
  // Passes the provenance gate; the next gate is the research checklist.
  assert.throws(() => validate(s, t.id, 'research', facts), /查资料不够/);
  s.close();
});
