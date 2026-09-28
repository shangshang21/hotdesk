import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Store } from './store.mjs';
import { toolDefinitions,callTool } from './tools.mjs';
const store=new Store();
const server=new McpServer({name:'hotdesk-local',version:'0.1.0'});
for(const [name,def]of Object.entries(toolDefinitions))server.registerTool(name,{description:def.description,inputSchema:def.schema},async args=>{
  try{return {content:[{type:'text',text:JSON.stringify(await callTool(store,name,args))}]};}catch(e){return {isError:true,content:[{type:'text',text:JSON.stringify({error:e.message})}]};}
});
process.on('SIGINT',async()=>{await server.close();store.close();process.exit(0);});
await server.connect(new StdioServerTransport());
