import { z } from 'zod';
import { Adapters } from './adapters.mjs';
import { context, submit, exportMarkdown } from './pipeline.mjs';
import {collectImage,buildPublishPack,imagesFor} from './publish-pack.mjs';
import {verifySources} from './verify.mjs';
import {rulesFull} from './rules.mjs';
import { createProject, separateAudio, transcribeAudio, updateScript, synthesizeVoiceover, mixAudio, renderAndExport } from './video-pipeline.mjs';
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
  collect_image:{description:'先打开实际图片，再从原文正文保存。image_type 区分照片/截图/图表/文字卡片，seen_description 写实际画面，article_relation 写与文章哪部分相关；文字卡片还须写 visible_text 和说明性图注，不能冒充实景。图片更新后重新审稿并逐张填写 image_checks。',schema:{topic_id:id,source_id:id,url:z.string().url(),image_type:z.enum(['photo','screenshot','chart','text_card']),article_relation:z.string().min(5).max(1000),visible_text:z.string().max(1000).optional(),seen_description:z.string().min(10).max(500),caption:z.string().min(1).max(500),credit:z.string().min(1).max(200),usage_note:z.string().min(1).max(1000),verified_scene:z.literal(true),placement:z.enum(['cover','detail','result']),platforms:z.array(z.enum(['toutiao','penguin','baijiahao'])).min(1).max(3)}},
  list_images:{description:'查看本话题真实图片文件及来源记录。',schema:{topic_id:id}},
  export_publish_pack:{description:'导出三平台标题/纯正文/配图/插图说明的文件夹和ZIP；缺图、缺稿或审稿未过会标待补全。ready_for_handoff不等于人工确认或已发布。',schema:{topic_id:id,platforms:z.array(z.enum(['toutiao','penguin','baijiahao'])).min(1).max(3).refine(a=>new Set(a).size===a.length,'平台不能重复').optional()}},
  
  // ================= 视频创作工坊工具族 (Video Studio MCP Tools) =================
  list_video_projects:{description:'列出所有短视频二创项目及当前进展工序',schema:{}},
  create_video_project:{description:'新建短视频二创项目。支持传入公开视频链接或本地 MP4 文件路径。',schema:{title:z.string().min(1).max(300),url:z.string().optional(),file_path:z.string().optional(),route:z.enum(['A','B']).default('A'),voice:z.string().default('zh-CN-YunxiNeural')}},
  get_video_project:{description:'查看短视频项目详情、各阶段产物路径、台词字幕与剪映工程',schema:{project_id:id}},
  separate_video_audio:{description:'调用 Demucs v4 执行 AI 人声与伴奏分离（路线 A：剥离消灭外语原声，提取纯伴奏/掌声/环境音）',schema:{project_id:id}},
  transcribe_video_audio:{description:'调用 Faster-Whisper 执行毫秒级语音识别，提取原始台词与时间戳',schema:{project_id:id}},
  rewrite_video_script:{description:'更新/写入短视频高燃网感二创中文解说台词',schema:{project_id:id,segments:z.array(z.object({start:z.number(),end:z.number(),en_text:z.string().optional(),zh_text:z.string()}))}},
  synthesize_video_voiceover:{description:'调用 Edge-TTS 生成微软神经语音中文配音切片，并以 atempo 自适应嵌合原片时间槽',schema:{project_id:id,voice:z.string().optional()}},
  mix_video_audio:{description:'执行 EBU R128 (-14.8 LUFS) 广播级音频混音，纯净伴奏垫底 + 洪亮中文解说',schema:{project_id:id}},
  render_video_master:{description:'压制 1080P MP4 母带成片（可选毛玻璃遮罩覆盖原生硬字幕），并同步生成剪映 4 轨本地工程',schema:{project_id:id,mask_orig_sub:z.boolean().default(false)}},
  delete_video_project:{description:'删除一个短视频项目及其关联本地缓存',schema:{project_id:id}},
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

    // Video Studio tools
    case 'list_video_projects':return {projects:store.listVideoProjects()};
    case 'create_video_project':return tracked(store,name,null,a,()=>createProject(store,{title:a.title,source_url:a.url,video_path:a.file_path,route:a.route,voice:a.voice}));
    case 'get_video_project':return store.getVideoProject(a.project_id);
    case 'separate_video_audio':return tracked(store,name,a.project_id,a,()=>separateAudio(store,a.project_id));
    case 'transcribe_video_audio':return tracked(store,name,a.project_id,a,()=>transcribeAudio(store,a.project_id));
    case 'rewrite_video_script':return updateScript(store,a.project_id,a.segments);
    case 'synthesize_video_voiceover':return tracked(store,name,a.project_id,a,()=>synthesizeVoiceover(store,a.project_id,a.voice));
    case 'mix_video_audio':return tracked(store,name,a.project_id,a,()=>mixAudio(store,a.project_id));
    case 'render_video_master':return tracked(store,name,a.project_id,a,()=>renderAndExport(store,a.project_id,{mask_orig_sub:a.mask_orig_sub}));
    case 'delete_video_project':return store.deleteVideoProject(a.project_id);
  }
}
