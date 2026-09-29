import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {canonical,hash,now,STAGES} from './store.mjs';
import {fetchImage} from './adapters.mjs';
import {exportMarkdown,validate} from './pipeline.mjs';
import {productionPolicy} from './production-policy.mjs';

const names={toutiao:'今日头条',penguin:'企鹅号',baijiahao:'百家号'};
export function imagesFor(store,id){store.topic(id);return store.setting(`images:${id}`,[]);}
export function imageFile(store,image){
  if(!/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(image.filename))throw new Error('无效图片文件记录');
  return join(store.dir,'images',image.filename);
}
export async function collectImage(store,id,input){
  const source=store.sources(id).find(s=>s.id===input.source_id);
  if(!source||!['article','post'].includes(source.kind)||!source.url)throw new Error('图片须关联本话题有原文链接的 article/post 来源');
  if(!input.verified_scene)throw new Error('请先查看图片并核对场景，不能仅凭文件名确认');
  const r=await fetchImage(input.url);
  if(store.sources(id).find(s=>s.id===source.id)?.raw_hash!==source.raw_hash)throw new Error('下载期间来源已更新，请重新核对图片');
  const digest=createHash('sha256').update(r.bytes).digest('hex');
  const metadata={...input,url:canonical(input.url),resolved_url:r.url,source_raw_hash:source.raw_hash,source_url:source.url,sha256:digest,filename:`${digest}.${r.extension}`};
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
  try{validate(store,id,'write',writing.content);}catch(e){warnings.push(`稿件检查：${e.message}`);}
  if(!review||review.content.verdict!=='pass')warnings.push('成稿检查尚未通过');
  const sources=new Map(store.sources(id).map(s=>[s.id,s]));
  const allImages=imagesFor(store,id),files={},packs=[];
  const writeText=(path,text)=>{files[path]=strToU8(text);};
  for(const platform of platforms){
    const draft=writing.content.drafts.find(d=>d.platform===platform);
    if(!draft){warnings.push(`${names[platform]}缺少稿件`);continue;}
    const selected=[],seen=new Set();
    // New selections take precedence; preserve earlier records for audit.
    for(const image of [...allImages].reverse()){
      if(!image.platforms.includes(platform)||seen.has(image.sha256))continue;
      if(sources.get(image.source_id)?.raw_hash!==image.source_raw_hash)continue;
      const file=imageFile(store,image);
      if(!existsSync(file)){warnings.push(`图片文件缺失：${image.id}`);continue;}
      const bytes=readFileSync(file);
      if(createHash('sha256').update(bytes).digest('hex')!==image.sha256){warnings.push(`图片文件校验失败：${image.id}`);continue;}
      const index=selected.length+1,path=`${platform}/images/${String(index).padStart(2,'0')}_${image.placement}.${image.filename.split('.').at(-1)}`;
      files[path]=bytes;seen.add(image.sha256);
      selected.push({...image,file:path,after_paragraph:image.placement==='cover'?0:image.placement==='result'?draft.blocks.length:Math.max(1,Math.floor(draft.blocks.length/2))});
      if(selected.length>=3)break;
    }
    if(!selected.length)warnings.push(`${names[platform]}缺少已核对并下载的配图`);
    writeText(`${platform}/标题.txt`,draft.title);
    writeText(`${platform}/正文.txt`,draft.blocks.map(b=>b.text).join('\n\n'));
    writeText(`${platform}/插图说明.txt`,selected.map(i=>`${i.file}\n位置：${i.after_paragraph===0?'标题后、正文前':`正文第${i.after_paragraph}段后`}\n图注：${i.caption}\n署名：${i.credit}\n来源：${i.source_url}\n使用说明：${i.usage_note}`).join('\n\n')||'暂缺配图，交付包不完整');
    packs.push({platform,name:names[platform],title:draft.title,body:draft.blocks.map(b=>b.text).join('\n\n'),images:selected,title_file:`${platform}/标题.txt`,body_file:`${platform}/正文.txt`});
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
  writeText('发布说明.txt',`${manifest.ready_for_handoff?'稿件与配图齐备':'交付包待补全'}；${manifest.human_approved?'人工已确认':'等待人工确认'}；内容未发布。\n\n每个平台复制标题.txt和正文.txt，再按插图说明上传对应images图片。不要把审核资料中的引用编号或过程说明复制到正文。\n\n${warnings.join('\n')}`);
  for(const [relative,bytes] of Object.entries(files)){
    const path=join(directory,relative);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes);
  }
  const zipName=`${stem}.zip`;writeFileSync(join(store.dir,'publish-packs',zipName),zipSync(files,{level:0}));
  store.event(id,'publish_pack_exported',{draft_id:writing.id,fingerprint,ready_for_handoff:manifest.ready_for_handoff,warnings});
  return {directory,zip_name:zipName,download_url:`/api/packs/${zipName}`,manifest};
}
