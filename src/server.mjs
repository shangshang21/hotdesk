import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { Store, now } from './store.mjs';
import { callTool } from './tools.mjs';
import { exportMarkdown,validate } from './pipeline.mjs';
import { modelConfigured,runPipeline } from './worker.mjs';

export function createApp(store=new Store()){
  const token=randomBytes(32).toString('hex');
  const server=createServer(async(req,res)=>{
    const host=req.headers.host||'';if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host)){res.writeHead(403);return res.end('Local access only');}
    const origin=`http://${host}`,url=new URL(req.url,origin);
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send=(status,data,type='application/json; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type});res.end(typeof data==='string'?data:JSON.stringify(data));};
    try{
      if(req.headers.origin&&req.headers.origin!==origin)return send(403,{error:'不允许跨站请求'});
      if(req.method==='GET'){
        if(url.pathname==='/api/health')return send(200,{app:'hotdesk-local',version:'0.1.0',data_dir:store.dir});
        if(url.pathname==='/api/session')return send(200,{token});
        if(url.pathname==='/api/state')return send(200,{topics:store.list(),jobs:store.jobs(),model_configured:modelConfigured(),config:{feeds:store.setting('feeds',[]),trendradar_path:store.setting('trendradar_path',''),newsnow_base:store.setting('newsnow_base','https://newsnow.busiyi.world/api/s')},claims:store.db.prepare("SELECT topic_id,stage,actor,expires_at FROM claims WHERE status='active' AND expires_at>?").all(now())});
        if(url.pathname.startsWith('/api/topic/'))return send(200,store.detail(url.pathname.split('/').at(-1)));
        if(url.pathname.startsWith('/api/raw/'))return send(200,store.readRaw(url.pathname.split('/').at(-1)),'text/plain; charset=utf-8');
        if(url.pathname.startsWith('/api/export/')){res.setHeader('Content-Disposition','attachment; filename="hotdesk-review.md"');return send(200,exportMarkdown(store,url.pathname.split('/').at(-1)),'text/markdown; charset=utf-8');}
        const assets={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};if(assets[url.pathname])return send(200,readFileSync(fileURLToPath(new URL(`../public/${assets[url.pathname]}`,import.meta.url)),'utf8'),url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':url.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');
        return send(404,{error:'不存在'});
      }
      if(req.method!=='POST')return send(405,{error:'不支持此方法'});
      if(req.headers['x-hotdesk-token']!==token)return send(403,{error:'会话失效，请刷新页面'});
      if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'请使用 JSON'});
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>2*1024*1024)return send(413,{error:'请求超过 2MB'});}
      const a=JSON.parse(body||'{}');
      if(url.pathname==='/api/config'){
        if(!Array.isArray(a.feeds)||a.feeds.length>20)throw new Error('RSS 源需为数组，最多 20 条');
        const ids=new Set();for(const f of a.feeds){if(!/^[a-zA-Z0-9_-]{1,40}$/.test(f.id)||ids.has(f.id))throw new Error('RSS ID 需唯一且只用字母/数字/下划线');ids.add(f.id);if(!['http:','https:'].includes(new URL(f.url).protocol))throw new Error('RSS URL 必须是 HTTP(S)');}
        store.setSetting('feeds',a.feeds.map(f=>({id:f.id,name:String(f.name||f.id),url:f.url,allowLocal:f.allowLocal===true})));
        if(a.trendradar_path!==undefined)store.setSetting('trendradar_path',String(a.trendradar_path));
        if(a.newsnow_base){const u=new URL(a.newsnow_base);if(!['https:','http:'].includes(u.protocol))throw new Error('无效热榜接口地址');store.setSetting('newsnow_base',u.href);}
        store.event(null,'config_updated',{feed_ids:[...ids]});return send(200,{saved:true});
      }
      if(url.pathname==='/api/pause'){store.pause(a.topic_id,a.paused);return send(200,{ok:true});}
      if(url.pathname==='/api/approve'){return send(200,{approved_artifact:store.approve(a.topic_id)});}
      if(url.pathname==='/api/edit'){
        const old=store.latest(a.topic_id,a.stage);if(!old||old.id!==a.artifact_id)throw new Error('结果已被更新，请刷新后再编辑');
        const content=validate(store,a.topic_id,a.stage,a.content);
        return send(200,store.saveArtifact(a.topic_id,a.stage,content,'human-editor',store.basis(a.topic_id,a.stage),null));
      }
      if(url.pathname==='/api/generate'){
        if(!modelConfigured())throw new Error('请通过 Agent 接口领取工序，或按 README 配置独立模型。');
        runPipeline(store,a.topic_id).catch(e=>store.event(a.topic_id,'pipeline_error',{error:e.message}));return send(202,{queued:true});
      }
      if(url.pathname.startsWith('/api/tool/')){
        const name=url.pathname.split('/').at(-1);
        if(url.searchParams.get('background')==='1'&&['discover','collect_url'].includes(name)){
          callTool(store,name,a).catch(e=>store.event(a.topic_id||null,'adapter_error',{tool:name,error:e.message}));return send(202,{queued:true});
        }
        return send(200,await callTool(store,name,a));
      }
      return send(404,{error:'不存在'});
    }catch(e){return send(400,{error:e.message});}
  });
  return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const store=new Store();store.db.prepare("UPDATE jobs SET status='interrupted',error='服务重启，任务未完成，可重新运行',updated_at=? WHERE status='running'").run(now());
  const port=Number(process.env.HOTDESK_PORT||4317);const server=createApp(store);
  server.listen(port,'127.0.0.1',()=>console.log(`Hotdesk → http://127.0.0.1:${port}\nData: ${store.dir}\nAgent: node src/mcp.mjs`));
  server.on('error',e=>{console.error(e.message);process.exitCode=1;store.close();});
  process.on('SIGINT',()=>server.close(()=>{store.close();process.exit(0);}));
}
