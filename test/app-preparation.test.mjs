import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

test('public app worker leaves API and existing vault requests untouched', async () => {
  const listeners = new Map();
  const cached = [];
  const cache = {addAll:async paths=>cached.push(...paths),match:async path=>({offline:path})};
  const self = {location:{origin:'https://vault.example'},addEventListener:(name,fn)=>listeners.set(name,fn)};
  runInNewContext(await readFile(new URL('../public/app/sw.js',import.meta.url),'utf8'), {
    self,URL,caches:{open:async()=>cache},fetch:async()=>{throw Error('offline');}
  });
  let installed;
  listeners.get('install')({waitUntil:p=>{installed=p;}});
  await installed;
  assert.deepEqual(cached, ['/app/offline.html','/app/icon-192.png','/app/icon-512.png','/app/manifest.webmanifest']);
  for (const [path,mode,method] of [['/api/notes','cors','GET'],['/api/notes','navigate','GET'],['/','navigate','GET'],['/app/','navigate','POST']]) {
    let intercepted=false;
    listeners.get('fetch')({request:{url:'https://vault.example'+path,mode,method},respondWith:()=>{intercepted=true;}});
    assert.equal(intercepted,false,path);
  }
  let response;
  listeners.get('fetch')({request:{url:'https://vault.example/app/',mode:'navigate',method:'GET'},respondWith:p=>{response=p;}});
  assert.deepEqual(await response,{offline:'/app/offline.html'});
});

test('install, approval click and reconnect cannot unlock or fetch protected data', async () => {
  const listeners=new Map();
  const elements=new Map(['status','message','request','install'].map(id=>[id,{hidden:true,addEventListener:(name,fn)=>listeners.set(id+':'+name,fn)}]));
  const navigator={onLine:true};
  runInNewContext(await readFile(new URL('../public/app/app.mjs',import.meta.url),'utf8'),{
    document:{getElementById:id=>elements.get(id)},navigator,
    window:{addEventListener:(name,fn)=>listeners.set(name,fn)}
  });
  listeners.get('request:click')();
  assert.match(elements.get('message').textContent,/접수하지 않았습니다/);
  listeners.get('appinstalled')();
  assert.match(elements.get('message').textContent,/완료되지 않았습니다/);
  navigator.onLine=false;listeners.get('offline')();
  assert.match(elements.get('status').textContent,/보호 자료를 표시하지 않습니다/);
  navigator.onLine=true;listeners.get('online')();
  assert.match(elements.get('status').textContent,/확인하지 못했습니다/);
  const manifest=JSON.parse(await readFile(new URL('../public/app/manifest.webmanifest',import.meta.url)));
  assert.equal(manifest.scope,'/app/');assert.equal(manifest.start_url,'/app/');
});
