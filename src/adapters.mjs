import { load } from 'cheerio';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { XMLParser } from 'fast-xml-parser';
import { DatabaseSync } from 'node:sqlite';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { basename, resolve } from 'node:path';
import { canonical, now, normalize } from './store.mjs';

const waits = new Map();
const epoch = n => Number.isFinite(Number(n)) && Number(n)>0 ? new Date(Number(n)*1000).toISOString() : null;
const hostIs = (host, domain) => host === domain || host.endsWith(`.${domain}`);
const fakeIP = ip => /^198\.1[89]\./.test(ip) || /^fdfe:dcba:9876:/i.test(ip);
const blockedIP = ip => /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) || ip==='::1' || /^(fc|fd|fe80|::ffff:)/i.test(ip);
async function fetchBytes(url,{allowLocal=false,headers={},maxBytes=3*1024*1024}={}) {
  let current=canonical(url);
  for(let redirects=0;redirects<4;redirects++) {
    const u=new URL(current),host=u.hostname.replace(/^\[|\]$/g,'');
    const addresses=isIP(host)?[{address:host}]:await lookup(host,{all:true});
    // Proxy TUN fake-IP addresses (198.18.0.0/15, Clash's default fdfe:dcba:9876::/48) are exempt,
    // but must never exempt other addresses returned by the same DNS lookup.
    if(!allowLocal && addresses.some(a=>blockedIP(a.address)&&!fakeIP(a.address)))throw new Error('公共采集不允许访问内网地址；本地 RSSHub 请在配置中显式启用 allowLocal');
    const delay=Math.max(0,(waits.get(u.host)||0)-Date.now()); if(delay)await new Promise(r=>setTimeout(r,delay));waits.set(u.host,Date.now()+1200);
    const r=await fetch(current,{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'HotdeskLocal/0.1 (personal research; bounded sampling)','Accept':'application/json,text/html,application/rss+xml,application/atom+xml;q=0.9',...headers}});
    if(r.status>=300&&r.status<400&&r.headers.get('location')){const dest=new URL(r.headers.get('location'),current);if(dest.origin!==u.origin&&headers.Authorization)throw new Error('拒绝向其他站点转发认证信息');current=dest.href;continue;}
    const reader=r.body.getReader(); const chunks=[];let size=0;
    for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();throw new Error(`响应超过 ${maxBytes/1024/1024}MB 限额`);}chunks.push(value);}
    return {bytes:Buffer.concat(chunks),url:current,status:r.status,ok:r.ok,content_type:r.headers.get('content-type')||''};
  }
  throw new Error('重定向次数超限');
}
function json(raw){try{return JSON.parse(raw.body);}catch{throw new Error('来源返回非 JSON 内容，可能需要登录或页面已变更');}}
function biliData(raw){const j=json(raw);if(j.code!==0)throw new Error(`B站接口状态 ${j.code}: ${j.message||'访问受限'}`);return j.data;}
export function parseRSS(body,platform='rss') {
  const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@',processEntities:true});const d=parser.parse(body);
  const items=d.rss?.channel?.item||d.feed?.entry||[];const list=Array.isArray(items)?items:[items];
  const val=x=>typeof x==='object'?(x?.['#text']||''):String(x||'');
  return list.slice(0,50).map(item=>{
    const links=Array.isArray(item.link)?item.link:[item.link];const link=links.find(x=>typeof x==='object'&&(!x['@rel']||x['@rel']==='alternate'))||links[0];
    const url=typeof link==='object'?link?.['@href']:link;
    return {title:normalize(val(item.title)),url:url?canonical(url):'',body:load(val(item.description||item.summary||item.content||item['content:encoded'])).text().trim(),published_at:val(item.pubDate||item.published||item.updated)||null,platform,kind:'article',external_id:val(item.guid||item.id)||undefined};
  }).filter(i=>i.title&&i.url);
}
// Article text via Mozilla Readability (Firefox Reader View); falls back to raw page text.
const PAGE_CHROME='script,style,nav,aside,footer,noscript,svg,form';
function paragraphText($,root){
  root.find('br').replaceWith('\n');
  root.find('p,div,section,article,main,blockquote,li,h1,h2,h3,h4,h5,h6').each((_,el)=>{$(el).prepend('\n').append('\n');});
  return root.text().split(/\r?\n/).map(normalize).filter(Boolean).join('\n');
}
export async function fetchRaw(store,url,options={}) {
  const r=await fetchBytes(url,options),body=new TextDecoder().decode(r.bytes);
  const raw_hash=store.raw(body,{url:r.url,http_status:r.status});
  if(!r.ok)throw new Error(`HTTP ${r.status}：来源未允许此次访问；快照 ${raw_hash.slice(0,12)}。可使用授权接口或手动导入。`);
  if(/<title>[^<]*(验证|安全|captcha|Attention Required)/i.test(body))throw new Error('来源返回验证页，未将其当作素材');
  return {body,raw_hash,url:r.url};
}
export async function fetchImage(url){
  const r=await fetchBytes(url,{maxBytes:8*1024*1024});
  if(!r.ok)throw new Error(`图片 HTTP ${r.status}`);
  const b=r.bytes;
  const extension=b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':b[0]===255&&b[1]===216&&b[2]===255?'jpg':b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'?'webp':null;
  if(!extension||b.length<24||!/^image\/(png|jpeg|webp)(?:;|$)/i.test(r.content_type))throw new Error('未取得有效 PNG/JPEG/WebP 图片；不接受网页、验证页或 SVG');
  return {...r,extension};
}
export function imageCandidates(body,url){
  const $=load(body),urls=new Set();
  for(const src of [$('meta[property="og:image"]').attr('content'),...$('img').toArray().map(el=>$(el).attr('src')||$(el).attr('data-src'))]){
    if(!src||/qrcode|ewm|logo/i.test(src))continue;
    try{urls.add(canonical(new URL(src,url).href));}catch{}
    if(urls.size>=20)break;
  }
  return [...urls];
}
// Images on a page, article-body images first. in_article comes from Readability's article content,
// so sidebar/recommendation photos (a common source of mismatched pictures) are flagged.
export function articleImages(body,url){
  const abs=src=>{if(!src)return null;try{const u=canonical(new URL(src,url).href);return /^https?:/.test(u)?u:null;}catch{return null;}};
  const inArticle=new Set();
  try{const {document}=parseHTML(body);document.querySelectorAll(PAGE_CHROME).forEach(el=>el.remove());const a=new Readability(document,{charThreshold:40}).parse();
    if(a?.content){const $a=load(a.content);$a('img').each((_,el)=>{
      // Thumbnails linking to another page are recommendation items, not article photos.
      const href=$a(el).closest('a[href]').attr('href');if(href&&!/\.(jpe?g|png|webp|gif)(\?|$)/i.test(href))return;
      const u=abs($a(el).attr('data-src')||$a(el).attr('data-original')||$a(el).attr('src'));if(u)inArticle.add(u);});}}catch{}
  const $=load(body),out=new Map(),og=abs($('meta[property="og:image"]').attr('content'));
  if(og)out.set(og,{url:og,alt:normalize($('meta[property="og:title"]').attr('content')),caption:'',in_article:inArticle.has(og),og:true});
  $('img').each((_,el)=>{const e=$(el),u=abs(e.attr('data-src')||e.attr('data-original')||e.attr('src'));if(!u||/qrcode|ewm|logo|avatar|icon/i.test(u)||out.has(u))return;
    out.set(u,{url:u,alt:normalize(e.attr('alt')||e.attr('title')),caption:normalize(e.closest('figure').find('figcaption').text()).slice(0,200),in_article:inArticle.has(u),og:false});});
  return [...out.values()].sort((a,b)=>b.in_article-a.in_article).slice(0,30);
}
function readable(body){
  let text='';try{
    const {document}=parseHTML(body);document.querySelectorAll(PAGE_CHROME).forEach(el=>el.remove());
    const article=new Readability(document,{charThreshold:40}).parse();
    if(article?.content){const $=load(article.content);text=paragraphText($,$('body'));}
  }catch{}
  return text.length>=40?text:'';
}
function fallbackText($){
  $(PAGE_CHROME).remove();
  const root=$('article').first().text().trim()?$('article').first():$('main').first().text().trim()?$('main').first():$('body');
  return paragraphText($,root);
}
// Remove only recognized standalone boilerplate at the end. Recommendation
// words may be legitimate reporting or headings; never cut the body at them.
const PLATFORM_TAIL=/^(?:特别声明[:：]\s*以上内容为自媒体用户上传[。.]?|\[责任编辑[:：][^\]\r\n]{1,80}\])$/;
export function trimTail(text){
  const paragraphs=String(text).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  while(paragraphs.length&&PLATFORM_TAIL.test(paragraphs.at(-1)))paragraphs.pop();
  return paragraphs.join('\n');
}
export function parsePage(body,url) {
  const $=load(body);const host=new URL(url).hostname;
  const title=normalize($('meta[property="og:title"]').attr('content')||$('title').text());
  if(hostIs(host,'tieba.baidu.com')) {
    const rows=[];$('.l_post').each((_,el)=>{const e=$(el),text=normalize(e.find('.d_post_content').text());if(!text)return;let fields={};try{fields=JSON.parse(e.attr('data-field')||'{}');}catch{}rows.push({platform:'tieba',kind:rows.length?'comment':'post',title,body:text,url,external_id:String(fields.content?.post_id||'' )||undefined,metadata:{floor:fields.content?.post_no||null,sample:'公开页面可见楼层'}});});
    if(!rows.length)$('.d_post_content').each((i,el)=>rows.push({platform:'tieba',kind:i?'comment':'post',title,body:normalize($(el).text()),url}));
    return rows.slice(0,40);
  }
  if(hostIs(host,'xiaohongshu.com')||host==='xhslink.com') {
    const text=normalize($('#detail-desc').text()||$('.note-content .desc').text()||$('meta[name="description"]').attr('content'));
    if(!text||text.length<20||/小红书是一个|小红书是年轻人|你访问的页面不见了|请.*登录/.test(text)||/小红书.*你的生活指南/.test(title))return [];
    return [{platform:'xiaohongshu',kind:'post',title,body:text,url,metadata:{sample:'公开分享页正文；未获取评论',comments_available:false}}];
  }
  const article=readable(body),text=normalize(trimTail(article||fallbackText($)));
  return text.length>=40?[{platform:'web',kind:'article',title:title||url,body:text.slice(0,60000),url,metadata:{extractor:article?'readability':'fallback'}}]:[];
}
export function parseBaiduBoard(body){
  const m=body.match(/<!--s-data:([\s\S]*?)-->/);
  try{const list=JSON.parse(m[1]).data.cards[0].content;if(Array.isArray(list)&&list.length)return list.filter(v=>v.word).map((v,i)=>({title:normalize(v.word),url:v.url||`https://www.baidu.com/s?wd=${encodeURIComponent(v.word)}`,body:normalize(v.desc),rank:i+1,platform:'baidu',metadata:{hot_score:Number(v.hotScore)||null,rank_type:'baidu_realtime_rank'}}));}catch{}
  const $=load(body),items=[];
  $('[class*="category-wrap"]').each((i,el)=>{const title=normalize($(el).find('[class*="c-single-text-ellipsis"]').first().text());if(title)items.push({title,url:`https://www.baidu.com/s?wd=${encodeURIComponent(title)}`,body:normalize($(el).find('[class*="hot-desc"]').text()).replace(/\s*查看更多>.*$/,''),rank:items.length+1,platform:'baidu',metadata:{rank_type:'baidu_realtime_rank'}});});
  return items;
}
export class Adapters {
  constructor(store){this.store=store;}
  async discover(source,limit=12){
    limit=Math.min(Math.max(Number(limit)||12,1),50);let raw,items;
    if(source==='bilibili'){
      raw=await fetchRaw(this.store,`https://api.bilibili.com/x/web-interface/popular?ps=${limit}&pn=1`);
      items=biliData(raw).list.map((v,i)=>({title:v.title,url:`https://www.bilibili.com/video/${v.bvid}`,body:v.desc,rank:i+1,platform:'bilibili',published_at:epoch(v.pubdate),metadata:{aid:v.aid,bvid:v.bvid,view:v.stat?.view,rank_type:'popular_feed_order'}}));
    }else if(source==='tieba'){
      raw=await fetchRaw(this.store,'https://tieba.baidu.com/hottopic/browse/topicList');
      const list=json(raw).data?.bang_topic?.topic_list;if(!Array.isArray(list))throw new Error('贴吧热议榜格式已变化');
      items=list.slice(0,limit).map((v,i)=>({title:v.topic_name,url:v.topic_url.replaceAll('&amp;','&'),body:v.topic_desc,rank:v.idx_num||i+1,platform:'tieba',published_at:epoch(v.create_time),metadata:{reported_discuss_num:v.discuss_num,rank_type:'hot_topic_rank'}}));
    }else if(source==='baidu'){
      // Direct Baidu realtime board (no NewsNow needed). Prefer the embedded s-data JSON; class names are a fallback.
      raw=await fetchRaw(this.store,'https://top.baidu.com/board?tab=realtime');items=parseBaiduBoard(raw.body).slice(0,limit);
    }else if(source==='reddit'){
      raw=await this.redditRequest('/r/popular/hot',`limit=${limit}`);
      items=json(raw).data?.children?.filter(x=>x.kind==='t3').map((x,i)=>({title:x.data.title,url:`https://www.reddit.com${x.data.permalink}`,body:x.data.selftext||'',rank:i+1,platform:'reddit',published_at:epoch(x.data.created_utc),metadata:{score:x.data.score,num_comments:x.data.num_comments,rank_type:'hot_feed_order'}}));
    }else if(source.startsWith('rss:')){
      const feeds=this.store.setting('feeds',[]);const feed=feeds.find(f=>f.id===source.slice(4));if(!feed)throw new Error('RSS 配置不存在');
      raw=await fetchRaw(this.store,feed.url,{allowLocal:feed.allowLocal===true});items=parseRSS(raw.body,`rss:${feed.id}`).slice(0,limit);
    }else if(source==='trendradar'){
      const path=this.store.setting('trendradar_path');if(!path)throw new Error('请先配置 TrendRadar 现有 news/*.db 路径');return this.importTrendRadar(path,limit);
    }else if(source.startsWith('newsnow:')){
      const endpoint=this.store.setting('newsnow_base','http://127.0.0.1:4444/api/s');const u=new URL(endpoint);u.searchParams.set('id',source.slice(8));
      raw=await fetchRaw(this.store,u.href,{allowLocal:true}).catch(e=>{throw /ECONNREFUSED|fetch failed/.test(String(e?.cause?.code||e.message))?new Error(`连不上 NewsNow（${u.origin}）：请先运行 scripts/Start-NewsNow.ps1，或在数据源设置里改地址`):e;});const d=json(raw);if(!Array.isArray(d.items))throw new Error(`热榜返回 ${d.status||'未知格式'}`);
      items=d.items.slice(0,limit).map((v,i)=>({title:v.title,url:v.url,rank:i+1,platform:source.slice(8),body:'',observed_at:d.updatedTime?new Date(d.updatedTime).toISOString():now(),metadata:{upstream:'newsnow'}}));
    }else throw new Error('未知榜单源');
    if(!items?.length)throw new Error('未解析到条目；请检查来源或格式');
    return {source,count:items.length,topic_ids:this.store.ingest(items,raw.raw_hash),raw_hash:raw.raw_hash};
  }
  importTrendRadar(path,limit=50){
    const db=new DatabaseSync(resolve(path),{readOnly:true});
    try{
      const cols=db.prepare('PRAGMA table_info(news_items)').all().map(x=>x.name);
      if(!['title','platform_id','rank','url','created_at','updated_at'].every(c=>cols.includes(c)))throw new Error('不支持此 TrendRadar 数据库结构；需要含 news_items 的 news/*.db');
      const rows=db.prepare('SELECT id,title,platform_id,rank,url,created_at,updated_at FROM news_items ORDER BY updated_at DESC LIMIT ?').all(Math.min(limit,100));
      const stamp=s=>new Date(String(s).includes('T')?s:String(s).replace(' ','T')+'+08:00').toISOString();
      const raw_hash=this.store.raw(rows,{adapter:'trendradar-sqlite',file:basename(path)});
      const ids=this.store.ingest(rows.filter(r=>r.title).map(r=>({title:r.title,url:r.url||'',platform:r.platform_id,rank:r.rank,observed_at:stamp(r.updated_at),metadata:{adapter:'trendradar-sqlite',upstream_first_seen:stamp(r.created_at)}})),raw_hash);
      const hasHistory=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rank_history'").get();
      if(hasHistory)for(const row of rows){const t=this.store.findTopic(row.title,row.url);if(!t)continue;for(const h of db.prepare('SELECT rank,created_at FROM rank_history WHERE news_item_id=? ORDER BY created_at LIMIT 300').all(row.id)){this.store.db.prepare('INSERT OR IGNORE INTO observations VALUES(?,?,?,?,?,?,?)').run(`tr_${raw_hash.slice(0,8)}_${row.id}_${h.created_at}_${h.rank}`,t.id,row.platform_id,row.url||'',h.rank,stamp(h.created_at),raw_hash);}}
      return {source:'trendradar',count:rows.length,topic_ids:ids,raw_hash,mode:'read-only'};
    }finally{db.close();}
  }
  async redditRequest(path,query=''){
    const token=process.env.REDDIT_ACCESS_TOKEN;const base=token?'https://oauth.reddit.com':'https://www.reddit.com';
    return fetchRaw(this.store,`${base}${path}${token?'':'.json'}?${query}`,{headers:token?{Authorization:`Bearer ${token}`}:{}});
  }
  async search(platform,query,limit=8){
    query=normalize(query);if(!query||query.length>200)throw new Error('关键词需为 1–200 字符');limit=Math.min(Number(limit)||8,20);
    let raw,items=[];
    if(platform==='bilibili'){
      raw=await fetchRaw(this.store,`https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(query)}&page=1`);
      items=(biliData(raw).result||[]).slice(0,limit).map(v=>({title:load(v.title||'').text(),url:`https://www.bilibili.com/video/${v.bvid}`,platform,body:v.description||''}));
    }else if(platform==='reddit'){
      raw=await this.redditRequest('/search',`q=${encodeURIComponent(query)}&sort=relevance&limit=${limit}&type=link`);
      items=(json(raw).data?.children||[]).map(v=>({title:v.data.title,url:`https://www.reddit.com${v.data.permalink}`,platform,body:v.data.selftext||''}));
    }else if(platform==='tieba'){
      raw=await fetchRaw(this.store,`https://tieba.baidu.com/f/search/res?isnew=1&qw=${encodeURIComponent(query)}`);
      const $=load(raw.body);$('.s_post').each((_,el)=>{const a=$(el).find('a.bluelink').first();const href=a.attr('href');if(href&&items.length<limit)items.push({title:normalize(a.text()),url:new URL(href,'https://tieba.baidu.com').href,body:normalize($(el).find('.p_content').text()),platform});});
    }else if(platform==='xiaohongshu')return {platform,status:'needs_browser',items:[],search_url:`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(query)}`,message:'第一版不调用私有签名搜索接口。请在已登录浏览器搜索后导入公开分享链接或可见正文、评论。Agent 也可通过 import_sources 写回。'};
    else throw new Error('不支持的平台');
    return {platform,status:items.length?'ok':'empty',items,raw_hash:raw.raw_hash,message:items.length?'仅检索结果，需采集正文和评论':'未解析到结果，可能是无结果或页面结构变化'};
  }
  async collect(id,url,{benchmark}={}){
    this.store.topic(id);const u=new URL(canonical(url));let rows=[],raw;const warnings=[];
    if(hostIs(u.hostname,'bilibili.com')&&/\/video\/(BV[\w]+)/.test(u.pathname)){
      const bvid=u.pathname.match(/\/video\/(BV[\w]+)/)[1];raw=await fetchRaw(this.store,`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);const v=biliData(raw);
      rows.push({platform:'bilibili',kind:'post',title:v.title,body:v.desc||v.title,url:`https://www.bilibili.com/video/${bvid}`,published_at:epoch(v.pubdate),raw_hash:raw.raw_hash,metadata:{aid:v.aid,creator:v.owner?.name,scope:'视频简介；未提取音视频内容'}});
      try{
        const comments=await fetchRaw(this.store,`https://api.bilibili.com/x/v2/reply?type=1&oid=${v.aid}&pn=1&ps=20&sort=2`);const data=biliData(comments);
        for(const c of [...(data.top_replies||[]),...(data.replies||[])].slice(0,25))rows.push({platform:'bilibili',kind:'comment',title:'B站热门评论样本',url:`https://www.bilibili.com/video/${bvid}#reply${c.rpid_str||c.rpid}`,body:c.content?.message||'',external_id:String(c.rpid_str||c.rpid),published_at:epoch(c.ctime),raw_hash:comments.raw_hash,metadata:{likes:c.like,sort:'hot',page:1}});
        if(!data.replies?.length)warnings.push('评论接口未返回评论；不据此判断无人讨论');
      }catch(e){warnings.push(e.message);}
    }else if(/(^|\.)reddit\.com$/.test(u.hostname)&&u.pathname.includes('/comments/')){
      const path=u.pathname.replace(/\.json$/,'').replace(/\/$/,'');raw=await this.redditRequest(path,'limit=30&depth=2&sort=top');const data=json(raw);const post=data[0]?.data?.children?.[0]?.data;
      if(!post)throw new Error('Reddit 帖子格式不可用');rows.push({platform:'reddit',kind:'post',title:post.title,body:post.selftext||post.title,url,raw_hash:raw.raw_hash,published_at:epoch(post.created_utc)});
      for(const c of data[1]?.data?.children||[]){if(c.kind!=='t1'||['[deleted]','[removed]'].includes(c.data.body))continue;rows.push({platform:'reddit',kind:'comment',title:'Reddit 评论样本',body:c.data.body,url:`https://www.reddit.com${c.data.permalink}`,external_id:c.data.name,published_at:epoch(c.data.created_utc),raw_hash:raw.raw_hash,metadata:{score:c.data.score,sort:'top',depth:1}});}
    }else{
      raw=await fetchRaw(this.store,url);rows=parsePage(raw.body,raw.url).map(r=>({...r,raw_hash:raw.raw_hash}));
      if(!rows.length&&u.hostname==='tieba.baidu.com'&&u.pathname.includes('/hottopic/')){
        const $=load(raw.body);const links=[...new Set($('a[href]').toArray().map(el=>$(el).attr('href')).filter(h=>/\/p\/\d+/.test(h)))].slice(0,2);
        for(const link of links){try{const rr=await fetchRaw(this.store,new URL(link,url).href);rows.push(...parsePage(rr.body,rr.url).map(r=>({...r,raw_hash:rr.raw_hash})));}catch(e){warnings.push(e.message);}}
      }
      if(hostIs(u.hostname,'xiaohongshu.com')||u.hostname==='xhslink.com')warnings.push('小红书仅尝试公开分享页正文；评论需通过浏览器可见内容导入');
    }
    if(!rows.length)throw new Error('没有获得可用正文，可能需要登录或页面不受支持；请导入正文/评论，不会把页面外壳算作采集成功');
    if(benchmark)rows=rows.filter(r=>r.kind!=='comment').map(r=>({...r,kind:'benchmark',metadata:{...r.metadata,tier:benchmark}}));
    const saved=rows.filter(r=>r.body||r.title).map(r=>this.store.addSource(id,{...r,metadata:{...r.metadata,verification:{status:'collected',at:now()}}}));
    return {status:warnings.length?'partial':'ok',count:saved.filter(s=>!s.duplicate).length,total:saved.length,comments:rows.filter(r=>r.kind==='comment').length,source_ids:saved.map(s=>s.id),image_candidates:raw?.body?.includes('<')?articleImages(raw.body,raw.url):[],warnings};
  }
}
