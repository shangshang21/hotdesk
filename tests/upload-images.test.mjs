import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {replaceUploadImages} from '../src/upload-images.mjs';
const root=resolve('../../work/hotdesk-tests');mkdirSync(root,{recursive:true});

test('固定上传文件夹换轮后只保留新图，图片证据原件不动',()=>{
  const dir=mkdtempSync(join(root,'upload-'));mkdirSync(join(dir,'images'));writeFileSync(join(dir,'images','evidence.jpg'),'evidence');
  const first=replaceUploadImages(dir,{'01_aaaaaaaaaaaa.jpg':Buffer.from('first')},{topic_id:'first'});
  const second=replaceUploadImages(dir,{'01_bbbbbbbbbbbb.png':Buffer.from('second'),'02_cccccccccccc.jpg':Buffer.from('detail')},{topic_id:'second'});
  assert.equal(first.directory,second.directory);assert.equal(existsSync(join(second.directory,'01_aaaaaaaaaaaa.jpg')),false);
  assert.equal(readFileSync(join(second.directory,'01_bbbbbbbbbbbb.png'),'utf8'),'second');
  assert.equal(readFileSync(join(dir,'images','evidence.jpg'),'utf8'),'evidence');
  assert.equal(readdirSync(dir).some(name=>name.startsWith('.upload-images-')),false);
});
test('非生成文件、外部修改和非法路径不被清理',()=>{
  const dir=mkdtempSync(join(root,'upload-'));
  const first=replaceUploadImages(dir,{'01_aaaaaaaaaaaa.jpg':Buffer.from('first')},{topic_id:'first'});
  writeFileSync(join(first.directory,'我的照片.jpg'),'personal');
  assert.throws(()=>replaceUploadImages(dir,{'01_bbbbbbbbbbbb.jpg':Buffer.from('new')},{topic_id:'next'}),/额外文件/);
  assert.equal(readFileSync(join(first.directory,'我的照片.jpg'),'utf8'),'personal');
  assert.throws(()=>replaceUploadImages(dir,{'../outside.jpg':Buffer.from('bad')},{topic_id:'next'}),/有效/);
  const clean=mkdtempSync(join(root,'upload-'));const set=replaceUploadImages(clean,{'01_aaaaaaaaaaaa.jpg':Buffer.from('first')},{topic_id:'first'});writeFileSync(join(set.directory,'01_aaaaaaaaaaaa.jpg'),'edited');
  assert.throws(()=>replaceUploadImages(clean,{'01_bbbbbbbbbbbb.jpg':Buffer.from('new')},{topic_id:'next'}),/外部修改/);
});
