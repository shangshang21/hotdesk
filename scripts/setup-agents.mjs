import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const entry={command:process.execPath,args:[`--env-file-if-exists=${join(root,'.env')}`,join(root,'src/mcp.mjs')]};
for(const relative of ['.mcp.json','.agents/mcp_config.json']){
  const file=join(root,relative);mkdirSync(dirname(file),{recursive:true});
  const data=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{};
  data.mcpServers??={};if(data.mcpServers.hotdesk&&JSON.stringify(data.mcpServers.hotdesk)!==JSON.stringify(entry)){console.error(`已有不同的 hotdesk 配置，保留不覆盖：${file}`);continue;}
  data.mcpServers.hotdesk=entry;writeFileSync(file,JSON.stringify(data,null,2)+'\n','utf8');console.log(file);
}
const toml=join(root,'.codex/config.toml');mkdirSync(dirname(toml),{recursive:true});
const block=`[mcp_servers.hotdesk]\ncommand = ${JSON.stringify(entry.command)}\nargs = ${JSON.stringify(entry.args)}\nstartup_timeout_sec = 30\n`;
if(!existsSync(toml)){writeFileSync(toml,block,'utf8');console.log(toml);}else if(!readFileSync(toml,'utf8').includes('[mcp_servers.hotdesk]')){writeFileSync(toml,readFileSync(toml,'utf8')+'\n'+block,'utf8');console.log(toml);}
// Cross-client discoverability, canonical instructions remain in skills/hotdesk.
const refreshSkills=process.argv.includes('--refresh-skills');
for(const folder of ['.agents/skills/hotdesk','.claude/skills/hotdesk']){
  const dest=join(root,folder,'SKILL.md');mkdirSync(dirname(dest),{recursive:true});
  const content='---\nname: hotdesk\ndescription: Produce Hotdesk topics through sourced research, reader-focused three-platform drafts, real images and a manual-publishing handoff ZIP.\n---\n\n<!-- hotdesk-managed-router-v1 -->\n\nRead the current canonical instructions at [skills/hotdesk/SKILL.md](../../../skills/hotdesk/SKILL.md) before operating Hotdesk. Apply its default production and handoff workflow. Do not reuse a cached copy of its rules.\n';
  if(existsSync(dest)&&readFileSync(dest,'utf8')!==content&&!readFileSync(dest,'utf8').includes('hotdesk-managed-router-v1')){
    if(!refreshSkills){console.error(`已有不同的 skill，保留不覆盖：${dest}；同步默认流程可运行 npm run setup:agents -- --refresh-skills（先备份旧副本）`);continue;}
    const backup=dest+`.backup-${Date.now()}`;writeFileSync(backup,readFileSync(dest));console.log(`旧 skill 已备份：${backup}`);
  }
  writeFileSync(dest,content,'utf8');
}
console.log('仅生成本项目配置；没有修改任何全局 Agent 设置。目录移动后请核对绝对路径。');
