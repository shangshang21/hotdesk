// Shared fixture for the research checklist: a second site, a borrowed concept, and a search log.
export const TERM = '公共服务均等化';
export function addConceptSource(store, topicId) {
  return store.addSource(topicId, { kind: 'article', platform: 'web', title: '[TEST]评论', url: 'https://news.example.net/library', body: `据报道，阅览室延长开放至晚上九点，这体现了${TERM}的思路。` });
}
export const searchLog = ['阅览室 延时', '阅览室 开放时间 公告', '公共服务 夜间', '阅览室 上班族', '图书馆 延长开放 评论'].map(query => ({ query, lang: 'zh' })).concat([{ query: 'library extended hours public service', lang: 'en' }]);
export function enrichResearch(c, conceptSource) {
  c.search_log = searchLog;
  c.essence = [{ id: 'E1', insight: '公共服务按上班族的作息重新排时间', plain: '说白了，以前是人迁就阅览室，现在阅览室迁就人。', fact_ids: [c.facts[0].id], boundary: '只能说明使用时段扩大，不能据此断言使用人数增长。' }];
  c.facts[0].evidence.push({ source_id: conceptSource.id, quote: '延长开放至晚上九点' });
  return c;
}
export function addConceptIncrement(d) {
  const blocks = [...d.blocks.map((b,index)=>(d.increments||[]).some(i=>i.type==='concept'&&i.block_index===index)?{...b,refs:['F1']}:b), { kind: 'analysis', text: '说白了，以前是人迁就阅览室，现在阅览室迁就人。', refs: ['F1'] }];
  return { ...d, blocks, increments: [...(d.increments || []), { type: 'concept', block_index: blocks.length - 1, note: '借词' }] };
}
