import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash,randomBytes,generateKeyPairSync,randomUUID} from 'node:crypto';
import {SignJWT,jwtVerify} from 'jose';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import config from '../aleph.config.json' with {type:'json'};
import {createOperationsHandler} from '../src/operations-api.mjs';
import {createDeviceGate} from '../src/device-approval.mjs';
import {createNotesHandler} from '../src/notes-api.mjs';
import {createNoticesHandler} from '../src/notices-api.mjs';
import {createRecoveryHandler} from '../src/note-recovery-api.mjs';
import {mountOperations} from '../src/operations-view.mjs';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const own='33333333-3333-4333-8333-333333333333',foreign='44444444-4444-4444-8444-444444444444';
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const token=await new SignJWT({role:'authenticated'}).setProtectedHeader({alg:'ES256'}).setIssuer(config.identityProvider.issuer)
 .setAudience(config.identityProvider.audience).setSubject(A).setIssuedAt().setExpirationTime('5m').sign(privateKey);
const grant=randomBytes(32).toString('base64url');
const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
function store(){
 const tables={vault_instructors:[],vault_ops_checks:[],vault_app_credentials:[{credential_id:'fixture',owner_id:A,approved:true}],
  vault_app_grants:[{owner_id:A,credential_id:'fixture',grant_hash:createHash('sha256').update(grant).digest('hex'),expires_at:new Date(Date.now()+300000).toISOString()}],
  vault_restore_audit:[{actor_id:A,operation:'restore',at:new Date().toISOString()},{actor_id:B,operation:'restore',at:new Date().toISOString()}],
  notes:[{id:own,owner_id:A,title:'fixture',content:'DO_NOT_STORE_MEMO_BODY'},{id:foreign,owner_id:B,title:'fixture',content:'DO_NOT_STORE_OTHER_BODY'}]};
 let unavailable=false;
 const client={auth:{getClaims:async value=>{try{const {payload}=await jwtVerify(value,publicKey,{issuer:config.identityProvider.issuer,audience:config.identityProvider.audience});return {data:{claims:payload}};}catch{return {error:true};}}},
  async rpc(name,args){
   if(name==='vault_ops_capabilities')return {data:2};
   if(name==='vault_ops_restore_summary')return {data:tables.vault_restore_audit.filter(r=>r.actor_id===args.p_actor_id).map(({operation,at})=>({operation,at}))};
   if(name==='vault_restore_note')return {data:args.p_actor_id===A&&args.p_backup_id===own?[{verified:true,note_id:own,backup_id:own,content_hash:'a'.repeat(64)}]:[]};
   throw Error('unexpected_rpc');
  },
  from(table){const filters=[];let insert,update,fields='*',single=false,max=Infinity;
   const run=()=>{
    if(unavailable&&table==='vault_ops_checks')return {error:true,data:null};
    if(insert)tables[table].push({...insert});
    if(update)for(const row of tables[table])if(filters.every(([k,v])=>row[k]===v))Object.assign(row,update);
    let rows=insert?[insert]:tables[table].filter(row=>filters.every(([k,v])=>row[k]===v)).slice(0,max);
    if(fields!=='*')rows=rows.map(row=>Object.fromEntries(fields.split(',').map(k=>[k,row[k]])));
    return {data:single?rows[0]??null:rows,error:null};
   };
   const q={select(f){fields=f??'*';return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},limit(n){max=n;return q;},
    update(v){update=v;return q;},insert(v){insert=v;return q;},maybeSingle(){single=true;return Promise.resolve(run());},then(ok,bad){return Promise.resolve(run()).then(ok,bad);}};return q;
  }};
 return {client,tables,setUnavailable(value){unavailable=value;}};
}
const req=body=>({method:body?'POST':'GET',query:{},headers:{authorization:'Bearer '+token,'x-vault-device-grant':grant},body});

test('deployed notes entry emits a request ID even before rejecting anonymous access',async()=>{
 const {default:entry}=await import('../api/notes.js');const r=res();
 await entry({method:'GET',headers:{},query:{}},r);
 assert.equal(r.code,401);assert.match(r.headers['X-Request-Id'],/^[a-f0-9-]{36}$/);
});

test('real HTTP normal/forbidden reads are journaled with actual status and request IDs, no memo/target data',async()=>{
 const db=store(),gate=createDeviceGate({supabase:db.client}),notes=createNotesHandler({config,supabase:db.client,deviceGate:gate});
 const server=createServer(async(request,response)=>{
  const url=new URL(request.url,'http://localhost');
  if(url.pathname==='/'){response.setHeader('Content-Type','text/html');response.end('<!doctype html>fixture');return;}
  const reply={setHeader:(k,v)=>response.setHeader(k,v),status(code){response.statusCode=code;return reply;},json(body){response.setHeader('Content-Type','application/json');response.end(JSON.stringify(body));}};
  await notes({method:request.method,headers:request.headers,query:url.pathname==='/api/notes'?{}:{id:url.pathname.split('/').pop()}},reply);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const handler=createOperationsHandler({config,supabase:db.client,deviceGate:gate,commit:'a'.repeat(40),fetcher:(url,options)=>{
   assert.equal(new URL(url).origin,new URL(config.publicAppUrl).origin);
   return fetch(base+new URL(url).pathname,options);
  }});
  for(const [caseId,noteId,expected] of [['own_list',null,200],['own_read',own,200],['foreign_read',foreign,404],['anonymous_read',null,401],['unregistered_read',null,403]]){
   const r=res();await handler(req({caseId,...(noteId?{noteId}:{})}),r);
   assert.equal(r.code,201);assert.equal(r.body.actual_status,expected);assert.equal(r.body.matched,true);
   assert.match(r.body.request_id,/^[a-f0-9-]{36}$/);assert.match(r.body.checked_at,/T/);
   const text=JSON.stringify(r.body);
   for(const forbidden of ['DO_NOT_STORE',token,grant,own,foreign,'owner_id','title','content'])assert.equal(text.includes(forbidden),false,forbidden);
  }
  db.tables.vault_ops_checks.push({owner_id:B,check_id:randomUUID(),matched:false,actual_status:500});
  const summary=res();await handler(req(),summary);
  assert.equal(summary.body.checks.totals.recorded,5);assert.equal(summary.body.checks.totals.matched,5);
  assert.equal(summary.body.checks.records.length,5);assert.equal(summary.body.recovery.restoreCount,1);
  assert.equal(summary.body.assault.executedKinds,0);assert.equal(summary.body.assault.status,'not_run');
  assert.equal(summary.body.detection.events,null);assert.equal(summary.body.revocation.engineStatus,'not_measured');
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('unauthenticated, unapproved, forged result and user URL rejected; missing store/HTTP never becomes pass',async()=>{
 const db=store();let calls=0;
 const handler=createOperationsHandler({config,supabase:db.client,deviceGate:createDeviceGate({supabase:db.client}),fetcher:async()=>{calls++;throw Error('fixture outage');}});
 const anonymous=res();await handler({method:'GET',headers:{},query:{}},anonymous);assert.equal(anonymous.code,401);
 const notApproved=res();await handler({...req(),headers:{authorization:'Bearer '+token}},notApproved);assert.equal(notApproved.code,403);
 for(const body of [{caseId:'own_list',matched:true,actual_status:200},{caseId:'own_list',url:'https://other.example'},{caseId:'foreign_read',noteId:'../export'},{caseId:'own_write',noteId:own}]){
  const r=res();await handler(req(body),r);assert.equal(r.code,400);
 }
 assert.equal(calls,0);db.setUnavailable(true);
 const unavailable=res();await handler(req({caseId:'own_list'}),unavailable);assert.equal(unavailable.code,503);assert.equal(calls,0);
 const summary=res();await handler(req(),summary);assert.equal(summary.body.checks.totals,null);assert.equal(summary.body.checks.status,'store_unavailable');
 db.setUnavailable(false);const outage=res();await handler(req({caseId:'own_list'}),outage);
 assert.equal(outage.code,201);assert.equal(outage.body.actual_status,null);assert.equal(outage.body.matched,null);
});
test('operations SQL is private, append-only and preserves existing notes/audits',async()=>{
 const pg=new PGlite();
 await pg.exec("create role anon; create role authenticated; create role service_role; create table notes(id int); insert into notes values(1); create table sentinel_audit(id int); insert into sentinel_audit values(1);");
 await pg.exec(await readFile(new URL('../supabase/step12_operations.sql',import.meta.url),'utf8'));
 for(const role of ['anon','authenticated']){
  assert.equal((await pg.query(`select has_table_privilege('${role}','vault_ops_checks','SELECT') as allowed`)).rows[0].allowed,false);
  assert.equal((await pg.query(`select has_table_privilege('${role}','vault_ops_checks','INSERT') as allowed`)).rows[0].allowed,false);
 }
 await pg.query("insert into vault_ops_checks(check_id,owner_id,case_id,method,route,expected_statuses,actual_status,matched,checked_at,source) values($1,$2,'own_list','GET','/api/notes',array[200],200,true,now(),'server_http')",[A,B]);
 await assert.rejects(pg.exec('delete from vault_ops_checks'),/ops_audit_immutable/);
 await assert.rejects(pg.exec('update vault_ops_checks set matched=false'),/ops_audit_immutable/);
 assert.equal((await pg.query('select count(*) as n from notes')).rows[0].n,1);
 assert.equal((await pg.query('select count(*) as n from sentinel_audit')).rows[0].n,1);
 await pg.close();
});
test('HTML masquerading as an API 200 cannot become a matching protected request',async()=>{
 const db=store(),handler=createOperationsHandler({config,supabase:db.client,deviceGate:createDeviceGate({supabase:db.client}),
  fetcher:async()=>new Response('<html>wrong endpoint</html>',{status:200,headers:{'content-type':'text/html'}})});
 const r=res();await handler(req({caseId:'own_list'}),r);
 assert.equal(r.body.actual_status,200);assert.equal(r.body.matched,false);assert.equal(r.body.details.expectedResponseType,false);
});
test('an unreadable backup response stays a mismatch even if HTTP was 200',async()=>{
 const db=store(),handler=createOperationsHandler({config,supabase:db.client,deviceGate:createDeviceGate({supabase:db.client}),
  fetcher:async()=>new Response('broken JSON',{status:200,headers:{'content-type':'application/json','x-request-id':randomUUID()}})});
 const r=res();await handler(req({caseId:'backup_verify',backupId:own}),r);
 assert.equal(r.body.actual_status,200);assert.equal(r.body.matched,false);
});
test('view numbers equal returned masked records, empty cases and 41 assault remain unrun',async()=>{
 const nodes=new Map(),node=()=>({children:[],textContent:'',value:'',disabled:false,append(v){this.children.push(v);},replaceChildren(){this.children=[];},addEventListener(name,fn){this[name]=fn;}});
 const previous=globalThis.document;globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElement:node};
 try{
  const db=store(),handler=createOperationsHandler({config,supabase:db.client,deviceGate:createDeviceGate({supabase:db.client})});
  const r=res();await handler(req(),r);
  const ui=mountOperations({isActive:()=>true,request:async()=>r.body});await ui.load();
  await nodes.get('ops-open').click();assert.equal(nodes.get('notes-area').hidden,true);
  assert.equal(nodes.get('operations-panel').hidden,false);
  assert.match(nodes.get('ops-summary').textContent,/HTTP 기록 0건/);
  assert.match(nodes.get('ops-summary').textContent,/실행 확인 0\/41/);
  assert.equal(nodes.get('ops-case').children.length,12);
  assert.equal(nodes.get('ops-table').children.filter(row=>row.children.some(cell=>cell.textContent==='엔진 확인 필요')).length,2);
  assert.equal(nodes.get('ops-table').children.filter(row=>row.children.some(cell=>cell.textContent==='미실행')).length,8);
  ui.reset();assert.equal(nodes.get('ops-table').children.length,0);
  assert.equal(nodes.get('operations-panel').hidden,true);
 }finally{globalThis.document=previous;}
});

test('mutation APIs record real response status and request ID, redact payloads, preserve result on journal outage',async()=>{
 const db=store(),gate=createDeviceGate({supabase:db.client});
 const notes=createNotesHandler({config,supabase:db.client,deviceGate:gate});
 const notices=createNoticesHandler({config,supabase:db.client,deviceGate:gate});
 const restores=createRecoveryHandler({config,supabase:db.client,deviceGate:gate,mode:'restore'});
 const server=createServer(async(request,response)=>{
  let raw='';for await(const chunk of request)raw+=chunk;
  const path=new URL(request.url,'http://localhost').pathname;
  const reply={setHeader:(k,v)=>response.setHeader(k,v),status(code){response.statusCode=code;return reply;},json(body){response.setHeader('Content-Type','application/json');response.end(JSON.stringify(body));}};
  const handler=path.startsWith('/api/notes/')?notes:path.startsWith('/api/notices/')?notices:restores;
  await handler({method:request.method,headers:request.headers,query:handler===restores?{}:{id:path.split('/').pop()},body:raw},reply);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const send=(path,method,body)=>fetch(base+path,{method,headers:{authorization:'Bearer '+token,'X-Vault-Device-Grant':grant,'Content-Type':'application/json'},body:JSON.stringify(body)});
 try {
  for(const [path,method,body,expected,caseId] of [
   ['/api/notes/'+own,'PUT',{title:'fixture update',body:'PRIVATE_NEW_CONTENT'},200,'own_write'],
   ['/api/notes/'+foreign,'PUT',{title:'fixture',body:'must not write'},404,'own_write'],
   ['/api/notices/'+own,'PUT',{},403,'notice_write'],
   ['/api/note-restores','POST',{backupId:own,confirmHash:'a'.repeat(64)},200,'restore_one']]){
   const result=await send(path,method,body);assert.equal(result.status,expected);assert.equal(result.headers.get('X-Operations-Recorded'),'true');
   const row=db.tables.vault_ops_checks.at(-1);
   assert.equal(row.request_id,result.headers.get('X-Request-Id'));assert.equal(row.actual_status,expected);assert.equal(row.case_id,caseId);assert.equal(row.source,'server_api');
   assert.equal(row.matched,caseId==='own_write'?expected===200:true);await result.body.cancel();
  }
  assert.equal(db.tables.notes.find(n=>n.id===foreign).content,'DO_NOT_STORE_OTHER_BODY');
  const journal=JSON.stringify(db.tables.vault_ops_checks.map(({owner_id,...r})=>r));
  for(const secret of ['PRIVATE_NEW_CONTENT',token,grant,own,foreign,'a'.repeat(64),'title','content'])assert.equal(journal.includes(secret),false,secret);
  db.setUnavailable(true);
  const result=await send('/api/notes/'+own,'PUT',{title:'fixture',body:'saved even when log unavailable'});
  assert.equal(result.status,200);assert.equal(result.headers.get('X-Operations-Recorded'),'false');await result.body.cancel();
  assert.equal(db.tables.notes.find(n=>n.id===own).content,'saved even when log unavailable');
  assert.equal(db.tables.vault_ops_checks.length,4);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('mutation migration keeps old checks immutable and exposes only service-owned actor audit metadata',async()=>{
 const pg=new PGlite();
 try {
  await pg.exec('create role anon;create role authenticated;create role service_role;create table vault_restore_audit(actor_id uuid,operation text,at timestamptz,content_hash text);');
  await pg.exec(await readFile(new URL('../supabase/step12_operations.sql',import.meta.url),'utf8'));
  await pg.query("insert into vault_ops_checks(check_id,owner_id,case_id,method,route,expected_statuses,actual_status,matched,checked_at,source) values($1,$2,'own_list','GET','/api/notes',array[200],200,true,now(),'server_http')",[own,A]);
  await pg.query("insert into vault_restore_audit values($1,'restore',now(),'private hash'),($2,'restore',now(),'other private hash')",[A,B]);
  const migration=await readFile(new URL('../supabase/step12_operations_mutations.sql',import.meta.url),'utf8');
  await pg.exec(migration);await pg.exec(migration);
  assert.equal((await pg.query('select count(*)::int as n from vault_ops_checks')).rows[0].n,1);
  for(const [caseId,method,route,status] of [['own_write','PUT','/api/notes/:id',200],['notice_write','PUT','/api/notices/:id',403],['restore_one','POST','/api/note-restores',200]])
   await pg.query('insert into vault_ops_checks(check_id,owner_id,case_id,method,route,expected_statuses,actual_status,matched,checked_at,source) values($1,$2,$3,$4,$5,array[$6::int],$6,true,now(),\'server_api\')',[randomUUID(),A,caseId,method,route,status]);
  await assert.rejects(pg.exec('delete from vault_ops_checks'),/ops_audit_immutable/);
  await assert.rejects(pg.exec('update vault_ops_checks set matched=false'),/ops_audit_immutable/);
  for(const role of ['anon','authenticated'])assert.equal((await pg.query("select has_function_privilege($1,'vault_ops_restore_summary(uuid)','EXECUTE') as allowed",[role])).rows[0].allowed,false);
  await pg.exec('set role service_role');
  const rows=(await pg.query('select * from vault_ops_restore_summary($1)',[A])).rows;
  assert.equal(rows.length,1);assert.deepEqual(Object.keys(rows[0]).sort(),['at','operation']);
  await assert.rejects(pg.exec('select * from vault_restore_audit'),/permission denied/);
 }finally{await pg.close();}
});

test('restore UI requires verified preview and explicit consent, reset clears target and prevents replay',async()=>{
 const nodes=new Map(),node=()=>({children:[],textContent:'',value:'',disabled:false,checked:false,append(v){this.children.push(v);},replaceChildren(){this.children=[];},addEventListener(name,fn){this[name]=fn;}});
 const previous=globalThis.document;globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElement:node};
 try{
  const db=store(),handler=createOperationsHandler({config,supabase:db.client,deviceGate:createDeviceGate({supabase:db.client})});
  const response=res();await handler(req(),response);
  const calls=[];let verified=true;
  const ui=mountOperations({isActive:()=>true,request:async(options)=>options?{actual_status:200,details:{currentMatches:true}}:response.body,
   protectedRequest:async(path,method='GET',body)=>{calls.push({path,method,body});return {status:200,recorded:true,data:{id:own,backupId:own,contentHash:'a'.repeat(64),currentHash:'b'.repeat(64),verified}};}});
  await ui.load();nodes.get('ops-case').value='restore_one';nodes.get('ops-case').change();nodes.get('ops-target').value=own;
  await nodes.get('ops-restore-confirm').click();assert.equal(calls.length,0);
  verified=false;await nodes.get('ops-run').click();assert.equal(nodes.get('ops-restore-panel').hidden,true);
  verified=true;await nodes.get('ops-run').click();assert.equal(nodes.get('ops-restore-panel').hidden,false);
  assert.equal(nodes.get('ops-restore-confirm').disabled,true);
  await nodes.get('ops-restore-confirm').click();assert.equal(calls.filter(c=>c.method==='POST').length,0);
  nodes.get('ops-restore-consent').checked=true;nodes.get('ops-restore-consent').change();
  await nodes.get('ops-restore-confirm').click();assert.equal(calls.filter(c=>c.method==='POST').length,1);
  assert.deepEqual(calls.find(c=>c.method==='POST').body,{backupId:own,confirmHash:'a'.repeat(64)});
  await nodes.get('ops-restore-confirm').click();assert.equal(calls.filter(c=>c.method==='POST').length,1);
  await nodes.get('ops-run').click();ui.reset();assert.equal(nodes.get('ops-restore-preview').textContent,'');
  nodes.get('ops-restore-consent').checked=true;await nodes.get('ops-restore-confirm').click();assert.equal(calls.filter(c=>c.method==='POST').length,1);
 }finally{globalThis.document=previous;}
});
