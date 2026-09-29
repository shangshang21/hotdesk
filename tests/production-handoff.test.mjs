import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {unzipSync,strFromU8} from 'fflate';
mock.module('node:dns/promises',{exports:{lookup:async()=>[{address:'93.184.216.34',family:4}]}});
const {Store}=await import('../src/store.mjs');
const {callTool}=await import('../src/tools.mjs');
const {examples,validate}=await import('../src/pipeline.mjs');
const {fetchImage,imageCandidates}=await import('../src/adapters.mjs');
const {createApp}=await import('../src/server.mjs');
const root=resolve('../../work/hotdesk-tests');mkdirSync(root,{recursive:true});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=','base64');
function setup(){const store=new Store(mkdtempSync(join(root,'handoff-'))),topic=store.createTopic('[TEST] 阅览室延时公告');const html=`<html><head><title>[TEST]公告</title></head><body><nav><img src="https://ads.example.org/banner.png"></nav><article><h1>[TEST]公告</h1><p>阅览室将于十月一日开放至晚上九点，方便上班族在下班后前来阅读和借还图书。</p><figure><img src="https://${topic.id}.example.org/photo.png" alt="阅览室"><figcaption>阅览室内景</figcaption></figure><p>工作人员表示，延长时段内借还书服务照常进行，读者可凭证入馆。</p></article><aside><img src="https://other.example.org/unrelated.png"></aside></body></html>`;const source=store.addSource(topic.id,{kind:'article',platform:'web',title:'[TEST]公告',body:'阅览室将于十月一日开放至晚上九点。',url:'https://example.org/notice',raw_hash:store.raw(html)});return {store,topic,source};}
const noBenchmark=c=>Object.assign(c,{status:'none_found',items:[],gaps:[],consensus:[]});
const withIncrements=d=>{const f=d.blocks.findIndex(b=>b.kind==='fact'&&b.refs.length);return {...d,increments:d.increments||[{type:'background',block_index:f,note:'测试背景'},{type:'impact',block_index:0,note:'测试影响'},{type:'counterintuitive',block_index:d.blocks.length-1,note:'测试判断'}]};};
async function advance({store,topic,source},until='review'){
  for(const stage of ['editor','research','opinion','benchmark','angles','write','review']){
    const c=structuredClone(examples[stage]);
    if(stage==='editor')c.reader_entry={new_information:'测试延时公告',target_reader:'下班后阅读的人',stake:'开放时间',evidence_source_ids:[source.id],missing_questions:[]};
    if(stage==='research'){c.facts=[{id:'F1',claim:'测试公告称阅览室十月一日延时开放',status:'confirmed',evidence:[{source_id:source.id,quote:'晚上九点'}],reason:'测试原文'}];c.causal_chains=[{from:'开放时间调整',to:'可用时段变化',mechanism:'开门时间延长',fact_ids:['F1'],uncertainty:'未测使用人数'}];c.scenarios=[{premise:'按公告执行',result:'晚间时段可用',watch_for:['后续公告'],invalidators:['计划取消'],fact_ids:['F1']}];}
    if(stage==='opinion'){c.status='insufficient';c.focus=[];c.keywords=[];}
    if(stage==='angles'){c.angles[0].opinion_ids=[];Object.assign(c.angles[0],{reader_promise:'了解新时间',core_contrast:'以前与新时段',template:'explanation',fulfillment:'正文交代公告时间'});}
    if(stage==='write')c.drafts=['toutiao','penguin','baijiahao'].map((platform,index)=>({platform,title:['阅览室延时，下班后多了阅读时间','从下班到读书：阅览室的新时段','阅览室几点关门？公告给出新时间'][index],title_refs:['F1'],blocks:[{kind:'transition',text:['下班后的读书时间有了新变化。','公告里的一处时间调整，关系到晚间阅读。','想在晚间使用阅览室，先看最新公告。'][index],refs:[]},{kind:'fact',text:'[TEST]公告称十月一日起开放至晚上九点。',refs:['F1']}]}));
    if(stage==='benchmark')noBenchmark(c);if(stage==='write')c.drafts=c.drafts.map(withIncrements);
    const task=await callTool(store,'claim_task',{topic_id:topic.id,actor:'test-agent'});
    await callTool(store,'submit_result',{topic_id:topic.id,stage,actor:'test-agent',basis:task.basis,claim_id:task.claim_id,content:c});
    if(stage===until)break;
  }
}
async function addImage(fixture){
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(png,{headers:{'content-type':'image/png'}});
  try{return await callTool(fixture.store,'collect_image',{topic_id:fixture.topic.id,source_id:fixture.source.id,url:`https://${fixture.topic.id}.example.org/photo.png`,caption:'[TEST]一像素测试图，不是新闻图片',credit:'Synthetic test fixture',usage_note:'仅用于软件测试',verified_scene:true,seen_description:'测试用一像素图片，没有真实画面内容',placement:'cover',platforms:['toutiao','penguin','baijiahao']});}
  finally{globalThis.fetch=original;}
}
async function reviewAgain(f){const task=await callTool(f.store,'claim_task',{topic_id:f.topic.id,actor:'test-agent'});assert.equal(task.task.stage,'review');await callTool(f.store,'submit_result',{topic_id:f.topic.id,stage:'review',actor:'test-agent',basis:task.basis,claim_id:task.claim_id,content:structuredClone(examples.review)});}

test('任务自动携带读者利益打法与三平台范例，新字段可追溯',async()=>{
  const f=setup();try{
    const task=await callTool(f.store,'get_task',{topic_id:f.topic.id,stage:'write'});
    assert.deepEqual(task.production_policy.platforms,['toutiao','penguin','baijiahao']);assert.equal(task.output_example.drafts.length,3);
    await advance(f);assert.equal(f.store.latest(f.topic.id,'editor').content.reader_entry.stake,'开放时间');assert.equal(f.store.latest(f.topic.id,'research').content.scenarios.length,1);
    const draft=structuredClone(f.store.latest(f.topic.id,'write').content);draft.drafts[0].title_refs=[];assert.throws(()=>validate(f.store,f.topic.id,'write',draft),/标题必须/);
    draft.drafts[0].title_refs=['F1'];draft.drafts[0].title='字'.repeat(31);assert.throws(()=>validate(f.store,f.topic.id,'write',draft),/30字符/);
    const research=structuredClone(f.store.latest(f.topic.id,'research').content);research.scenarios[0].fact_ids=['F999'];assert.throws(()=>validate(f.store,f.topic.id,'research',research),/推演引用不存在/);
  }finally{f.store.close();}
});

test('真实文件下载路径、图片更新重审、三平台纯文本及 ZIP 交付',async()=>{
  const f=setup();try{
    await advance(f);const saved=await addImage(f);assert.equal(f.store.next(f.topic.id),'review');assert.equal(f.store.latest(f.topic.id,'review'),null);
    await reviewAgain(f);const pack=await callTool(f.store,'export_publish_pack',{topic_id:f.topic.id});
    assert.equal(pack.manifest.ready_for_handoff,true);assert.equal(pack.manifest.human_approved,false);assert.equal(pack.manifest.published,false);
    const files=unzipSync(readFileSync(join(f.store.dir,'publish-packs',pack.zip_name)));
    for(const platform of ['toutiao','penguin','baijiahao']){
      assert.ok(files[`${platform}/标题.txt`]);assert.ok(files[`${platform}/正文.txt`]);assert.deepEqual(Buffer.from(files[`${platform}/images/01_cover.png`]),png);
      assert.doesNotMatch(strFromU8(files[`${platform}/正文.txt`]),/\[F1\]|待人工审核|事实与来源/);
    }
    assert.ok(files['审核资料.md']);assert.equal(JSON.parse(strFromU8(files['manifest.json'])).ready_for_handoff,true);
    assert.equal((await callTool(f.store,'list_images',{topic_id:f.topic.id})).images[0].id,saved.image.id);
  }finally{f.store.close();}
});

test('缺图、损坏文件、未审稿与相同开头不得伪装完整交付',async()=>{
  const f=setup();try{
    await advance(f);const incomplete=await callTool(f.store,'export_publish_pack',{topic_id:f.topic.id});assert.equal(incomplete.manifest.ready_for_handoff,false);assert.ok(incomplete.manifest.warnings.some(w=>w.includes('缺少')));
    const saved=await addImage(f);const unreviewed=await callTool(f.store,'export_publish_pack',{topic_id:f.topic.id});assert.ok(unreviewed.manifest.warnings.some(w=>w.includes('成稿检查')));
    await reviewAgain(f);writeFileSync(join(f.store.dir,'images',saved.image.filename),'broken');const broken=await callTool(f.store,'export_publish_pack',{topic_id:f.topic.id});assert.equal(broken.manifest.ready_for_handoff,false);assert.ok(broken.manifest.warnings.some(w=>w.includes('校验失败')));
  }finally{f.store.close();}
});

test('来源更新使图片快照过期，重启后仍保留证据记录',async()=>{
  const f=setup();try{
    await advance(f);await addImage(f);const dir=f.store.dir;f.store.addSource(f.topic.id,{kind:'article',platform:'web',title:f.source.title,url:f.source.url,body:'更新公告：阅览室十月一日仍开放至晚上九点，使用规则另行通知。'});
    await advance(f);const pack=await callTool(f.store,'export_publish_pack',{topic_id:f.topic.id});assert.equal(pack.manifest.ready_for_handoff,false);
    const reopened=new Store(dir);try{assert.equal(reopened.setting(`images:${f.topic.id}`,[]).length,1);}finally{reopened.close();}
  }finally{f.store.close();}
});

test('复用相同跨平台标题或开头会明确提示补改',async()=>{
  const f=setup();try{
    await advance(f);await addImage(f);await reviewAgain(f);
    const content=structuredClone(f.store.latest(f.topic.id,'write').content);content.drafts[1].title=content.drafts[0].title;content.drafts[1].blocks[0].text=content.drafts[0].blocks[0].text;
    f.store.reset(f.topic.id,'write');const task=await callTool(f.store,'claim_task',{topic_id:f.topic.id,actor:'test-agent'});
    await callTool(f.store,'submit_result',{topic_id:f.topic.id,stage:'write',actor:'test-agent',claim_id:task.claim_id,basis:task.basis,content});await reviewAgain(f);
    const pack=await callTool(f.store,'export_publish_pack',{topic_id:f.topic.id});assert.equal(pack.manifest.ready_for_handoff,false);assert.ok(pack.manifest.warnings.some(w=>w.includes('标题相同')));assert.ok(pack.manifest.warnings.some(w=>w.includes('开头相同')));
  }finally{f.store.close();}
});

test('图片类型、内网地址与外话题来源在下载入口受到检查',async()=>{
  const f=setup(),original=globalThis.fetch;let calls=0;
  try{
    globalThis.fetch=async()=>{calls++;return new Response('<html>Not an image</html>',{headers:{'content-type':'image/png'}});};
    await assert.rejects(fetchImage('http://127.0.0.1/image.png'),/不允许访问内网/);assert.equal(calls,0);
    await assert.rejects(fetchImage(`https://${f.topic.id}.example.org/bad.png`),/有效 PNG/);
    await assert.rejects(callTool(f.store,'collect_image',{topic_id:f.topic.id,source_id:'s_foreign',url:'https://example.org/photo.png',caption:'测试',credit:'测试',usage_note:'测试',verified_scene:true,seen_description:'测试用一像素图片，没有真实画面内容',placement:'detail',platforms:['toutiao']}),/本话题/);
    const candidates=imageCandidates('<meta property="og:image" content="/photo.jpg"><img src="/photo.jpg"><img src="/logo.png"><img src="javascript:bad()">','https://example.org/story');assert.deepEqual(candidates,['https://example.org/photo.jpg']);
  }finally{globalThis.fetch=original;f.store.close();}
});

test('Web 交付 ZIP 和图片真实返回二进制，导出工具仍受会话保护',async()=>{
  const f=setup();await advance(f);const saved=await addImage(f);await reviewAgain(f);const server=createApp(f.store);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const denied=await fetch(base+'/api/tool/export_publish_pack',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({topic_id:f.topic.id})});assert.equal(denied.status,403);
    const {token}=await (await fetch(base+'/api/session')).json();
    const pack=await (await fetch(base+'/api/tool/export_publish_pack',{method:'POST',headers:{'content-type':'application/json','x-hotdesk-token':token},body:JSON.stringify({topic_id:f.topic.id})})).json();
    const response=await fetch(base+pack.download_url);assert.equal(response.headers.get('content-type'),'application/zip');const files=unzipSync(new Uint8Array(await response.arrayBuffer()));assert.ok(files['toutiao/正文.txt']);
    const image=await fetch(`${base}/api/images/${f.topic.id}/${saved.image.id}`);assert.equal(image.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
    assert.equal((await fetch(base+'/api/packs/unknown.zip')).status,400);
  }finally{await new Promise(r=>server.close(r));f.store.close();}
});
test('配图只能取自来源正文：图片搜索结果、侧栏/推荐区图片被拒，正文图带页面图注入库',async()=>{
  const f=setup(),original=globalThis.fetch;globalThis.fetch=async()=>new Response(png,{headers:{'content-type':'image/png'}});
  const base={topic_id:f.topic.id,source_id:f.source.id,caption:'测试',credit:'测试',usage_note:'测试',verified_scene:true,seen_description:'测试用一像素图片，没有真实画面内容',placement:'detail',platforms:['toutiao']};
  try{
    await assert.rejects(callTool(f.store,'collect_image',{...base,url:'https://img1.baidu.com/it/u=4208995601,2188993885'}),/不在来源原文页面里/);
    await assert.rejects(callTool(f.store,'collect_image',{...base,url:'https://other.example.org/unrelated.png'}),/侧栏或推荐区/);
    const ok=await callTool(f.store,'collect_image',{...base,url:`https://${f.topic.id}.example.org/photo.png`});
    assert.equal(ok.image.in_article,true);assert.equal(ok.image.page_caption,'阅览室内景');assert.equal(ok.image.page_alt,'阅览室');
  }finally{globalThis.fetch=original;f.store.close();}
});
