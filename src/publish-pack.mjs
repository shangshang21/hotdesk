import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {canonical,hash,now,STAGES,TRUSTED_ORIGINS,verificationOf} from './store.mjs';
import {fetchImage,articleImages} from './adapters.mjs';
import {exportMarkdown,validate,imagesToReview} from './pipeline.mjs';
import {productionPolicy} from './production-policy.mjs';
import {replaceUploadImages} from './upload-images.mjs';

const names={toutiao:'今日头条',penguin:'企鹅号',baijiahao:'百家号'};
// Current-affairs posts must show where the information came from; build it from the facts the draft cites.
const SITES={'xinhuanet.com':'新华网','news.cn':'新华网','people.com.cn':'人民网','cctv.com':'央视网','cntv.cn':'央视网','gmw.cn':'光明网','thepaper.cn':'澎湃新闻','chinanews.com.cn':'中国新闻网','163.com':'网易','sina.cn':'新浪','sina.com.cn':'新浪','qq.com':'腾讯网','ifeng.com':'凤凰网','jiemian.com':'界面新闻','caixin.com':'财新','bilibili.com':'哔哩哔哩','baidu.com':'百度'};
export function sourceLine(store,id,draft){
  const facts=new Map((store.latest(id,'research')?.content.facts||[]).map(f=>[f.id,f])),sources=new Map(store.sources(id).map(s=>[s.id,s]));
  const refs=new Set([...draft.title_refs,...draft.blocks.flatMap(b=>b.refs)]),labels=new Set();
  for(const ref of refs)for(const e of facts.get(ref)?.evidence||[]){const s=sources.get(e.source_id);if(!s?.url)continue;let host='';try{host=new URL(s.url).hostname;}catch{continue;}
    const site=Object.keys(SITES).find(d=>host===d||host.endsWith(`.${d}`));labels.add(site?SITES[site]:host.replace(/^www\./,''));}
  return labels.size?`信息来源：${[...labels].join('、')}`:'';
}
export function imagesFor(store,id){store.topic(id);return store.setting(`images:${id}`,[]);}
// Stock-library search brief: the user picks licensed images inside each platform's editor.
const TITLE_STOP_WORDS=['火了','爆火','上热搜','出圈','刷屏','引爆','登顶','冲热搜'];
function topicKeywords(title){
  const tokens=String(title).replace(/[“”"'‘’「」【】（）()·，。！？!?、:：\s]+/g,' ').split(' ')
    .flatMap(t=>t.split(/[A-Za-z0-9‰%.]+/))
    .filter(t=>t.length>=2&&t.length<=8&&!TITLE_STOP_WORDS.includes(t)&&!/^[万亿千]/.test(t));
  if(!tokens.length)tokens.push(String(title).replace(/[^\p{Script=Han}]/gu,'').slice(0,8)||'话题');
  return tokens.slice(0,3);
}
export function imageBriefText(topic,entries){
  const keywords=topicKeywords(topic);
  if(!keywords.length)keywords.push('话题','现场');
  const typeWords={photo:'实景 照片',chart:'数据 图表',text_card:'概念 图解',screenshot:'新闻 截图'};
  const typeHint={photo:'优先真实场景，有人物动作更佳',chart:'图表要与正文数字对得上，不要用装饰性图表',text_card:'文字卡只能作概念解释位，不能冒充实景',screenshot:'截图要能看清出处，模糊图不用'};
  const lines=['配图需求单（配合平台自带正版图库使用）','',
    '用法：发布时优先在平台编辑器自带的正版图库里，按每张图的“图库搜索词”搜索挑选；',
    '“画面要求”是这张图应当呈现的内容（来自已核对的图文关系）。找不到贴切的图就少配，不硬凑。',
    '通用主题词：'+keywords.join(' / '),'通用避雷：不用带明显商业品牌形象的图；不用与正文场景不符的摆拍；不用来历不明的网图。',''];
  for(const [index,e] of entries.entries()){
    const where=e.placements.map(p=>`${names[p.platform]}：${p.after===0?'标题后、正文前':`正文第${p.after}段后`}`).join('；');
    lines.push(`—— 第${index+1}张 · ${where} ——`);
    lines.push(`画面要求：${e.article_relation}`);
    lines.push(`图库搜索词：${[...keywords,typeWords[e.image_type]||'实景 照片'].join(' ')}`);
    if(typeHint[e.image_type])lines.push(`挑选提示：${typeHint[e.image_type]}`);
    lines.push(`图注参考：${e.caption}`);
    lines.push('');
  }
  lines.push('原文图备份：交付包“图片”文件夹内是报道原图（含出处），可作备选；发布用图优先正版图库。');
  return lines.join('\n');
}
export function imageFile(store,image){
  if(!/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(image.filename))throw new Error('无效图片文件记录');
  return join(store.dir,'images',image.filename);
}
export async function collectImage(store,id,input){
  const source=store.sources(id).find(s=>s.id===input.source_id);
  if(!source||!['article','post'].includes(source.kind)||!source.url)throw new Error('图片须关联本话题有原文链接的 article/post 来源');
  if(!input.verified_scene)throw new Error('请先查看图片并核对场景，不能仅凭文件名确认');
  if(!['photo','screenshot','chart','text_card'].includes(input.image_type)||!input.article_relation?.trim())throw new Error('配图需说明实际图片类型 image_type 和与文章的关系 article_relation');
  if(input.image_type==='text_card'&&(!input.visible_text?.trim()||!/(文字|解释|图解|示意)/.test(input.caption)))throw new Error('文字卡片须记录 visible_text，图注说明是解释卡，不能当游客实景');
  if(!TRUSTED_ORIGINS.includes(verificationOf(source)))throw new Error('图片来源文章未通过核验，不能取图');
  // The picture must be on the source page itself, inside the article body (or its og:image cover).
  let page='';try{page=source.raw_hash?store.readRaw(source.raw_hash):'';}catch{}
  const want=canonical(input.url),path=u=>{try{const x=new URL(u);return x.host+x.pathname;}catch{return u;}};
  const found=page.includes('<')?articleImages(page,source.url).find(i=>i.url===want||path(i.url)===path(want)):null;
  if(!found)throw new Error('这张图不在来源原文页面里。请从 collect_url 返回的 image_candidates 里选图，不要用图片搜索结果配图');
  if(!found.in_article&&!(found.og&&input.placement==='cover'))throw new Error('这张图在页面侧栏或推荐区，不在正文里，常与文章无关；请选 in_article=true 的图（og:image 只能作封面）');
  const r=await fetchImage(input.url);
  if(store.sources(id).find(s=>s.id===source.id)?.raw_hash!==source.raw_hash)throw new Error('下载期间来源已更新，请重新核对图片');
  const digest=createHash('sha256').update(r.bytes).digest('hex');
  const metadata={...input,page_alt:found.alt,page_caption:found.caption,in_article:found.in_article,url:canonical(input.url),resolved_url:r.url,source_raw_hash:source.raw_hash,source_url:source.url,sha256:digest,filename:`${digest}.${r.extension}`};
  const image={...metadata,id:`img_${hash(metadata).slice(0,16)}`,saved_at:now()};
  const images=imagesFor(store,id);if(images.some(i=>i.id===image.id))return {image:images.find(i=>i.id===image.id),duplicate:true};
  if(images.length>=36)throw new Error('本话题已达到36张图片快照限额');
  mkdirSync(join(store.dir,'images'),{recursive:true});
  const file=imageFile(store,image);if(!existsSync(file))writeFileSync(file,r.bytes);
  store.transaction(()=>{
    store.setSetting(`images:${id}`,[...images,image]);
    store.invalidate(id,STAGES.indexOf('review'),'图片新增，需核对图文并重新审稿');
    store.event(id,'image_saved',{id:image.id,sha256:digest,source_id:source.id,url:image.url});
  });
  return {image,duplicate:false,next:store.next(id)};
}

export function buildPublishPack(store,id,platforms=productionPolicy.platforms){
  const topic=store.topic(id),writing=store.latest(id,'write'),review=store.latest(id,'review');
  if(!writing)throw new Error('尚无有效草稿，不能导出交付包');
  const warnings=[];
  try{validate(store,id,'research',store.latest(id,'research')?.content);}catch(e){warnings.push(`资料分析检查：${e.message}`);}
  try{validate(store,id,'write',writing.content);}catch(e){warnings.push(`稿件检查：${e.message}`);}
  if(!review||review.content.verdict!=='pass')warnings.push('成稿检查尚未通过');
  else try{validate(store,id,'review',review.content);}catch(e){warnings.push(`审稿检查：${e.message}`);}
  const sources=new Map(store.sources(id).map(s=>[s.id,s]));
  const allImages=imagesToReview(store,id).reverse(),files={},packs=[],sharedImages=new Map(),briefEntries=[];
  const writeText=(path,text)=>{files[path]=strToU8(text);};
  for(const platform of platforms){
    const draft=writing.content.drafts.find(d=>d.platform===platform);
    if(!draft){warnings.push(`${names[platform]}缺少稿件`);continue;}
    const selected=[],seen=new Set();
    // New selections take precedence; preserve earlier records for audit.
    for(const image of [...allImages].reverse()){
      if(!image.platforms.includes(platform)||seen.has(image.sha256))continue;
      if(sources.get(image.source_id)?.raw_hash!==image.source_raw_hash)continue;
      if(!image.image_type||!image.article_relation){warnings.push(`图片 ${image.id} 尚未记录画面类型与文章关联，请重新看图核对`);continue;}
      const file=imageFile(store,image);
      if(!existsSync(file)){warnings.push(`图片文件缺失：${image.id}`);continue;}
      const bytes=readFileSync(file);
      if(createHash('sha256').update(bytes).digest('hex')!==image.sha256){warnings.push(`图片文件校验失败：${image.id}`);continue;}
      if(!sharedImages.has(image.sha256))sharedImages.set(image.sha256,`图片/${String(sharedImages.size+1).padStart(2,'0')}_${image.sha256.slice(0,12)}.${image.filename.split('.').at(-1)}`);
      const path=sharedImages.get(image.sha256);
      files[path]=bytes;seen.add(image.sha256);
      selected.push({...image,file:path,after_paragraph:image.placement==='cover'?0:image.placement==='result'?draft.blocks.length:Math.max(1,Math.floor(draft.blocks.length/2))});
      const after=image.placement==='cover'?0:image.placement==='result'?draft.blocks.length:Math.max(1,Math.floor(draft.blocks.length/2));
      const brief=briefEntries.find(e=>e.sha256===image.sha256);
      if(brief){if(!brief.placements.some(p=>p.platform===platform))brief.placements.push({platform,after});}
      else briefEntries.push({sha256:image.sha256,image_type:image.image_type,article_relation:image.article_relation,caption:image.caption,placements:[{platform,after}]});
      if(selected.length>=3)break;
    }
    if(!selected.length)warnings.push(`${names[platform]}缺少已核对并下载的配图`);
    writeText(`${platform}/标题.txt`,draft.title);
    const credit=sourceLine(store,id,draft);if(!credit)warnings.push(`${names[platform]}正文没有可标注的信息来源（时事类内容须标注）`);
    writeText(`${platform}/正文.txt`,[...draft.blocks.map(b=>b.text),credit].filter(Boolean).join('\n\n'));
    writeText(`${platform}/插图说明.txt`,selected.map(i=>`${i.file}\n位置：${i.after_paragraph===0?'标题后、正文前':`正文第${i.after_paragraph}段后`}\n图注：${i.caption}\n署名：${i.credit}\n来源：${i.source_url}\n使用说明：${i.usage_note}`).join('\n\n')||'暂缺配图，交付包不完整');
    packs.push({platform,name:names[platform],title:draft.title,reader_question:draft.reader_question,body:[...draft.blocks.map(b=>b.text),credit].filter(Boolean).join('\n\n'),images:selected,title_file:`${platform}/标题.txt`,body_file:`${platform}/正文.txt`});
  }
  if(new Set(packs.map(p=>p.title)).size<packs.length)warnings.push('跨平台标题相同，请按不同阅读任务改写');
  const openings=writing.content.drafts.filter(d=>platforms.includes(d.platform)).map(d=>d.blocks[0].text);
  if(new Set(openings).size<openings.length)warnings.push('跨平台开头相同，请增加实质内容差异');
  const fingerprint=hash({writing:writing.id,review:review?.id||null,approval:topic.approved_artifact,platforms,images:packs.map(p=>p.images.map(i=>i.id)),warnings});
  const manifest={topic_id:id,topic:topic.title,created_at:now(),draft_id:writing.id,review_id:review?.id||null,ready_for_handoff:!warnings.length,human_approved:topic.approved_artifact===writing.id,published:false,warnings,platforms:packs};
  const stem=`${id}_${fingerprint.slice(0,16)}`,directory=join(store.dir,'publish-packs',stem);
  mkdirSync(directory,{recursive:true});
  writeText('manifest.json',JSON.stringify(manifest,null,2));
  writeText('审核资料.md',exportMarkdown(store,id));
  if(briefEntries.length)writeText('配图需求单.txt',imageBriefText(topic.title,briefEntries));
  writeText('发布说明.txt',`${manifest.ready_for_handoff?'稿件与配图齐备':'交付包待补全'}；${manifest.human_approved?'人工已确认':'等待人工确认'}；内容未发布。\n\n每个平台复制标题.txt和正文.txt。发布配图优先在平台编辑器自带的正版图库里，按“配图需求单.txt”的关键词搜索挑选（版权无忧）；“图片”文件夹内的原文图含出处，可作备选或审核参照，按插图说明上传对应文件，同一张图只存一份。不要把审核资料中的引用编号或过程说明复制到正文。\n\n${warnings.join('\n')}`);
  for(const [relative,bytes] of Object.entries(files)){
    const path=join(directory,relative);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes);
  }
  const zipName=`${stem}.zip`;writeFileSync(join(store.dir,'publish-packs',zipName),zipSync(files,{level:0}));
  let upload_images=null,upload_warning=null;
  if(manifest.ready_for_handoff)try{upload_images=replaceUploadImages(store.dir,Object.fromEntries(Object.entries(files).filter(([path])=>path.startsWith('图片/')).map(([path,bytes])=>[path.slice(3),bytes])),{topic_id:id,draft_id:writing.id});}catch(e){upload_warning=`上传图片目录未更新：${e.message}`;}
  store.event(id,'publish_pack_exported',{draft_id:writing.id,fingerprint,ready_for_handoff:manifest.ready_for_handoff,warnings});
  return {directory,zip_name:zipName,download_url:`/api/packs/${zipName}`,manifest,upload_images,upload_warning};
}
