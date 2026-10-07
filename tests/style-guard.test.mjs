import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Store } from '../src/store.mjs';
import { callTool } from '../src/tools.mjs';
import { examples, validate, styleAudit, quoteRatio } from '../src/pipeline.mjs';
import { imageBriefText } from '../src/publish-pack.mjs';

const root = resolve('../../work/hotdesk-tests'); mkdirSync(root, { recursive: true });

function setup(title = '[TEST] “原生旅游”火了') {
  const s = new Store(mkdtempSync(join(root, 'style-'))), t = s.createTopic(title);
  const a = s.addSource(t.id, { kind: 'article', platform: 'web', title: '平台数据报道', url: 'https://example.org/fliggy-data', body: '平台国庆数据显示，徒步和登山体验的预订用户规模增加近80%，贵州铜仁云舍村等村寨的搜索热度明显上升。' });
  const b = s.addSource(t.id, { kind: 'article', platform: 'web', title: '基诺山报道', url: 'https://news.example.net/jino', body: '在基诺山，村民向导带领游客走进雨林，游客跟随向导辨认路线、参与溪流边的活动。向导岩先生说：“以前游客拍完照就走，现在跟着我们认路、蹚水，晚上一起吃我们做的饭，临走还要带一点我们自己晒的茶。”' });
  return { s, t, a, b };
}
const stageContents = (a, b) => ({
  editor: structuredClone(examples.editor),
  research: {
    facts: [
      { id: 'F1', claim: '平台国庆数据显示徒步登山体验预订用户规模增加近80%。', status: 'confirmed', evidence: [{ source_id: a.id, quote: '徒步和登山体验的预订用户规模增加近80%' }], reason: '原文' },
      { id: 'F2', claim: '基诺山有村民向导带领游客走进雨林。', status: 'confirmed', evidence: [{ source_id: b.id, quote: '村民向导带领游客走进雨林' }], reason: '原文' },
      { id: 'F3', claim: '村民向导岩先生表示，过去游客拍照就走，如今会跟着向导认路蹚水、吃村民做的饭。', status: 'confirmed', evidence: [{ source_id: b.id, quote: '以前游客拍完照就走，现在跟着我们认路、蹚水，晚上一起吃我们做的饭，临走还要带一点我们自己晒的茶' }], reason: '采访原话' },
    ],
    gaps: [], as_of: 'now',
    search_log: ['原生旅游', '国庆 徒步 预订', '基诺山 向导', '村寨 旅游 数据', '雨林 徒步 村民'].map(query => ({ query, lang: 'zh' })).concat([{ query: 'rural tourism hiking trend', lang: 'en' }]),
    essence: [{ id: 'E1', insight: '游客想要可参与的自然体验', plain: '有人带路，风景才从照片变成经历。', fact_ids: ['F1'], boundary: '平台口径不能代表全国市场。' }],
  },
  opinion: { status: 'insufficient', sample_note: '无', focus: [], support: [], oppose: [], questions: [], keywords: [], platform_differences: [], limitations: ['无'] },
  benchmark: { status: 'none_found', searched: ['原生旅游 解读', '原生旅游 媒体'], items: [], consensus: [], gaps: [] },
  angles: { angles: [{ id: 'A1', name: '体验派', hook: 'h', audience_value: 'v', fact_ids: ['F1', 'F2'], opinion_ids: [], titles: ['t'], gaps: [] }], recommendation: 'r' },
});
async function advance(s, t, a, b, contents = stageContents(a, b)) {
  for (const stage of ['editor', 'research', 'opinion', 'benchmark', 'angles']) { const task = await callTool(s, 'claim_task', { topic_id: t.id, actor: 't' }); await callTool(s, 'submit_result', { topic_id: t.id, stage, actor: 't', basis: task.basis, claim_id: task.claim_id, content: contents[stage] }); }
}
function draft(texts = {}) {
  return {
    angle_id: 'A1', notes: [], drafts: [{
      platform: 'toutiao',
      title: texts.title || '徒步预订增近八成，野路子凭什么火过假古镇',
      title_refs: ['F1'],
      blocks: [
        { kind: 'transition', text: texts.open || '一边是人造古镇里人挤人排队，另一边基诺山的雨林里，村民向导带着游客蹚过溪流。', refs: ['F2'] },
        { kind: 'fact', text: texts.data || '平台国庆数据显示，徒步和登山体验的预订用户规模增加近80%。', refs: ['F1'] },
        { kind: 'fact', text: '在基诺山，村民向导带领游客走进雨林。', refs: ['F2'] },
        { kind: 'analysis', text: texts.analysis || '有人带路，风景才从照片变成自己的经历。', refs: ['F1'] },
        { kind: 'transition', text: '要野趣还是要配套，这个假期你站哪边？', refs: [] },
      ],
      increments: [
        { type: 'background', block_index: 2, note: '基诺山案例' },
        { type: 'impact', block_index: 3, note: '体验意义' },
        { type: 'concept', block_index: 3, note: '机制' },
      ],
    }],
  };
}

test('文风基线：正常稿件通过 write 校验', async () => {
  const { s, t, a, b } = setup(); await advance(s, t, a, b);
  assert.doesNotThrow(() => validate(s, t.id, 'write', draft()));
  s.close();
});

test('品牌上限：商业平台名单篇超 1 次拒收，提示改成指代写法', async () => {
  const { s, t, a, b } = setup(); await advance(s, t, a, b);
  const soft = draft({ data: '飞猪披露的国庆数据里，徒步和登山体验的预订用户规模增加近80%。飞猪说这组数字来自自家订单。' });
  assert.throws(() => validate(s, t.id, 'write', soft), /品牌软文|上限/);
  const once = draft({ data: '飞猪披露的国庆数据里，徒步和登山体验的预订用户规模增加近80%。' });
  assert.doesNotThrow(() => validate(s, t.id, 'write', once));
  s.close();
});

test('品牌豁免：话题主角就是该品牌时不受限', async () => {
  const { s, t, a, b } = setup('[TEST] 飞猪国庆数据发布'); await advance(s, t, a, b);
  const heavy = draft({ data: '飞猪披露的数据里，徒步登山预订增近80%。飞猪说数字来自订单，飞猪的报告还提到村寨热度。' });
  assert.doesNotThrow(() => validate(s, t.id, 'write', heavy));
  s.close();
});

test('限定句上限：免责句堆叠拒收', async () => {
  const { s, t, a, b } = setup(); await advance(s, t, a, b);
  const hedgy = draft({ analysis: '这不能证明游客转变，不代表全国市场，也不能直接推出动机。' });
  assert.throws(() => validate(s, t.id, 'write', hedgy), /限定句/);
  const ok = draft({ analysis: '平台口径不能直接代表全国市场，这点写清一次就够。' });
  assert.doesNotThrow(() => validate(s, t.id, 'write', ok));
  s.close();
});

test('形容词通胀：styleAudit 提示但不拦稿', async () => {
  const { s, t, a, b } = setup(); await advance(s, t, a, b);
  const inflated = draft({ data: '平台国庆数据显示，徒步和登山体验的预订用户规模增加近80%，热度暴增。' });
  assert.doesNotThrow(() => validate(s, t.id, 'write', inflated));
  const issues = styleAudit(s, t.id, inflated.drafts[0]);
  assert.ok(issues.some(i => i.kind === 'word' && i.text.includes('暴增')));
  s.close();
});

test('真实案例回归：飞猪软文式成稿会被拦（素材即本次返工稿的写法）', async () => {
  const { s, t, a, b } = setup(); await advance(s, t, a, b);
  const real = draft({ data: '飞猪披露的国庆数据里，徒步和登山体验的预订用户规模增加近80%。', analysis: '有人带路，风景才变成经历。飞猪说这组数字说明游客转向。' });
  assert.throws(() => validate(s, t.id, 'write', real), /品牌软文|上限/);
  s.close();
});

test('国外对照：最多 1 个、必须写机制映射和读者意义，写不出就留空', async () => {
  const { s, t, a, b } = setup();
  const contents = stageContents(a, b);
  contents.research.foreign_parallels = [{ case: '日本“里山”社区营造让村民做向导', mechanism: '同样是把当地生活变成可参与的体验', reader_meaning: '中国读者关心周末去哪玩，这种玩法在基诺山已经出现' }];
  const task = await callTool(s, 'claim_task', { topic_id: t.id, actor: 't' });
  await callTool(s, 'submit_result', { topic_id: t.id, stage: 'editor', actor: 't', basis: task.basis, claim_id: task.claim_id, content: contents.editor });
  const task2 = await callTool(s, 'claim_task', { topic_id: t.id, actor: 't' });
  assert.doesNotThrow(() => validate(s, t.id, 'research', contents.research));
  contents.research.foreign_parallels.push({ case: '再来一个', mechanism: 'm', reader_meaning: 'r' });
  assert.throws(() => validate(s, t.id, 'research', contents.research), /1 element/);
  contents.research.foreign_parallels = [{ case: '只有案例没有映射', mechanism: '', reader_meaning: '' }];
  assert.throws(() => validate(s, t.id, 'research', contents.research));
  await callTool(s, 'release_task', { claim_id: task2.claim_id });
  s.close();
});

test('引用占比：长段照搬原文拒收，改写为自己的话通过', async () => {
  const { s, t, a, b } = setup(); await advance(s, t, a, b);
  const stuffed = draft({
    open: '一边是人造古镇里人挤人排队，另一边基诺山的雨林里完全是另一种景象。',
    analysis: '向导岩先生说：“以前游客拍完照就走，现在跟着我们认路、蹚水，晚上一起吃我们做的饭，临走还要带一点我们自己晒的茶。”',
  });
  stuffed.drafts[0].blocks[3].refs = ['F3'];
  assert.throws(() => validate(s, t.id, 'write', stuffed), /引用原文/);
  const rewritten = draft({
    analysis: '向导岩先生说了句实在话：以前游客拍完照就走，现在住下来认路蹚水、跟村民同桌吃饭——有人带路，风景才变成经历。',
  });
  rewritten.drafts[0].blocks[3].refs = ['F3'];
  assert.doesNotThrow(() => validate(s, t.id, 'write', rewritten));
  const ratio = quoteRatio(s, t.id, rewritten.drafts[0]);
  assert.ok(ratio <= 0.2, `改写稿引用占比应低于上限，实际 ${ratio}`);
  s.close();
});

test('写稿入口：同一句数据有两份来源时不误拦，拆开搬用一段原话仍拦截', async () => {
  const { s, t, a, b } = setup();
  try {
    const duplicate = s.addSource(t.id, { kind: 'article', platform: 'web', title: '[TEST] 数据转载', url: 'https://third.example.com/data', body: a.body });
    const contents = stageContents(a, b);
    contents.research.facts[0].evidence[0].quote = '平台国庆数据显示，徒步和登山体验的预订用户规模增加近80%';
    contents.research.facts[0].evidence.push({ source_id: duplicate.id, quote: contents.research.facts[0].evidence[0].quote });
    await advance(s, t, a, b, contents);
    const original = draft({ analysis: `有人带路，风景才从照片变成自己的经历。${'析'.repeat(40)}` });
    assert.ok(quoteRatio(s, t.id, original.drafts[0]) <= 0.2);
    assert.doesNotThrow(() => validate(s, t.id, 'write', original));

    const quote = contents.research.facts[2].evidence[0].quote;
    const split = draft({ analysis: `${quote.slice(0, 24)}。解释。${quote.slice(24)}。${'析'.repeat(80)}` });
    split.drafts[0].blocks[3].refs = ['F3'];
    const research = structuredClone(s.latest(t.id, 'research'));
    research.content.facts[0].evidence.pop();
    const view = Object.create(s);
    view.latest = (id, stage) => stage === 'research' ? research : s.latest(id, stage);
    assert.ok(quoteRatio(view, t.id, split.drafts[0]) > 0.2);
    assert.throws(() => validate(view, t.id, 'write', split), /引用原文/);
  } finally { s.close(); }
});

test('配图需求单：每个图位给出位置、画面要求、图库搜索词与避雷', () => {
  const entries = [
    { sha256: 'a'.repeat(64), image_type: 'photo', article_relation: '对应基诺山雨林徒步的村民向导场景', caption: '基诺山雨林徒步现场', placements: [{ platform: 'toutiao', after: 2 }, { platform: 'penguin', after: 1 }] },
    { sha256: 'b'.repeat(64), image_type: 'text_card', article_relation: '解释“原生旅游”概念，放标题后', caption: '原生旅游概念解释卡', placements: [{ platform: 'toutiao', after: 0 }] },
  ];
  const text = imageBriefText('“原生旅游”火了', entries);
  assert.match(text, /配图需求单（配合平台自带正版图库使用）/);
  assert.match(text, /通用主题词：原生旅游/);
  assert.match(text, /今日头条：正文第2段后；企鹅号：正文第1段后/);
  assert.match(text, /今日头条：标题后、正文前/);
  assert.match(text, /图库搜索词：原生旅游 实景 照片/);
  assert.match(text, /文字卡只能作概念解释位，不能冒充实景/);
  assert.match(text, /图注参考：基诺山雨林徒步现场/);
  // 数字重的标题应产出干净的搜索词（不带 676.5/万对 这类噪声）
  const text2 = imageBriefText('结婚登记676.5万对,十年来首次大幅反弹:真回暖还是昙花一现', entries);
  assert.match(text2, /通用主题词：结婚登记/);
  assert.doesNotMatch(text2, /676\.5|万对 实景/);
});
