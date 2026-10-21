import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Store } from './store.mjs';
import { toolDefinitions,callTool } from './tools.mjs';
import { rulesFull,rulesBrief } from './rules.mjs';
import { z } from 'zod';
const store=new Store();
const server=new McpServer({name:'hotdesk-local',version:'0.2.0'},{instructions:rulesBrief});
server.registerResource('rules','hotdesk://rules',{title:'Hotdesk 工作规则',description:'所有接入 Agent 的完整规则',mimeType:'text/markdown'},async uri=>({contents:[{uri:uri.href,text:rulesFull}]}));
server.registerPrompt('produce_topic',{title:'生产一个热点',description:'按 Hotdesk 规则把一个话题从采集推进到交付包',argsSchema:{topic_id:z.string()}},({topic_id})=>({messages:[{role:'user',content:{type:'text',text:`${rulesFull}\n\n---\n请用 hotdesk 工具处理话题 ${topic_id}：先 get_topic 看现状，缺素材先采集，然后逐步 claim_task / submit_result 推进到 review，再按规则取图并 export_publish_pack。遇到校验报错按提示改正后重交。不要发布。`}}]}));
server.registerPrompt('recreate_video',{title:'短视频二创全流程',description:'执行视频 AI 人声分离、Whisper 对齐、网感汉化、TTS配音、-14LUFS混音与剪映工程生成',argsSchema:{project_id:z.string()}},({project_id})=>({messages:[{role:'user',content:{type:'text',text:`请使用 hotdesk 视频工具处理视频项目 ${project_id}：\n1. separate_video_audio（Demucs v4 剥离消灭老外原声）；\n2. transcribe_video_audio（Faster-Whisper 毫秒级提取时间戳）；\n3. 提炼 2026 短视频高燃网感解说词并 rewrite_video_script 提交；\n4. synthesize_video_voiceover（Edge-TTS 神经语音配音）；\n5. mix_video_audio（EBU R128 -14.8 LUFS 广播级混音）；\n6. render_video_master（1080P母带压制与剪映四轨工程草稿导出）。`}}]}));
for(const [name,def]of Object.entries(toolDefinitions))server.registerTool(name,{description:def.description,inputSchema:def.schema},async args=>{
  try{return {content:[{type:'text',text:JSON.stringify(await callTool(store,name,args))}]};}catch(e){return {isError:true,content:[{type:'text',text:JSON.stringify({error:e.message})}]};}
});
process.on('SIGINT',async()=>{await server.close();store.close();process.exit(0);});
await server.connect(new StdioServerTransport());
