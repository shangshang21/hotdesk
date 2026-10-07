import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteRatio } from '../src/pipeline.mjs';

const first = 'abcdefghijklmnopqrst';
const second = '01234567890123456789';
const filler = '文'.repeat(60);
function ratio(quotes, blocks, { title = '', titleRefs = [] } = {}) {
  const facts = new Map([['F1', { evidence: quotes.map(quote => ({ quote })) }]]);
  const draft = { title, title_refs: titleRefs, blocks: blocks.map(text => ({ text, refs: ['F1'] })) };
  return quoteRatio(null, null, draft, facts);
}

test('同一引文的跨来源重复和重叠证据不会重复计算稿件字符', () => {
  assert.equal(ratio([first, first], [first + filler]), 0.25);
  assert.equal(ratio([first + 'uvwxy', first], [first + 'uvwxy' + filler]), 25 / 85);
});

test('同一证据的多个分离长引用全部计入占比', () => {
  assert.equal(ratio([first + '来源分隔' + second], [first + '作者分析' + second]), 40 / 44);
});

test('同一引文在稿件中反复出现，每次出现都计入', () => {
  assert.equal(ratio([first], [first + '分析' + first]), 40 / 42);
});

test('标题与段落之间不拼出原本不存在的二十字长引用', () => {
  assert.equal(ratio([first], [first.slice(10)], { title: first.slice(0, 10), titleRefs: ['F1'] }), 0);
  assert.equal(ratio([first], [first.slice(0, 10), first.slice(10)]), 0);
});

test('二十字阈值、标点规范化和短数字引用保持原有规则', () => {
  assert.equal(ratio([first], [first.slice(0, 19)]), 0);
  assert.equal(ratio([first], [first]), 1);
  assert.equal(ratio([first], ['ABCDEFGHIJ， KLMNOPQRST！']), 1);
  assert.equal(ratio(['增加近80%'], ['预订用户增加近80%']), 0);
});

test('重复引用的不同事实也只计算稿件字符的并集', () => {
  const facts = new Map(['F1', 'F2'].map(id => [id, { evidence: [{ quote: first }] }]));
  const draft = { title: '', title_refs: ['F1', 'F2'], blocks: [{ text: first, refs: ['F1', 'F2'] }] };
  assert.equal(quoteRatio(null, null, draft, facts), 1);
});

test('只核对稿件实际引用的事实，空稿占比为零', () => {
  const facts = new Map([['F1', { evidence: [{ quote: first }] }], ['F2', { evidence: [{ quote: second }] }]]);
  const draft = { title: second, title_refs: [], blocks: [{ text: first + filler, refs: ['F1'] }] };
  assert.equal(quoteRatio(null, null, draft, facts), 0.2);
  assert.equal(ratio([first], ['！？']), 0);
});

test('标题里的真实长引用仍然计入', () => {
  assert.equal(ratio([first], [filler], { title: first, titleRefs: ['F1'] }), 0.25);
});
