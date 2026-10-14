import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateKeyPairSync,createHash,randomBytes,randomUUID,sign} from 'node:crypto';
import {SignJWT,jwtVerify} from 'jose';
import {PGlite} from '@electric-sql/pglite';
import config from '../aleph.config.json' with {type:'json'};
import {createDeviceHandler,createDeviceGate,verifySessionProof} from '../src/device-approval.mjs';
import {createSessionIdentity,signSessionChallenge} from '../src/session-identity.mjs';
import {createNotesHandler} from '../src/notes-api.mjs';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const rpID=new URL(config.publicAppUrl).hostname,origin=new URL(config.publicAppUrl).origin;
const sha=b=>createHash('sha256').update(b).digest();
const b64=b=>Buffer.from(b).toString('base64url');
const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
const {privateKey:loginPrivate,publicKey:loginPublic}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const loginToken=await new SignJWT({role:'authenticated'}).setProtectedHeader({alg:'ES256'}).setSubject(A)
 .setIssuer(config.identityProvider.issuer).setAudience(config.identityProvider.audience).setIssuedAt().setExpirationTime('5m').sign(loginPrivate);
function db(){
 const tables={vault_app_credentials:[],vault_app_challenges:[],vault_app_grants:[],notes:[{id:B,owner_id:A,title:'fixture',content:'fixture'}]};let noteReads=0;
 const client={auth:{getClaims:async(token)=>{try{const {payload}=await jwtVerify(token,loginPublic);return {data:{claims:payload},error:null};}catch{return {error:true};}}},
 from(table){if(table==='notes')noteReads++;const filters=[];let inserted,updated,single=false;
 const result=()=>{
  let rows=tables[table].filter(row=>filters.every(([k,v])=>row[k]===v));
  if(inserted){const row={challenge_id:randomUUID(),expires_at:new Date(Date.now()+120000).toISOString(),used_at:null,...inserted};tables[table].push(row);rows=[row];}
  if(updated)rows.forEach(row=>Object.assign(row,updated));
  return {data:single?rows[0]??null:rows.map(row=>({...row})),error:null};
 };
 const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},insert(p){inserted=p;return q;},update(p){updated=p;return q;},
  single(){single=true;return Promise.resolve(result());},maybeSingle(){single=true;return Promise.resolve(result());},order(){return Promise.resolve(result());},
  then(ok,bad){return Promise.resolve(result()).then(ok,bad);}};return q;
 },async rpc(name,args){assert.equal(name,'vault_consume_device_challenge');const c=tables.vault_app_challenges.find(row=>row.owner_id===args.p_actor_id&&row.challenge_id===args.p_challenge_id&&row.ceremony===args.p_ceremony&&!row.used_at&&Date.parse(row.expires_at)>Date.now());if(c)c.used_at=new Date().toISOString();return {data:c?[{challenge:c.challenge}]:[],error:null};}};
 return {client,tables,noteReads:()=>noteReads};
}
test('RAM key cannot be exported; proof is bound to origin, ceremony and challenge',async()=>{
 const identity=await createSessionIdentity();
 assert.equal(identity.privateKey.extractable,false);
 await assert.rejects(crypto.subtle.exportKey('pkcs8',identity.privateKey));
 const proof=await signSessionChallenge(identity,'register','fixture',origin);
 assert.equal(await verifySessionProof({origin,mode:'register',challenge:'fixture',...proof}),true);
 for(const changed of [{origin:'https://other.example'},{mode:'authenticate'},{challenge:'other'},{signature:'A'.repeat(86)}])
  assert.equal(await verifySessionProof({origin,mode:'register',challenge:'fixture',...proof,...changed}),false);
});
test('approval cannot be requested as true; separate browser cannot reuse it; revoke/expiry block notes',async()=>{
 const store=db();
 const handlers=Object.fromEntries(['register','authenticate','status'].map(mode=>[mode,createDeviceHandler({config,supabase:store.client,mode})]));
 const call=async(mode,method,body)=>{const r=res();await handlers[mode]({method,headers:{authorization:'Bearer '+loginToken,origin},query:{},body},r);return r;};
 const request=async(mode,identity,extra)=>{
  const start=await call(mode,'GET');assert.equal(start.code,200);
  const proof=await signSessionChallenge(identity,mode,start.body.challenge,origin);
  const body={challengeId:start.body.challengeId,...proof,...extra};
  return {result:await call(mode,'POST',body),body};
 };
 const a=await createSessionIdentity(),b=await createSessionIdentity();
 assert.equal((await request('register',a,{approved:true})).result.code,400);
 const registered=await request('register',a);
 assert.equal(registered.result.code,201);assert.equal(store.tables.vault_app_credentials[0].approved,false);
 assert.equal((await call('register','POST',registered.body)).code,409);
 assert.equal((await request('authenticate',a)).result.code,403);
 const gate=createDeviceGate({supabase:store.client});
 const notes=createNotesHandler({config,supabase:store.client,deviceGate:gate});
 const read=async(grant)=>{const r=res();await notes({method:'GET',headers:{authorization:'Bearer '+loginToken,...(grant?{'x-vault-device-grant':grant}:{})},query:{}},r);return r;};
 assert.equal((await read()).code,403);assert.equal(store.noteReads(),0);
 store.tables.vault_app_credentials[0].approved=true; // independently verified operator action
 assert.equal((await request('authenticate',b)).result.code,403);
 const checked=(await request('authenticate',a)).result;
 assert.equal(checked.code,200);assert.equal(checked.body.deviceRegistered,true);
 const issuedAt=Date.now();
 const expires=Date.parse(checked.body.expiresAt);
 assert.ok(expires-issuedAt>8*60*60000-10000 && expires-issuedAt<=8*60*60000);
 const originalNow=Date.now;
 try {
  Date.now=()=>expires-1;
  const gateRequest={req:{headers:{'x-vault-device-grant':checked.body.grant}},res:res(),user:{kind:'student',userId:A}};
  assert.equal(await gate(gateRequest),true);
  Date.now=()=>expires;
  assert.equal(await gate(gateRequest),false);
  assert.equal(gateRequest.res.code,403);
 } finally { Date.now=originalNow; }
 assert.equal((await read(checked.body.grant)).code,200);
 assert.equal((await read('A'.repeat(43))).code,403);
 store.tables.vault_app_credentials[0].approved=false;
 assert.equal((await read(checked.body.grant)).code,403);
 store.tables.vault_app_credentials[0].approved=true;
 store.tables.vault_app_grants[0].expires_at=new Date(0).toISOString();
 assert.equal((await read(checked.body.grant)).code,403);
});
test('unknown login and foreign origin cannot create an enrollment',async()=>{
 const store=db(),handler=createDeviceHandler({config,supabase:store.client,mode:'register'});
 for(const [authorization,source,expected] of [[undefined,origin,401],['Bearer '+loginToken,'https://other.example',403]]) {
  const r=res();await handler({method:'GET',headers:{authorization,origin:source},query:{}},r);assert.equal(r.code,expected);
 }
 assert.equal(store.tables.vault_app_credentials.length,0);
});
test('public cache list contains no protected resources; approval SQL is owner-bound and one-use',async()=>{
 const worker=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
 const {runInNewContext}=await import('node:vm');
 const listeners=new Map(),cached=[];
 runInNewContext(worker,{URL,self:{location:{origin},addEventListener:(name,fn)=>listeners.set(name,fn)},
  caches:{open:async()=>({addAll:async paths=>cached.push(...paths)})}});
 let promise;listeners.get('install')({waitUntil:p=>{promise=p;}});await promise;
 assert.deepEqual(cached,['/app/offline.html','/app/icon-192.png','/app/icon-512.png','/app/manifest.webmanifest']);
 let intercepted=false;listeners.get('fetch')({request:{url:origin+'/api/notes',method:'GET',mode:'navigate'},respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false);
 const pg=new PGlite();await pg.exec('create role anon; create role authenticated; create role service_role;');
 await pg.exec(await readFile(new URL('../supabase/step11_devices.sql',import.meta.url),'utf8'));
 assert.equal((await pg.query("select has_table_privilege('authenticated','vault_app_credentials','INSERT') as allowed")).rows[0].allowed,false);
 await pg.query("insert into vault_app_challenges(challenge_id,owner_id,ceremony,challenge) values($1,$2,'authentication','fixture')",[A,B]);
 assert.equal((await pg.query("select * from vault_consume_device_challenge($1,$2,'authentication')",[A,A])).rows.length,0);
 assert.equal((await pg.query("select * from vault_consume_device_challenge($1,$2,'authentication')",[B,A])).rows.length,1);
 assert.equal((await pg.query("select * from vault_consume_device_challenge($1,$2,'authentication')",[B,A])).rows.length,0);
 await pg.close();
});
test('repeated same-account auth notification does not erase enrollment; account switch still locks',async()=>{
 const {runInNewContext}=await import('node:vm');
 const source=(await readFile(new URL('../src/browser-app.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
 const elements=new Map();
 const element=id=>{if(!elements.has(id))elements.set(id,{hidden:true,value:'',disabled:false,
  reset(){},replaceChildren(){},addEventListener(name,fn){this[name]=fn;}});return elements.get(id);};
 let authCallback;let current={user:{id:A},access_token:'test-token'};
 const auth={onAuthStateChange(fn){authCallback=fn;},async getSession(){return {data:{session:current},error:null};}};
 let diagnosticHeaders;
 const fetch=async (path,options)=>{
  if(path==='/auth-config.json')return {ok:true,json:async()=>({url:'https://vault.supabase.co',publishableKey:'sb_publishable_fixture'})};
  if(path==='/api/device-status')return {ok:true,json:async()=>({status:'unverified'})};
  if(path==='/api/device-enrollment'){
   // Supabase can re-emit SIGNED_IN for the same account during a focus/refresh.
   authCallback('SIGNED_IN',current);
   return {ok:true,json:async()=>({challengeId:A,challenge:'fixture',deviceId:'0123456789abcdef'})};
  }
  if(path==='/api/notes'){
   diagnosticHeaders=options.headers;
   return {status:403,json:async()=>({error:'기기 승인이 필요합니다.'})};
  }
  throw Error('unexpected_protected_fetch');
 };
 const window={addEventListener(){}};
 const context={mountOperations:()=>({reset(){},load(){}}),createClient:()=>({auth}),createSessionIdentity,signSessionChallenge:(i,m,c)=>signSessionChallenge(i,m,c,origin),
  document:{getElementById:element},window,navigator:{onLine:true},localStorage:{removeItem(){}},
  fetch,URL,setTimeout:()=>1,clearTimeout(){},console};
 await runInNewContext('(async()=>{'+source+'})()',context);
 await element('request-device-button').click();
 assert.match(element('device-status').textContent,/승인 대기.*0123456789abcdef/);
 assert.equal(element('workspace').hidden,true);
 current={user:{id:B},access_token:'other-test-token'};authCallback('SIGNED_IN',current);
 assert.equal(element('workspace').hidden,true);
 assert.doesNotMatch(element('device-status').textContent,/0123456789abcdef/);
 // The diagnostic helper can observe a real server denial without a grant.
 // It does not open the workspace or grant access.
 const denied=await window.자료실요청('/api/notes');
 assert.equal(denied.status,403);
 assert.equal(diagnosticHeaders['X-Vault-Device-Grant'],undefined);
 assert.equal(element('workspace').hidden,true);
});
