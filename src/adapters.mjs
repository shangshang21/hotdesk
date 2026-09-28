import { load } from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import { DatabaseSync } from 'node:sqlite';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { basename, resolve } from 'node:path';
import { canonical, now, normalize } from './store.mjs';

const waits = new Map();
const epoch = n => Number.isFinite(Number(n)) && Number(n)>0 ? new Date(Number(n)*1000).toISOString() : null;
const hostIs = (host, domain) => host === domain || host.endsWith(`.${domain}`);
const blockedIP = ip => /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) || ip==='::1' || /^(fc|fd|fe80|::ffff:)/i.test(ip);
export async function fetchRaw(store,url,{allowLocal=false,headers={}}={}) {
  let current=canonical(url);
  for(let redirects=0;redirects<4;redirects++) {
    const u=new URL(current),host=u.hostname.replace(/^\[|\]$/g,'');
    const addresses=isIP(host)?[{address:host}]:await lookup(host,{all:true});
    if(!allowLocal && addresses.some(a=>blockedIP(a.address)))throw new Error('公共采集不允许访问内网地址；本地 RSSHub 请在配置中显式启用 allowLocal');
    const delay=Math.max(0,(waits.get(u.host)||0)-Date.now()); if(delay)await new Promise(r=>setTimeout(r,delay));waits.set(u.host,Date.now()+1200);
    const r=await fetch(current,{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'HotdeskLocal/0.1 (personal research; bounded sampling)','Accept':'application/json,text/html,application/rss+xml,application/atom+xml;q=0.9',...headers}});
    if(r.status>=300&&r.status<400&&r.headers.get('location')){const dest=new URL(r.headers.get('location'),current);if(dest.origin!==u.origin&&headers.Authorization)throw new Error('拒绝向其他站点转发认证信息');current=dest.href;continue;}
    const reader=r.body.getReader(); const chunks=[];let size=0;
    for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>3*1024*1024){await reader.cancel();throw new Error('响应超过 3MB 限额');}chunks.push(value);}
    const body=new TextDecoder().decode(Buffer.concat(chunks));const raw_hash=store.raw(body,{url:current,http_status:r.status});
    if(!r.ok)throw new Error(`HTTP ${r.status}：来源未允许此次访问；快照 ${raw_hash.slice(0,12)}。可使用授权接口或手动导入。`);
    if(/<title>[^<]*(验证|安全|captcha|Attention Required)/i.test(body))throw new Error('来源返回验证页，未将其当作素材');
    return {body,raw_hash,url:current};
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
  $('script,style,nav,footer,header,noscript,svg,form').remove();
  const text=normalize($('article').first().text()||$('main').first().text()||$('body').text());
  return text.length>=40?[{platform:'web',kind:'article',title:title||url,body:text.slice(0,60000),url}]:[];
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
    }else if(source==='reddit'){
      raw=await this.redditRequest('/r/popular/hot',`limit=${limit}`);
      items=json(raw).data?.children?.filter(x=>x.kind==='t3').map((x,i)=>({title:x.data.title,url:`https://www.reddit.com${x.data.permalink}`,body:x.data.selftext||'',rank:i+1,platform:'reddit',published_at:epoch(x.data.created_utc),metadata:{score:x.data.score,num_comments:x.data.num_comments,rank_type:'hot_feed_order'}}));
    }else if(source.startsWith('rss:')){
      const feeds=this.store.setting('feeds',[]);const feed=feeds.find(f=>f.id===source.slice(4));if(!feed)throw new Error('RSS 配置不存在');
      raw=await fetchRaw(this.store,feed.url,{allowLocal:feed.allowLocal===true});items=parseRSS(raw.body,`rss:${feed.id}`).slice(0,limit);
    }else if(source==='trendradar'){
      const path=this.store.setting('trendradar_path');if(!path)throw new Error('请先配置 TrendRadar 现有 news/*.db 路径');return this.importTrendRadar(path,limit);
    }else if(source.startsWith('newsnow:')){
      const endpoint=this.store.setting('newsnow_base','https://newsnow.busiyi.world/api/s');const u=new URL(endpoint);u.searchParams.set('id',source.slice(8));
      raw=await fetchRaw(this.store,u.href);const d=json(raw);if(!Array.isArray(d.items))throw new Error(`热榜返回 ${d.status||'未知格式'}`);
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
  async collect(id,url){
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
    const saved=rows.filter(r=>r.body||r.title).map(r=>this.store.addSource(id,r));
    return {status:warnings.length?'partial':'ok',count:saved.filter(s=>!s.duplicate).length,total:saved.length,comments:rows.filter(r=>r.kind==='comment').length,source_ids:saved.map(s=>s.id),warnings};
  }
}
