import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Store } from '../src/store.mjs';
import { callTool } from '../src/tools.mjs';
import { validate, examples } from '../src/pipeline.mjs';
import { searchLog } from './depth-fixture.mjs';

const root = resolve('../../work/hotdesk-tests'); mkdirSync(root, { recursive: true });
const BENCH = '林诗栋在第三局错失两个局点后仍以十三比十一拿下这一局，展现出超越年龄的大心脏。这场决赛也让外界重新审视国乒男单的格局。';
async function setup() {
  const s = new Store(mkdtempSync(join(root, 'bench-'))), t = s.createTopic('[TEST] 对标');
  const src = s.addSource(t.id, { kind: 'article', platform: 'web', title: '赛果', url: 'https://example.org/result', body: '林诗栋4-0战胜王楚钦夺冠，局分11-5、11-8、13-11、11-5。' });
  const src2 = s.addSource(t.id, { kind: 'article', platform: 'web', title: '赛果2', url: 'https://news.example.net/result', body: '男单决赛林诗栋4-0战胜王楚钦夺冠。' });
  const b1 = s.addSource(t.id, { kind: 'benchmark', platform: 'web', title: '权威稿', url: 'https://example.org/a', body: BENCH, metadata: { tier: 'authority' } });
  const b2 = s.addSource(t.id, { kind: 'benchmark', platform: 'web', title: '爆款稿', url: 'https://example.org/b', body: '4比0！新王登基，卫冕冠军一局未胜。', metadata: { tier: 'viral' } });
  const stages = {
    editor: examples.editor,
    research: { facts: [{ id: 'F1', claim: '林诗栋4-0夺冠', status: 'confirmed', evidence: [{ source_id: src.id, quote: '林诗栋4-0战胜王楚钦夺冠' }, { source_id: src2.id, quote: '林诗栋4-0战胜王楚钦夺冠' }], reason: '原文' }], gaps: [], search_log: searchLog, essence: [{ id: 'E1', insight: '高强度赛程下的心理韧性', plain: '说白了，比到最后拼的不是手，是谁先扛不住。' }], as_of: 'now' },
    opinion: { status: 'insufficient', sample_note: '无', focus: [], support: [], oppose: [], questions: [], keywords: [], platform_differences: [], limitations: ['无'] },
    benchmark: { status: 'available', searched: ['林诗栋 王楚钦 决赛'], items: [b1, b2].map((b, i) => ({ source_id: b.id, tier: i ? 'viral' : 'authority', angle: '赛果', structure: '结果→过程', title_pattern: '比分前置', hook: '比分', strengths: ['节奏'], missed: ['没讲赛程密度'] })), consensus: ['都写了比分'], gaps: [{ id: 'G1', text: '九天二十场的赛程密度', why: '解释体能', fact_ids: ['F1'] }] },
  };
  for (const stage of ['editor', 'research', 'opinion', 'benchmark']) { const task = await callTool(s, 'claim_task', { topic_id: t.id, actor: 't' }); await callTool(s, 'submit_result', { topic_id: t.id, stage, actor: 't', basis: task.basis, claim_id: task.claim_id, content: stages[stage] }); }
  return { s, t, src, b1 };
}
const angles = extra => ({ angles: [{ id: 'A1', name: '赛程', hook: 'h', audience_value: 'v', fact_ids: ['F1'], opinion_ids: [], titles: ['t'], gaps: [], ...extra }], recommendation: 'r' });

test('对标：已有对标文章不能标 none_found，拆解须 ≥2 篇且都是对标来源', async () => {
  const { s, t, src } = await setup();
  assert.throws(() => validate(s, t.id, 'benchmark', { status: 'none_found', searched: ['a', 'b'], items: [], consensus: [], gaps: [] }), /已有对标文章/);
  const c = structuredClone(s.latest(t.id, 'benchmark').content); c.items[1].source_id = src.id;
  assert.throws(() => validate(s, t.id, 'benchmark', c), /不是本话题的对标文章/);
  s.close();
});
test('对标：角度必须挂差异点；新增对标文章只让对标及之后工序失效', async () => {
  const { s, t } = await setup();
  assert.throws(() => validate(s, t.id, 'angles', angles({})), /差异点/);
  assert.doesNotThrow(() => validate(s, t.id, 'angles', angles({ gap_ids: ['G1'], differs_from: '对标都只写比分' })));
  s.addSource(t.id, { kind: 'benchmark', platform: 'web', title: '第三篇', url: 'https://example.org/c', body: '又一篇对标。' });
  assert.ok(s.latest(t.id, 'research')); assert.equal(s.latest(t.id, 'benchmark'), null); assert.equal(s.next(t.id), 'benchmark');
  s.close();
});
test('查重：成稿与对标文章连续 20 字相同被拒；信息增量不足被拒', async () => {
  const { s, t } = await setup();
  for (const stage of ['angles']) { const task = await callTool(s, 'claim_task', { topic_id: t.id, actor: 't' }); await callTool(s, 'submit_result', { topic_id: t.id, stage, actor: 't', basis: task.basis, claim_id: task.claim_id, content: angles({ gap_ids: ['G1'], differs_from: 'x' }) }); }
  const draft = text => ({ angle_id: 'A1', notes: [], drafts: [{ platform: 'toutiao', title: '九天二十场，新王是怎么熬出来的', title_refs: ['F1'], blocks: [{ kind: 'fact', text: '林诗栋4-0夺冠。', refs: ['F1'] }, { kind: 'analysis', text, refs: [] }], increments: [{ type: 'background', block_index: 0, note: 'b' }, { type: 'impact', block_index: 1, note: 'i' }, { type: 'concept', block_index: 1, note: 'c' }] }] });
  assert.throws(() => validate(s, t.id, 'write', draft('他在第三局错失两个局点后，仍以十三比十一拿下这一局，展现出超越年龄的大心脏！')), /连续 20 字相同/);
  assert.doesNotThrow(() => validate(s, t.id, 'write', draft('真正难的不是那一分，而是九天里一场接一场的消耗。')));
  const thin = draft('自己的判断。'); thin.drafts[0].increments = thin.drafts[0].increments.slice(0, 2);
  assert.throws(() => validate(s, t.id, 'write', thin), /信息增量不足/);
  const wrong = draft('自己的判断。'); wrong.drafts[0].increments[0].block_index = 1;
  assert.throws(() => validate(s, t.id, 'write', wrong), /须落在带 Fact ID 的 fact 段/);
  s.close();
});
test('百度实时热搜：优先解析 s-data JSON，类名结构作后备', async () => {
  const { parseBaiduBoard } = await import('../src/adapters.mjs');
  const json = `<html><!--s-data:{"data":{"cards":[{"content":[{"word":"热点一","desc":"描述","url":"https://www.baidu.com/s?wd=a","hotScore":"100"}]}]}}--></html>`;
  assert.deepEqual(parseBaiduBoard(json).map(i => [i.title, i.rank, i.metadata.hot_score]), [['热点一', 1, 100]]);
  const html = '<div class="category-wrap_x"><div class="c-single-text-ellipsis">热点二</div><div class="hot-desc_y">说明 查看更多></div></div>';
  assert.deepEqual(parseBaiduBoard(html).map(i => [i.title, i.body]), [['热点二', '说明']]);
});
test('查资料硬清单：关键词不足、英文为零、只有一个网站、缺本质解释都被拒；补素材不打回初筛', async () => {
  const s = new Store(mkdtempSync(join(root, 'research-'))), t = s.createTopic('[TEST] 清单');
  const a = s.addSource(t.id, { kind: 'article', platform: 'web', title: 'A', url: 'https://example.org/a', body: '社区阅览室延长开放至晚上九点。' });
  const b = s.addSource(t.id, { kind: 'article', platform: 'web', title: 'B', url: 'https://news.example.net/b', body: '阅览室延长开放至晚上九点。' });
  const base = () => ({ facts: [{ id: 'F1', claim: '延时', status: 'confirmed', evidence: [{ source_id: a.id, quote: '延长开放至晚上九点' }, { source_id: b.id, quote: '延长开放至晚上九点' }], reason: 'x' }], gaps: [], as_of: 'now', search_log: searchLog, essence: [{ id: 'E1', insight: 'x', plain: '说白了，阅览室迁就人了。' }] });
  assert.doesNotThrow(() => validate(s, t.id, 'research', base()));
  let c = base(); c.search_log = searchLog.slice(0, 5); assert.throws(() => validate(s, t.id, 'research', c), /至少 6 个关键词/);
  c = base(); c.search_log = searchLog.map(q => ({ ...q, lang: 'zh' })); assert.throws(() => validate(s, t.id, 'research', c), /英文/);
  c = base(); c.facts[0].evidence.pop(); assert.throws(() => validate(s, t.id, 'research', c), /不同网站/);
  c = base(); c.essence = []; assert.throws(() => validate(s, t.id, 'research', c), /essence/);
  const k = await callTool(s, 'claim_task', { topic_id: t.id, actor: 't' }); await callTool(s, 'submit_result', { topic_id: t.id, stage: 'editor', actor: 't', basis: k.basis, claim_id: k.claim_id, content: examples.editor });
  s.addSource(t.id, { kind: 'article', platform: 'web', title: 'C', url: 'https://example.com/c', body: '补充的一篇深度报道。' });
  assert.ok(s.latest(t.id, 'editor')); assert.equal(s.next(t.id), 'research');
  s.close();
});
