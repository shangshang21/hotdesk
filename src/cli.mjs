import { readFileSync, writeFileSync } from 'node:fs';
import { Store } from './store.mjs';
import { callTool,toolDefinitions } from './tools.mjs';
import { runPipeline } from './worker.mjs';
const [command,...rest]=process.argv.slice(2);
if(!command||command==='help'){
  console.log(`Hotdesk CLI — 本地热点生产线\n\nnode src/cli.mjs tools\nnode src/cli.mjs list_topics\nnode src/cli.mjs discover '{"source":"bilibili","limit":8}'\nnode src/cli.mjs create_topic '{"title":"我的选题"}'\nnode src/cli.mjs <工具名> --file 输入.json\nnode src/cli.mjs export_draft --file 输入.json --out 稿件.md\nnode src/cli.mjs run <topic_id>  # 可选独立模型\n\nWindows 推荐 --file 避免 shell JSON 引号差异。MCP: node src/mcp.mjs\n网页: npm start；默认数据在项目 data/，可用 HOTDESK_DATA 指定。`);
}else if(command==='tools')console.log(JSON.stringify(Object.fromEntries(Object.entries(toolDefinitions).map(([k,v])=>[k,v.description])),null,2));
else{
  const store=new Store();try{
    const fileIndex=rest.indexOf('--file');const args=fileIndex>=0?JSON.parse(readFileSync(rest[fileIndex+1],'utf8').replace(/^\uFEFF/,'')):rest[0]?JSON.parse(command==='run'?'{}':rest[0]):{};
    const result=command==='run'?await runPipeline(store,rest[0]):await callTool(store,command,args);
    const outIndex=rest.indexOf('--out');if(outIndex>=0){writeFileSync(rest[outIndex+1],result.markdown||JSON.stringify(result,null,2),'utf8');console.log(JSON.stringify({saved:rest[outIndex+1]}));}else console.log(JSON.stringify(result,null,2));
  }catch(e){console.error(JSON.stringify({error:e.message}));process.exitCode=1;}finally{store.close();}
}
