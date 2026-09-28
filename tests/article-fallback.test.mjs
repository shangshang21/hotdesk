import test,{mock} from 'node:test';
import assert from 'node:assert/strict';

// Force both documented failure paths; a particular HTML fixture must not
// accidentally switch back to Readability as its heuristics change.
let extractionThrows=false;
mock.module('@mozilla/readability',{exports:{Readability:class {
  parse(){if(extractionThrows)throw new Error('Synthetic extraction failure');return null;}
}}});
const {parsePage}=await import('../src/adapters.mjs');

test('Readability 无结果或报错时，回退清理保留关键词后文并识别独立尾段',()=>{
  for(const throws of [false,true]){
    extractionThrows=throws;
    const html='<html><head><title>回退报道</title></head><body><nav>导航干扰</nav><main><p>本次报道介绍某应用界面的更新情况，以及相关功能在页面中的展示方式。报道同时采访了设计人员。</p><p>“为你推荐”是栏目名称，不表示新闻正文结束。</p><p>后半部分详细介绍关闭功能的方法，设置修改后将在下一次启动时生效。</p><aside>无关广告推荐</aside><p>特别声明：以上内容为自媒体用户上传。</p></main></body></html>';
    const [article]=parsePage(html,'https://example.org/fallback');
    assert.equal(article.metadata.extractor,'fallback');
    assert.match(article.body,/为你推荐/);
    assert.match(article.body,/下一次启动时生效/);
    assert.doesNotMatch(article.body,/导航干扰|无关广告推荐|特别声明/);
  }
});
