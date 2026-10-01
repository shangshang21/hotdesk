import {mkdtempSync,readFileSync,writeFileSync,existsSync,readdirSync,lstatSync,renameSync,unlinkSync,rmdirSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';

const marker='.hotdesk-upload.json',owner='hotdesk-upload-images-v1';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const validName=name=>/^\d{2}_[a-f0-9]{12}\.(jpg|png|webp)$/.test(name);

function inspect(directory){
  if(lstatSync(directory).isSymbolicLink())throw new Error('上传图片目录不能是链接');
  const metadata=JSON.parse(readFileSync(join(directory,marker),'utf8'));
  if(metadata.owner!==owner||!Array.isArray(metadata.files)||metadata.files.some(f=>!validName(f.name)))throw new Error('上传图片目录不属于 Hotdesk，保留原内容');
  const expected=new Set([marker,...metadata.files.map(f=>f.name)]);
  if(readdirSync(directory).some(name=>!expected.has(name)))throw new Error('上传图片目录有额外文件，保留原内容；请先移走自行加入的文件');
  for(const f of metadata.files){const path=join(directory,f.name);if(lstatSync(path).isSymbolicLink()||digest(readFileSync(path))!==f.sha256)throw new Error('上传图片目录有外部修改，保留原内容');}
  return [...expected];
}
function removeManaged(directory,names,dataRoot){
  // Never recurse or follow a computed path outside this data directory.
  if(dirname(resolve(directory))!==resolve(dataRoot))throw new Error('上传目录清理路径越界');
  for(const name of names){if(name!==marker&&!validName(name))throw new Error('无效上传图片文件名');unlinkSync(join(directory,name));}
  rmdirSync(directory);
}
export function replaceUploadImages(dataRoot,images,metadata){
  const directory=join(resolve(dataRoot),'上传图片');
  const entries=Object.entries(images);
  if(!entries.length||entries.some(([name])=>!validName(name)))throw new Error('没有有效的本次上传图片');
  const previous=existsSync(directory)?inspect(directory):null;
  const staging=mkdtempSync(join(resolve(dataRoot),'.upload-images-'));
  let backup;
  try{
    for(const [name,bytes] of entries)writeFileSync(join(staging,name),bytes);
    writeFileSync(join(staging,marker),JSON.stringify({...metadata,owner,files:entries.map(([name,bytes])=>({name,sha256:digest(bytes)}))},null,2));
    if(previous){backup=staging+'-previous';renameSync(directory,backup);}
    try{renameSync(staging,directory);}catch(e){if(backup)renameSync(backup,directory);throw e;}
  }catch(e){if(existsSync(staging))removeManaged(staging,readdirSync(staging),dataRoot);throw e;}
  // A complete new set is already installed before the old managed files are removed.
  let cleanup_warning;
  if(backup)try{removeManaged(backup,previous,dataRoot);}catch(e){cleanup_warning=`旧上传图片暂存目录清理失败：${e.message}`;}
  return {directory,files:entries.map(([name])=>name),topic_id:metadata.topic_id,cleanup_warning};
}
