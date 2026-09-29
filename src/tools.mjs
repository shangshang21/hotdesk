import { z } from 'zod';
import { Adapters } from './adapters.mjs';
import { context, submit, exportMarkdown } from './pipeline.mjs';
import {collectImage,buildPublishPack,imagesFor} from './publish-pack.mjs';
import {verifySources} from './verify.mjs';
import {rulesFull} from './rules.mjs';
const stages=z.enum(['editor','research','opinion','benchmark','angles','write','review']);
const id=z.string().min(1);
const source=z.object({platform:z.string().min(1),kind:z.enum(['article','post','comment','hotlist','benchmark']),title:z.string().default(''),body:z.string().max(100000),url:z.string().default(''),external_id:z.string().optional(),published_at:z.string().optional(),metadata:z.record(z.unknown()).optional()});
export const toolDefinitions={
  get_rules:{description:'读取 Hotdesk 完整工作规则（素材核验、各工序要点、对标拆解、信息增量、配图）。第一次使用或被校验拒收时先读。',schema:{}},
  list_topics:{description:'列出热点、工序、初筛等级和素材数。无评分显示 null，不代表 B 级。',schema:{}},
  create_topic:{description:'人工/Agent 建立一个选题。',schema:{title:z.string().min(1).max(300)}},
  get_topic:{description:'查看一个话题全部素材、工序产物、引用、版本与运行事件。',schema:{topic_id:id}},
  discover:{description:'从 baidu/bilibili/tieba/reddit/trendradar/rss:配置ID/newsnow:榜单ID 导入最多 50 个热点。上游失败会保留错误记录。',schema:{source:z.string(),limit:z.number().int().min(1).max(50).default(12)}},
  search_posts:{description:'按词搜索 B站、贴吧、Reddit。小红书返回浏览器搜索入口与导入指引，不伪装匿名搜索能力。',schema:{platform:z.enum(['bilibili','tieba','reddit','xiaohongshu']),query:z.string().min(1).max(200),limit:z.number().int().min(1).max(20).default(8)}},
  collect_url:{description:'采集一条公开视频/帖子/文章链接到话题。评论采样有边界；登录/受阻会返回 partial 或失败。as_benchmark 填 authority（权威媒体/机构）或 viral（爆款自媒体）时作为对标文章入库：只用于拆解写法和查重，不作事实证据。',schema:{topic_id:id,url:z.string().url(),as_benchmark:z.enum(['authority','viral']).optional()}},
  import_sources:{description:'将实际读到的网页正文/评论导入。服务器会打开原链接核对内容：页面里找得到才标 verified；打不开或对不上标 unverified，unverified 素材不能作事实证据或观点来源。不得合成网友评论。添加资料会使旧分析失效。',schema:{topic_id:id,sources:z.array(source).min(1).max(50)}},
  get_task:{description:'读取下一步（或指定工序）的资料、提示和 JSON 输出范例；不领取写入权。',schema:{topic_id:id,stage:stages.optional()}},
  claim_task:{description:'为当前下一工序领取 20 分钟租约，返回 claim_id、basis 和完整资料。一个话题同时只允许一个 Agent 写入。',schema:{topic_id:id,actor:z.string().min(1).max(150)}},
  submit_result:{description:'提交已领取工序的结构化结果。校验来源、引用、上游版本、租约；自动使下游旧结果失效。actor 可填 Agent/model 标识。',schema:{topic_id:id,stage:stages,actor:z.string().min(1),basis:id,claim_id:id,content:z.record(z.unknown())}},
  release_task:{description:'释放任务租约；建议失败、资料不足或需补充来源时先释放。',schema:{claim_id:id,reason:z.string().optional()}},
  rerun_stage:{description:'明确重跑某工序并使其下游失效，旧版本仍保留；不要在用户未要求时覆盖人工修改。',schema:{topic_id:id,stage:stages}},
  select_angle:{description:'选定已有切入角度并将写作/审稿标为待重做。',schema:{topic_id:id,angle_id:id}},
  merge_topics:{description:'确认两个条目是同一事件后合并到目标；保留原话题档案，目标重新分析。不能仅凭相似关键词合并。',schema:{from:id,to:id}},
  export_draft:{description:'导出带引用的 Markdown 审核稿。未人工确认会带待审核标记；没有发布能力。',schema:{topic_id:id}},
  collect_image:{description:'从来源原文里取配图：图片必须出现在该来源页面的正文里（collect_url 返回的 image_candidates 中 in_article=true 的图；og:image 仅可作封面），不能用图片搜索结果。先真的看图，把画面里实际有什么写进 seen_description，再下载。图片更新会使审稿失效。',schema:{topic_id:id,source_id:id,url:z.string().url(),seen_description:z.string().min(10).max(500),caption:z.string().min(1).max(500),credit:z.string().min(1).max(200),usage_note:z.string().min(1).max(1000),verified_scene:z.literal(true),placement:z.enum(['cover','detail','result']),platforms:z.array(z.enum(['toutiao','penguin','baijiahao'])).min(1).max(3)}},
  list_images:{description:'查看本话题真实图片文件及来源记录。',schema:{topic_id:id}},
  export_publish_pack:{description:'导出三平台标题/纯正文/配图/插图说明的文件夹和ZIP；缺图、缺稿或审稿未过会标待补全。ready_for_handoff不等于人工确认或已发布。',schema:{topic_id:id,platforms:z.array(z.enum(['toutiao','penguin','baijiahao'])).min(1).max(3).refine(a=>new Set(a).size===a.length,'平台不能重复').optional()}},
};
export async function tracked(store,kind,topic,input,fn){
  const job=store.job(kind,topic,input);try{const r=await fn();store.finishJob(job,r);return {job_id:job,...r};}catch(e){store.finishJob(job,null,e.message);throw e;}
}
export async function callTool(store,name,args={},ctx={}){
  const def=toolDefinitions[name];if(!def)throw new Error('未知工具');const a=z.object(def.schema).strict().parse(args);const adapters=new Adapters(store);
  switch(name){
    case 'get_rules':return {rules:rulesFull};
    case 'list_topics':return {topics:store.list()};
    case 'create_topic':return store.createTopic(a.title);
    case 'get_topic':return store.detail(a.topic_id);
    case 'discover':return tracked(store,name,null,a,()=>adapters.discover(a.source,a.limit));
    case 'search_posts':return tracked(store,name,null,a,()=>adapters.search(a.platform,a.query,a.limit));
    case 'collect_url':return tracked(store,name,a.topic_id,a,()=>adapters.collect(a.topic_id,a.url,{benchmark:a.as_benchmark}));
    case 'import_sources':{store.topic(a.topic_id);const checked=await verifySources(store,a.sources,ctx.origin);
      const saved=checked.map(({verification,...s})=>store.addSource(a.topic_id,{...s,metadata:{...s.metadata,imported:true,verification}}));
      return {sources:saved.map((s,i)=>({id:s.id,duplicate:!!s.duplicate,verification:checked[i].verification})),unverified:checked.filter(s=>s.verification.status==='unverified').length};}
    case 'get_task':return context(store,a.topic_id,a.stage);
    case 'claim_task':{const stage=store.next(a.topic_id);if(['collect','done','paused'].includes(stage))throw new Error(`当前状态 ${stage} 无可领取 AI 工序`);const claim=store.claim(a.topic_id,stage,a.actor);return {claim_id:claim.id,basis:claim.basis,expires_at:claim.expires_at,task:context(store,a.topic_id,stage)};}
    case 'submit_result':return submit(store,a);
    case 'release_task':store.release(a.claim_id,a.reason);return {released:true};
    case 'rerun_stage':store.reset(a.topic_id,a.stage);return {next:store.next(a.topic_id)};
    case 'select_angle':store.selectAngle(a.topic_id,a.angle_id);return {selected:a.angle_id};
    case 'merge_topics':return store.merge(a.from,a.to);
    case 'export_draft':return {markdown:exportMarkdown(store,a.topic_id)};
    case 'collect_image':return tracked(store,name,a.topic_id,a,()=>collectImage(store,a.topic_id,a));
    case 'list_images':return {images:imagesFor(store,a.topic_id)};
    case 'export_publish_pack':return buildPublishPack(store,a.topic_id,a.platforms);
  }
}
