import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateKeyPairSync,createHash,randomBytes,randomUUID,sign} from 'node:crypto';
import {isoCBOR} from '@simplewebauthn/server/helpers';
import {SignJWT,jwtVerify} from 'jose';
import {PGlite} from '@electric-sql/pglite';
import config from '../aleph.config.json' with {type:'json'};
import {createDeviceHandler,createDeviceGate} from '../src/device-approval.mjs';
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
function authenticator(){
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=publicKey.export({format:'jwk'}),id=randomBytes(24);
 const cose=isoCBOR.encode(new Map([[1,2],[3,-7],[-1,1],[-2,new Uint8Array(Buffer.from(jwk.x,'base64url'))],[-3,new Uint8Array(Buffer.from(jwk.y,'base64url'))]]));
 const clientData=(type,challenge,source=origin)=>Buffer.from(JSON.stringify({type,challenge,origin:source,crossOrigin:false}));
 return {registration(options,flags=0x45){
  const length=Buffer.alloc(2);length.writeUInt16BE(id.length);
  const data=Buffer.concat([sha(rpID),Buffer.from([flags]),Buffer.alloc(4),Buffer.alloc(16),length,id,Buffer.from(cose)]);
  const att=isoCBOR.encode(new Map([['fmt','none'],['attStmt',new Map()],['authData',new Uint8Array(data)]]));
  return {id:b64(id),rawId:b64(id),type:'public-key',response:{attestationObject:b64(att),clientDataJSON:b64(clientData('webauthn.create',options.challenge)),transports:['internal']},clientExtensionResults:{}};
 },authentication(options,{badSignature=false,source=origin}={}){
  const counter=Buffer.alloc(4);counter.writeUInt32BE(1);
  const data=Buffer.concat([sha(rpID),Buffer.from([0x05]),counter]);
  const json=clientData('webauthn.get',options.challenge,source),signature=sign('sha256',Buffer.concat([data,sha(json)]),privateKey);
  if(badSignature)signature[signature.length-1]^=1;
  return {id:b64(id),rawId:b64(id),type:'public-key',response:{authenticatorData:b64(data),clientDataJSON:b64(json),signature:b64(signature),userHandle:options.user?.id??null},clientExtensionResults:{}};
 }};
}
function setup(){const store=db(),handlers=Object.fromEntries(['register','authenticate','status'].map(mode=>[mode,createDeviceHandler({config,supabase:store.client,mode})]));
 const request=async(mode,method,body,auth=loginToken,extra={})=>{const out=res();await handlers[mode]({method,body,query:{},headers:{authorization:`Bearer ${auth}`,origin,...extra}},out);return out;};return {store,request};}
test('real WebAuthn registration stays pending; approval plus valid signature grants protected access',async()=>{
 const {store,request}=setup(),auth=authenticator();
 const start=(await request('register','GET')).body;
 const registered=await request('register','POST',{challengeId:start.challengeId,response:auth.registration(start.options)});
 assert.equal(registered.code,201);assert.equal(registered.body.deviceRegistered,false);assert.equal(store.tables.vault_app_credentials[0].approved,false);
 assert.equal((await request('authenticate','GET')).code,403);
 const gate=createDeviceGate({supabase:store.client});
 const notes=createNotesHandler({config,supabase:store.client,deviceGate:gate});
 const out=res();await notes({method:'GET',query:{},headers:{authorization:`Bearer ${loginToken}`}},out);
 assert.equal(out.code,403);assert.equal(store.noteReads(),0);
 store.tables.vault_app_credentials[0].approved=true; // operator action only, no HTTP approval endpoint
 const begin=(await request('authenticate','GET')).body;
 const verified=await request('authenticate','POST',{challengeId:begin.challengeId,response:auth.authentication(begin.options)});
 assert.equal(verified.code,200);assert.equal(verified.body.deviceRegistered,true);
 const allowed=res();await notes({method:'GET',query:{},headers:{authorization:`Bearer ${loginToken}`,'x-vault-device-grant':verified.body.grant}},allowed);
 assert.equal(allowed.code,200);assert.equal(allowed.body.length,1);
 store.tables.vault_app_credentials[0].approved=false;
 const revoked=res();await notes({method:'GET',query:{},headers:{authorization:`Bearer ${loginToken}`,'x-vault-device-grant':verified.body.grant}},revoked);assert.equal(revoked.code,403);
 assert.equal((await request('authenticate','POST',{challengeId:begin.challengeId,response:auth.authentication(begin.options)})).code,409);
});
test('forged approval, foreign origin, synced credential, bad signature, missing login cannot grant access',async()=>{
 const {store,request}=setup(),auth=authenticator();
 assert.equal((await request('status','GET',undefined,'invalid')).code,401);
 assert.equal((await request('status','GET',undefined,loginToken,{origin:'https://example.org'})).code,403);
 const begin=(await request('register','GET')).body;
 const response=auth.registration(begin.options);
 assert.equal((await request('register','POST',{challengeId:begin.challengeId,response,approved:true})).code,400);
 const synced=await request('register','POST',{challengeId:begin.challengeId,response:auth.registration(begin.options,0x4d)});assert.equal(synced.code,403);
 assert.equal(store.tables.vault_app_credentials.length,0);
 const begin2=(await request('register','GET')).body;
 await request('register','POST',{challengeId:begin2.challengeId,response:auth.registration(begin2.options)});
 store.tables.vault_app_credentials[0].approved=true;
 const proof=(await request('authenticate','GET')).body;
 assert.notEqual((await request('authenticate','POST',{challengeId:proof.challengeId,response:auth.authentication(proof.options,{badSignature:true})})).code,200);
 assert.equal(store.tables.vault_app_grants.length,0);
 const gate=createDeviceGate({supabase:store.client}),out=res();
 assert.equal(await gate({req:{headers:{'x-vault-device-grant':'a'.repeat(43)}},user:{kind:'student',userId:A},res:out}),false);
});
test('SQL keeps other tables; challenge is owner-bound, expiring and one-use; public rights absent',async()=>{
 const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create role service_role;create table notes(id integer);insert into notes values(1);");
 await db.exec(await readFile(new URL('../supabase/step11_devices.sql',import.meta.url),'utf8'));
 const c=(await db.query("insert into vault_app_challenges(owner_id,ceremony,challenge)values($1,'registration','fixture')returning challenge_id",[A])).rows[0];
 assert.equal((await db.query("select * from vault_consume_device_challenge($1,$2,'registration')",[B,c.challenge_id])).rows.length,0);
 assert.equal((await db.query("select * from vault_consume_device_challenge($1,$2,'registration')",[A,c.challenge_id])).rows.length,1);
 assert.equal((await db.query("select * from vault_consume_device_challenge($1,$2,'registration')",[A,c.challenge_id])).rows.length,0);
 for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_table_privilege($1,'vault_app_credentials','UPDATE') as ok",[role])).rows[0].ok,false);
 assert.equal((await db.query('select count(*)::int as n from notes')).rows[0].n,1);
 }finally{await db.close();}
});
test('app persists no token/key, installation is separate, service worker does not cache protected requests',async()=>{
 const app=await readFile(new URL('../src/browser-app.mjs',import.meta.url),'utf8');
 assert.match(app,/persistSession:false/);assert.doesNotMatch(app,/localStorage\.(setItem|getItem)|sessionStorage|indexedDB/);
 assert.match(app,/deviceGrant=result.grant/);assert.match(app,/el\('workspace'\)\.hidden = true/);
 const sw=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');assert.match(sw,/startsWith\('\/api\/'\)/);assert.doesNotMatch(sw,/app\.js|auth-config|notes\/:/);
 const manifest=JSON.parse(await readFile(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));assert.equal(manifest.display,'standalone');
});
