import test,{mock} from 'node:test';
import assert from 'node:assert/strict';

// Module mocks are local to this test worker. Neither DNS nor fetch reaches
// the network; tests exercise the actual fetchRaw path, including redirects.
const answers=new Map();
mock.module('node:dns/promises',{exports:{lookup:async host=>{
  assert.ok(answers.has(host),`Unexpected DNS lookup: ${host}`);
  return answers.get(host).map(address=>({address}));
}}});
const {fetchRaw}=await import('../src/adapters.mjs');
const store={raw:()=> 'a'.repeat(64)};
async function withFetch(run,respond=()=>new Response('Synthetic response')){
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async url=>{calls.push(url);return respond(url);};
  try{await run(calls);}finally{globalThis.fetch=original;}
}

test('fake-IP 混合回环、私网或链路本地地址时在请求前拒绝',async()=>{
  for(const privateIP of ['127.0.0.1','10.1.2.3','192.168.1.1','172.16.0.1','169.254.1.1','::1','fd00::1']){
    for(const addresses of [['198.18.0.7',privateIP],[privateIP,'198.19.0.8']]){
      answers.set('mixed.example.org',addresses);
      await withFetch(async calls=>{
        await assert.rejects(fetchRaw(store,'https://mixed.example.org/'),/不允许访问内网/);
        assert.equal(calls.length,0);
      });
    }
  }
});

test('纯 fake-IP 及 fake-IP 混合公网地址继续可采集',async()=>{
  for(const [host,addresses] of [['fake.example.org',['198.18.0.7','198.19.0.8']],['public.example.org',['198.18.0.7','93.184.216.34']]]){
    answers.set(host,addresses);
    await withFetch(async calls=>{
      const result=await fetchRaw(store,`https://${host}/`);
      assert.equal(result.body,'Synthetic response');assert.equal(calls.length,1);
    });
  }
});

test('显式 allowLocal 仍允许本地 RSSHub 地址',async()=>{
  answers.set('rsshub.example.org',['198.18.0.7','127.0.0.1']);
  await withFetch(async calls=>{
    await fetchRaw(store,'http://rsshub.example.org/feed',{allowLocal:true});
    assert.equal(calls.length,1);
  });
});

test('fake-IP 公共源重定向到内网时重新检查并拒绝',async()=>{
  answers.set('redirect.example.org',['198.18.0.7']);
  await withFetch(async calls=>{
    await assert.rejects(fetchRaw(store,'https://redirect.example.org/'),/不允许访问内网/);
    assert.deepEqual(calls,['https://redirect.example.org/']);
  },()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}}));
});
