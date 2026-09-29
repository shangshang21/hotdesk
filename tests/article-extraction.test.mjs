import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePage,trimTail} from '../src/adapters.mjs';
import {normalize} from '../src/store.mjs';

const opening='本次报道介绍某应用界面的更新情况，以及相关功能在页面中的展示方式。报道同时采访了设计人员，记录了其对于栏目命名和推荐机制的解释。';
const ending='后半部分详细介绍了关闭功能的方法，设置修改后将在下一次启动时生效。';
const page=content=>`<html><head><title>应用栏目调整报道</title></head><body><article><h1>应用栏目调整报道</h1><p>${opening}</p>${content}<p>${ending}</p></article></body></html>`;

test('正文中的推荐关键词及同名小标题保留后续报道',()=>{
  for(const keyword of ['为你推荐','相关推荐','热点推荐','猜你喜欢','相关阅读','延伸阅读']){
    const [article]=parsePage(page(`<p>设计人员解释，“${keyword}”是页面入口名称。</p><h2>${keyword}</h2>`),'https://example.org/report');
    assert.ok(article);
    assert.ok(article.body.includes(keyword),keyword);
    assert.ok(article.body.includes(normalize(ending)),keyword);
  }
});

test('新闻讨论平台声明时保留原文及后续事实',()=>{
  const [article]=parsePage(page('<p>报道分析“特别声明：以上内容为自媒体用户上传。”这句话的含义。</p><p>声明：本文记录的是产品变化，并非平台附注。</p>'),'https://example.org/report');
  assert.match(article.body,/报道分析/);
  assert.match(article.body,/特别声明/);
  assert.match(article.body,/并非平台附注/);
  assert.ok(article.body.includes(normalize(ending)));
});

test('只清除尾部独立声明，句中声明和中间段落不能删除',()=>{
  const notice='特别声明：以上内容为自媒体用户上传。';
  assert.equal(trimTail(`${opening}\n${ending}\n${notice}`),`${opening}\n${ending}`);
  assert.equal(trimTail(`${opening}${notice}`),`${opening}${notice}`);
  assert.equal(trimTail(`${opening}\n${notice}\n${ending}`),`${opening}\n${notice}\n${ending}`);
  assert.equal(trimTail(`${opening}\n为你推荐\n${ending}`),`${opening}\n为你推荐\n${ending}`);
});

test('推荐侧栏按 DOM 清除，尾部独立声明清除后正文仍完整',()=>{
  const html=page('<aside><h3>为你推荐</h3><p>无关广告推荐</p></aside>').replace('</article>','<p>特别声明：以上内容为自媒体用户上传。</p></article>');
  const [article]=parsePage(html,'https://example.org/report');
  assert.ok(article.body.includes(normalize(ending)));
  assert.doesNotMatch(article.body,/无关广告推荐|特别声明/);
  assert.equal(article.metadata.extractor,'readability');
});
