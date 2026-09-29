import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,readFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store, hash } from '../src/store.mjs';
import { callTool } from '../src/tools.mjs';
import { examples,validate,exportMarkdown } from '../src/pipeline.mjs';
import { parseRSS,parsePage,Adapters,fetchRaw } from '../src/adapters.mjs';
import { createApp } from '../src/server.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root=resolve('../../work/hotdesk-tests');mkdirSync(root,{recursive:true});
function setup(){const dir=mkdtempSync(join(root,'case-')),s=new Store(dir),t=s.createTopic('[TEST] 社区阅览室调整开放时间');const source=s.addSource(t.id,{kind:'article',platform:'web',title:'测试公告',url:'https://example.org/notice',body:'社区阅览室将于十月一日起延长开放至晚上九点。'});const comment=s.addSource(t.id,{kind:'comment',platform:'tieba',title:'测试评论',url:'https://example.org/comment/1',body:'下班后终于能去看书了。'});return {s,t,source,comment,dir};}
function content(stage,source,comment){const c=structuredClone(examples[stage]);if(stage==='editor')c.metrics.freshness.score=80;
  if(stage==='research')c.facts=[{id:'F1',claim:'测试公告称阅览室十月一日起开放至晚九点。',status:'confirmed',evidence:[{source_id:source.id,quote:'延长开放至晚上九点'}],reason:'公告原文'}];
  if(stage==='opinion')c.focus=[{id:'O1',text:'该样本关心下班后的使用时间。',source_ids:[comment.id]}];
  return c;
}
async function advance(s,t,source,comment,until='review'){
  for(const stage of ['editor','research','opinion','angles','write','review']){const task=await callTool(s,'claim_task',{topic_id:t.id,actor:'test-agent'});await callTool(s,'submit_result',{topic_id:t.id,stage,actor:'test-agent',basis:task.basis,claim_id:task.claim_id,content:content(stage,source,comment)});if(stage===until)break;}
}
test('完整流水线、引用导出、人工确认、数据更新失效、重启持久性',async()=>{
  const {s,t,source,comment,dir}=setup();await advance(s,t,source,comment);assert.equal(s.next(t.id),'done');assert.match(exportMarkdown(s,t.id),/待人工审核/);const approved=s.approve(t.id);assert.equal(s.topic(t.id).approved_artifact,approved);
  assert.match(exportMarkdown(s,t.id),/人工已确认/);s.addSource(t.id,{kind:'article',platform:'web',title:'更正',url:'https://example.org/update',body:'开放时间进一步调整，请以更正为准。'});assert.equal(s.next(t.id),'editor');assert.equal(s.topic(t.id).approved_artifact,null);assert.equal(s.artifacts(t.id).length,6);assert.ok(s.artifacts(t.id).every(a=>!a.valid));s.close();const reopened=new Store(dir);assert.equal(reopened.sources(t.id).length,3);assert.equal(reopened.artifacts(t.id).length,6);reopened.close();
});
test('拒绝伪造引文、评论冒充事实、未列入资料包的事实和未知事实入稿',async()=>{
  const {s,t,source,comment}=setup();const c=content('research',source,comment);c.facts[0].evidence[0].quote='不存在的原文';assert.throws(()=>validate(s,t.id,'research',c),/未在原始素材/);c.facts[0].evidence[0]={source_id:comment.id,quote:comment.body};assert.throws(()=>validate(s,t.id,'research',c),/评论或热榜/);
  await advance(s,t,source,comment,'angles');const w=content('write',source,comment);w.drafts[0].blocks[0].refs=['F999'];assert.throws(()=>validate(s,t.id,'write',w),/引用不存在/);
  const old=s.latest(t.id,'research');old.content.facts[0].status='unknown';s.db.prepare('UPDATE artifacts SET content=? WHERE id=?').run(JSON.stringify(old.content),old.id);assert.throws(()=>validate(s,t.id,'write',content('write',source,comment)),/未知主张/);s.close();
});
test('任务租约互斥，过期与输入变化后拒绝提交',async()=>{
  const {s,t,source,comment}=setup();let a=await callTool(s,'claim_task',{topic_id:t.id,actor:'one'});await assert.rejects(callTool(s,'claim_task',{topic_id:t.id,actor:'two'}),/已有 Agent/);
  s.db.prepare("UPDATE claims SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(a.claim_id);await assert.rejects(callTool(s,'submit_result',{topic_id:t.id,stage:'editor',actor:'one',basis:a.basis,claim_id:a.claim_id,content:content('editor',source,comment)}),/租约/);
  a=await callTool(s,'claim_task',{topic_id:t.id,actor:'two'});s.addSource(t.id,{kind:'comment',platform:'tieba',title:'新评论',body:'新数据',url:'https://example.org/comment/2'});await assert.rejects(callTool(s,'submit_result',{topic_id:t.id,stage:'editor',actor:'two',basis:a.basis,claim_id:a.claim_id,content:content('editor',source,comment)}),/已变化/);s.close();
});
test('重复采集保持幂等，修订保留旧快照；缺少评论明确 insufficient',()=>{
  const {s,t,comment}=setup();const before=s.topic(t.id).revision;const duplicate=s.addSource(t.id,{platform:'tieba',kind:'comment',title:comment.title,url:comment.url,body:comment.body});assert.equal(duplicate.duplicate,true);assert.equal(s.topic(t.id).revision,before);
  const fresh=s.createTopic('[TEST] 无评论');s.addSource(fresh.id,{kind:'post',platform:'web',title:'帖子',body:'只有正文',url:'https://example.org/post'});const c=structuredClone(examples.opinion);c.focus=[];assert.throws(()=>validate(s,fresh.id,'opinion',c),/没有评论/);c.status='insufficient';assert.equal(validate(s,fresh.id,'opinion',c).status,'insufficient');s.close();
});
test('暂停拒绝领取，继续恢复；角度变更仅失效写作和审核',async()=>{
  const {s,t,source,comment}=setup();s.pause(t.id,true);await assert.rejects(callTool(s,'claim_task',{topic_id:t.id,actor:'test'}),/paused/);s.pause(t.id,false);await advance(s,t,source,comment);s.selectAngle(t.id,'A1');assert.ok(s.latest(t.id,'research'));assert.equal(s.latest(t.id,'write'),null);assert.equal(s.next(t.id),'write');s.close();
});
test('RSS/Atom 解析与贴吧/小红书公开页面解析',()=>{
  const rss='<rss><channel><item><title>测试</title><link>https://example.org/a</link><description><![CDATA[<b>正文</b>]]></description></item></channel></rss>';assert.equal(parseRSS(rss)[0].body,'正文');
  const atom='<feed><entry><title>Atom</title><link href="https://example.org/atom"/><summary>内容</summary></entry></feed>';assert.equal(parseRSS(atom)[0].url,'https://example.org/atom');
  const tieba='<title>讨论</title><div class="l_post" data-field="{}"><div class="d_post_content">楼主正文</div></div><div class="l_post"><div class="d_post_content">第一条评论</div></div>';assert.equal(parsePage(tieba,'https://tieba.baidu.com/p/1')[1].kind,'comment');
  assert.equal(parsePage('<title>小红书 - 你的生活指南</title><meta name="description" content="小红书是年轻人的生活方式平台">','https://www.xiaohongshu.com/explore').length,0);
});
test('TrendRadar SQLite 只读接入、历史排名与幂等导入',()=>{
  const {s,dir}=setup(),path=join(dir,'trendradar.db');const db=new DatabaseSync(path);db.exec("CREATE TABLE news_items(id INTEGER,title TEXT,platform_id TEXT,rank INTEGER,url TEXT,created_at TEXT,updated_at TEXT); CREATE TABLE rank_history(news_item_id INTEGER,rank INTEGER,created_at TEXT); INSERT INTO news_items VALUES(1,'数据库测试','baidu',3,'https://example.org/news','2026-09-28 10:00:00','2026-09-28 11:00:00'); INSERT INTO rank_history VALUES(1,8,'2026-09-28 10:00:00'),(1,3,'2026-09-28 11:00:00');");db.close();const before=hash(readFileSync(path).toString('base64'));const a=new Adapters(s);const r=a.importTrendRadar(path);a.importTrendRadar(path);assert.equal(hash(readFileSync(path).toString('base64')),before);const d=s.detail(r.topic_ids[0]);assert.equal(d.sources.length,1);assert.equal(d.movements[0].delta,5);s.close();
});
test('同事件合并保留原话题和版本，素材归集',()=>{const {s,t}=setup();const to=s.createTopic('同一事件另一标题');s.merge(t.id,to.id);assert.equal(s.sources(to.id).length,2);assert.equal(s.topic(t.id).merged_into,to.id);assert.equal(s.sources(t.id).length,2);s.close();});
test('公共采集阻止内网地址',async()=>{const {s}=setup();await assert.rejects(fetchRaw(s,'http://127.0.0.1:1/'),/不允许访问内网/);s.close();});
test('Web API 会话/跨站限制，失败编辑不丢旧版本，拒绝过期编辑',async()=>{
  const {s,t,source,comment}=setup();await advance(s,t,source,comment,'editor');const server=createApp(s);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const {token}=await (await fetch(base+'/api/session')).json();let res=await fetch(base+'/api/tool/create_topic',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"title":"bad"}'});assert.equal(res.status,403);
    res=await fetch(base+'/api/state',{headers:{Origin:'https://evil.example'}});assert.equal(res.status,403);
    const old=s.latest(t.id,'editor');const post=data=>fetch(base+'/api/edit',{method:'POST',headers:{'Content-Type':'application/json','X-Hotdesk-Token':token},body:JSON.stringify(data)});
    res=await post({topic_id:t.id,stage:'editor',artifact_id:old.id,content:{}});assert.equal(res.status,400);assert.equal(s.latest(t.id,'editor').id,old.id);
    res=await post({topic_id:t.id,stage:'editor',artifact_id:old.id,content:{...old.content,reason:'人工修改'}});assert.equal(res.status,200);assert.equal(s.latest(t.id,'editor').version,2);
    res=await post({topic_id:t.id,stage:'editor',artifact_id:old.id,content:old.content});assert.equal(res.status,400);
    const page=await (await fetch(base)).text();assert.match(page,/热点工坊/);
  }finally{await new Promise(r=>server.close(r));s.close();}
});
test('真实 MCP stdio 握手、工具发现、领取与提交共用 SQLite，无发布/人工确认工具',async()=>{
  const {s,t,source,comment,dir}=setup();const client=new Client({name:'hotdesk-test',version:'1'});const transport=new StdioClientTransport({command:process.execPath,args:[resolve('src/mcp.mjs')],env:{...process.env,HOTDESK_DATA:dir},stderr:'pipe'});
  try{await client.connect(transport);const list=await client.listTools();assert.ok(list.tools.some(t=>t.name==='claim_task'));assert.ok(list.tools.some(t=>t.name==='export_publish_pack'));assert.ok(!list.tools.some(t=>/^(publish|approve)(_|$)/.test(t.name)));
    const take=await client.callTool({name:'claim_task',arguments:{topic_id:t.id,actor:'mcp-test'}});const c=JSON.parse(take.content[0].text);assert.ok(c.claim_id);
    const result=await client.callTool({name:'submit_result',arguments:{topic_id:t.id,stage:'editor',actor:'mcp-test',basis:c.basis,claim_id:c.claim_id,content:content('editor',source,comment)}});assert.ok(!result.isError);assert.equal(s.latest(t.id,'editor').actor,'mcp-test');
  }finally{await client.close();s.close();}
});
test('营销稿规则：单平台可成稿，分析段免引用，网友说法仍须引用；warning 可通过，error 拦截',async()=>{
  const {s,t,source,comment}=setup();await advance(s,t,source,comment);
  const w=content('write',source,comment);assert.equal(w.drafts.length,1);assert.doesNotThrow(()=>validate(s,t.id,'write',w));
  const dup=structuredClone(w);dup.drafts.push(structuredClone(w.drafts[0]));assert.throws(()=>validate(s,t.id,'write',dup),/同一平台/);
  const bare=structuredClone(w);bare.drafts[0].blocks.find(b=>b.kind==='opinion').refs=[];assert.throws(()=>validate(s,t.id,'write',bare),/需有引用/);
  const r=content('review',source,comment);r.issues=[{severity:'warning',platform:'toutiao',text:'小瑕疵',refs:[]}];assert.doesNotThrow(()=>validate(s,t.id,'review',r));
  r.issues[0].severity='error';assert.throws(()=>validate(s,t.id,'review',r),/硬伤/);
  assert.doesNotMatch(exportMarkdown(s,t.id).split('## 事实与来源')[0],/\[F1\]/);s.close();
});
test('网页正文提取：Readability 去导航与推荐，尾部声明截断',()=>{
  const nav='<nav>'+'首页 新闻 体育 娱乐 '.repeat(30)+'</nav>',rec='<aside><h3>为你推荐</h3>'+'<p>无关推荐文章标题</p>'.repeat(20)+'</aside>';
  const html=`<html><head><title>测试新闻</title></head><body>${nav}<article><h1>测试新闻</h1><p>社区阅览室将于十月一日起延长开放至晚上九点，方便上班族下班后阅读。</p><p>工作人员表示，延长时段内借还书服务照常。</p><p>特别声明：以上内容为自媒体用户上传。</p></article>${rec}</body></html>`;
  const [row]=parsePage(html,'https://example.org/news');assert.equal(row.metadata.extractor,'readability');
  assert.match(row.body,/延长开放至晚上九点/);assert.doesNotMatch(row.body,/首页 新闻|无关推荐|特别声明/);
});
