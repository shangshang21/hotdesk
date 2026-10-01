// Shared fixture for the research checklist: a second site, a borrowed concept, and a search log.
export const TERM = '公共服务均等化';
export function addConceptSource(store, topicId) {
  return store.addSource(topicId, { kind: 'article', platform: 'web', title: '[TEST]评论', url: 'https://news.example.net/library', body: `据报道，阅览室延长开放至晚上九点，这体现了${TERM}的思路。` });
}
export const searchLog = ['阅览室 延时', '阅览室 开放时间 公告', '公共服务 夜间', '阅览室 上班族', '图书馆 延长开放 评论'].map(query => ({ query, lang: 'zh' })).concat([{ query: 'library extended hours public service', lang: 'en' }]);
export function enrichResearch(c, conceptSource) {
  c.search_log = searchLog;
  c.essence = [{ id: 'E1', insight: '公共服务按上班族的作息重新排时间', plain: '说白了，以前是人迁就阅览室，现在阅览室迁就人。' }];
  c.facts[0].evidence.push({ source_id: conceptSource.id, quote: '延长开放至晚上九点' });
  return c;
}
export function addConceptIncrement(d) {
  const body = `${d.body}\n\n说白了，以前是人迁就阅览室，现在阅览室迁就人。`;
  const last = body.split(/\n\s*\n/).length - 1;
  return { ...d, body, increments: [...(d.increments || []).filter(i => i.type !== 'concept'), { type: 'concept', paragraph: last, note: '借词' }] };
}
// Free-text draft with three paragraphs and the required increments.
export function freeDraft(platform, title, paras) {
  return { platform, title, body: paras.join('\n\n'), increments: [{ type: 'background', paragraph: 1, note: '背景' }, { type: 'impact', paragraph: 0, note: '影响' }, { type: 'concept', paragraph: paras.length - 1, note: '本质' }] };
}
// Independent fact check that covers every sentence with a number in the latest draft.
export async function factcheckFor(store, topicId, override = {}) {
  const { numberSentences } = await import('../src/pipeline.mjs');
  const w = store.latest(topicId, 'write').content;
  const claims = w.drafts.flatMap(d => numberSentences(d.title, d.body).map(text => ({ platform: d.platform, where: d.title.includes(text) ? 'title' : 'body', text, type: 'fact', fact_ids: ['F1'], opinion_ids: [], verdict: 'supported', note: '与 F1 一致' })));
  return { verdict: 'pass', claims: claims.map((k, i) => ({ id: `K${i + 1}`, ...k })), summary: '逐句核查', ...override };
}
