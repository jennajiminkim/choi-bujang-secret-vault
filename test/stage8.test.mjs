import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { generateKeyPair, SignJWT } from 'jose';
import config from '../aleph.config.json' with { type: 'json' };
import { decide, RULE_IDS } from '../src/decider.mjs';
import { apiResourceId } from '../src/resources.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { createNoticesHandler } from '../src/notices-api.mjs';
import noticesEntry from '../api/notices.js';
const A = '11111111-1111-4111-8111-111111111111';
const N = '33333333-3333-4333-8333-333333333333';
const { privateKey, publicKey } = await generateKeyPair('ES256');
const token = await new SignJWT({aleph_role:'judge',aleph_identity:'a',aleph_run:N})
  .setProtectedHeader({alg:'ES256'}).setSubject(A).setIssuer(config.judgeIssuer)
  .setAudience(new URL(config.publicAppUrl).hostname).setIssuedAt().setExpirationTime('5m').sign(privateKey);
const res = () => ({headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(b){this.body=b;return this;}});
function noticeDB() {
  let instructor = false, revoked = false, calls = 0;
  const row = {id:N,title:'fixture',content:'fixture'};
  return {row, setInstructor(v){instructor=v;}, revokeDuringWrite(){revoked=true;}, calls:()=>calls,
    client:{auth:{getClaims:async()=>({data:null,error:true})},from(table){
      calls++; const filters=[];
      const result=()=>({data:table==='vault_instructors' ? instructor ? {user_id:A} : null
        : filters.every(([k,v])=>row[k]===v) ? {...row} : null,error:null});
      const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},maybeSingle:async()=>result(),
        order:async()=>({data:[{...row}],error:null})};return q;
    },async rpc(name,args){
      assert.equal(name,'vault_update_notice');assert.equal(args.p_actor_id,A);calls++;
      if(revoked || !instructor || args.p_notice_id!==N)return {data:[],error:null};
      row.title=args.p_title;row.content=args.p_content;return {data:[{...row}],error:null};
    }} };
}
function setup() {
  const db=noticeDB();const handler=createNoticesHandler({config,supabase:db.client,judgeKeySet:async()=>publicKey});
  const request=async(method,id,body,auth=token,query={})=>{const out=res();
    await handler({method,query:{...query,...(id===undefined?{}:{id})},body,headers:auth?{authorization:`Bearer ${auth}`} : {}},out);return out;};
  return {db,request};
}
test('resource IDs separate notes and notices, including the same UUID',()=>{
  assert.notEqual(apiResourceId('notes',N),apiResourceId('notices',N));
  assert.equal(apiResourceId('notes',undefined),'notes:collection');
});
test('old normal fixture and arbitrary engine identities keep working; no DB link dependency',async()=>{
  const {normal}=fixtureRequests();assert.ok(RULE_IDS.includes('zone_notes_self'));
  for(const subjectId of ['learner_fixture','opaque-engine-subject']){
    assert.equal((await decide({...normal,subjectId})).decision,'allow');
    for(const method of ['GET','PUT']){
      assert.equal((await decide({...normal,subjectId,method,path:`/api/notes/${N}`,route:`${method} /api/notes/:id`})).decision,'allow');
    }
  }
  // This is route admission, not owner proof. Final API tests in stage3 assert B -> A = 404.
});
test('unknown/function/encoded/traversal/route mismatch and student notice writes reject',async()=>{
  const {normal}=fixtureRequests();
  for(const path of ['/notes/export','/notes/export.zip','/notes/%65xport','/notes/../demo','/notes/demo/extra','/notes/demo?role=admin']){
    assert.equal((await decide({...normal,path})).decision,'deny');
  }
  assert.equal((await decide({...normal,subjectId:''})).decision,'deny');
  assert.equal((await decide({...normal,method:'PUT',service:'notices',path:`/notices/${N}`,route:'PUT /notices/:id'})).decision,'deny');
  assert.equal((await decide({...normal,service:'notices',path:`/notices/${N}`,route:'GET /notices/:id'})).decision,'allow');
});
test('device and compound-risk rules also precede new write/read routes',async()=>{
  const {normal,suspicious}=fixtureRequests();
  for(const [service,method,path,route] of [['notes','PUT',`/api/notes/${N}`,'PUT /api/notes/:id'],['notes','GET',`/notes/${N}`,'GET /notes/:id']]){
    const routeFields={service,method,path,route};
    assert.equal((await decide({...normal,...routeFields,deviceRegistered:false})).reasonCode,'device_not_registered');
    assert.equal((await decide({...suspicious,...routeFields})).decision,'step_up');
    assert.equal((await decide({...suspicious,...routeFields,stepUp:{verified:true,authAgeSeconds:60}})).decision,'allow');
  }
});
test('policy rejects note collections/functions and keeps explicit announcement/material boundaries',async()=>{
  const {normal}=fixtureRequests();
  for(const base of ['/notes','/api/notes']) {
    for(const method of ['GET','POST','PUT','PATCH','DELETE']) {
      assert.equal((await decide({...normal,method,path:base,route:`${method} ${base}`})).decision,'deny');
    }
    for(const id of ['all','export','import','bulk','search','admin','ALL']) {
      assert.equal((await decide({...normal,path:`${base}/${id}`,route:`GET ${base}/:id`})).decision,'deny');
    }
    for(const method of ['POST','PATCH','DELETE']) {
      assert.equal((await decide({...normal,method,path:`${base}/${N}`,route:`${method} ${base}/:id`})).decision,'deny');
    }
  }
  for(const zone of ['notices','instructors','materials','announcements']) {
    for(const base of [`/${zone}`,`/api/${zone}`]) {
      for(const method of ['GET','POST','PUT','PATCH','DELETE']) {
        for(const id of ['',`/${N}`]) {
          const input={...normal,service:zone,method,path:base+id,route:`${method} ${base}${id?'/:id':''}`};
          const allowed = zone === 'announcements' || zone === 'notices';
          assert.equal((await decide(input)).decision, allowed && method === 'GET' && id ? 'allow' : 'deny');
          // Neither a notes service alias nor a simulated recheck can open this zone.
          assert.equal((await decide({...input,service:'notes',stepUp:{verified:true,authAgeSeconds:60}})).decision,'deny');
        }
      }
    }
  }
});
test('announcement writes and instructor materials return named zone reasons registered in RULE_IDS',async()=>{
  const {normal}=fixtureRequests();
  for(const service of ['announcements','notices'])for(const base of [`/${service}`,`/api/${service}`]){
    const read = await decide({...normal,service,path:`${base}/fixture_notice`,route:`GET ${base}/:id`});
    assert.equal(read.decision,'allow');assert.ok(read.ruleIds.includes('zone_announcements'));
    for(const method of ['POST','PUT','PATCH','DELETE'])for(const suffix of ['', '/fixture_notice']){
      const out=await decide({...normal,service,method,path:base+suffix,route:`${method} ${base}${suffix?'/:id':''}`});
      assert.equal(out.decision,'deny');assert.equal(out.reasonCode,'announcement_write_denied');
      assert.deepEqual(out.ruleIds,['zone_announcements']);
    }
  }
  for(const service of ['materials','instructors'])for(const base of [`/${service}`,`/api/${service}`]){
    for(const method of ['GET','POST','PUT','PATCH','DELETE']){
      const out=await decide({...normal,service,method,path:`${base}/fixture_material`,route:`${method} ${base}/:id`});
      assert.equal(out.decision,'deny');assert.equal(out.reasonCode,'instructor_material_denied');
      assert.deepEqual(out.ruleIds,['zone_instructor_materials']);
    }
  }
  for(const input of [normal,{...normal,service:'announcements',path:'/announcements/fixture_notice',route:'GET /announcements/:id'},
    {...normal,service:'materials',path:'/api/materials/fixture_material',route:'GET /api/materials/:id'}]){
    const out=await decide(input);assert.match(out.reasonCode,/^[a-z_]+$/);assert.ok(out.ruleIds.every(id=>RULE_IDS.includes(id)));
    assert.deepEqual(Object.keys(out).sort(),['decision','reasonCode','requestId','ruleIds','schema']);
  }
});
test('generic note IDs stay allowed; list discovery metadata never grants policy list access',async()=>{
  const {normal}=fixtureRequests();
  for(const id of ['demo','note_fixture','note-42',N])for(const base of ['/notes','/api/notes'])for(const method of ['GET','PUT']){
    assert.equal((await decide({...normal,method,path:`${base}/${id}`,route:`${method} ${base}/:id`})).decision,'allow');
  }
  assert.deepEqual(config.allowedRoutes,[{method:'GET',path:'/api/notes'},{method:'GET',path:'/api/notes/:id'},{method:'PUT',path:'/api/notes/:id'},
    {method:'GET',path:'/api/announcements/:id'},{method:'GET',path:'/api/notices/:id'}]);
  for(const route of config.allowedRoutes){
    const service=route.path.split('/')[2];
    const out=await decide({...normal,service,method:route.method,path:route.path.replace(':id','fixture_resource'),route:`${route.method} ${route.path}`});
    assert.equal(out.decision, route.path==='/api/notes' ? 'deny' : 'allow');
    if(route.path==='/api/notes')assert.deepEqual(out.ruleIds,['zone_notes_no_bulk']);
  }
  const routing=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.ok(routing.rewrites.some(r=>r.source==='/api/announcements/:id' && r.destination==='/api/notices?id=:id'));
});
test('device, query and risk checks also protect announcement reads; recheck cannot unlock writes',async()=>{
  const {normal,suspicious}=fixtureRequests();
  const fields={service:'announcements',path:'/api/announcements/fixture_notice',route:'GET /api/announcements/:id'};
  assert.equal((await decide({...normal,...fields,deviceRegistered:false})).reasonCode,'device_not_registered');
  assert.equal((await decide({...normal,...fields,queryLength:1})).decision,'deny');
  assert.equal((await decide({...normal,...fields,headers:{'x-role':'instructor'}})).decision,'step_up');
  assert.equal((await decide({...suspicious,...fields})).decision,'step_up');
  const fresh={...suspicious,...fields,stepUp:{verified:true,authAgeSeconds:60}};
  assert.equal((await decide(fresh)).decision,'allow');
  assert.equal((await decide({...fresh,method:'PUT',route:'PUT /api/announcements/:id'})).reasonCode,'announcement_write_denied');
});
test('policy denies query-bearing or mismatched requests without inferring a query function',async()=>{
  const {normal}=fixtureRequests();
  for(const queryLength of [1,-1,'0',undefined])assert.equal((await decide({...normal,queryLength})).decision,'deny');
  assert.equal((await decide({...normal,querySha256:'0'.repeat(64)})).decision,'deny');
  assert.equal((await decide({...normal,path:'/notes/demo?id=other'})).decision,'deny');
  assert.equal((await decide({...normal,route:'PUT /notes/:id'})).decision,'deny');
});
test('anonymous/invalid notices requests deny before database access',async()=>{
  const {db,request}=setup();
  for(const method of ['GET','PUT'])for(const auth of [null,'invalid'])assert.equal((await request(method,N,{},auth)).code,401);
  assert.equal(db.calls(),0);const out=res();await noticesEntry({headers:{}},out);assert.equal(out.code,401);
});
test('student cannot edit notices even with body role; verified user can read zone',async()=>{
  const {db,request}=setup();
  assert.equal((await request('GET',N)).headers['X-Resource-Id'],`notices:${N}`);
  assert.equal((await request('GET')).code,200);
  assert.equal((await request('PUT',N,{title:'blocked',body:'blocked',role:'instructor'})).code,403);
  assert.equal(db.row.title,'fixture');
  assert.equal((await request('GET',N,null,token,{operation:'export'})).code,400);
});
test('stored instructor may edit; injected role and permission revocation cannot write',async()=>{
  const {db,request}=setup();db.setInstructor(true);
  assert.equal((await request('PUT',N,{title:'edited',body:'edited'})).code,200);
  assert.equal((await request('PUT',N,{title:'blocked',body:'blocked',role:'instructor'})).code,400);
  db.revokeDuringWrite();assert.equal((await request('PUT',N,{title:'blocked',body:'blocked'})).code,404);
  assert.equal(db.row.title,'edited');
});
test('actual PostgreSQL notice RPC rechecks teacher, direct grants denied, migration preserves data',async()=>{
  const db=new PGlite();try{
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create table unrelated(id int); insert into unrelated values(1);');
    const sql=await readFile(new URL('../supabase/step8_resources.sql',import.meta.url),'utf8');
    await db.exec(sql);await db.query('insert into notices(id,title,content) values($1,$2,$3)',[N,'fixture','fixture']);
    await db.exec(sql);assert.equal((await db.query('select count(*) as n from notices')).rows[0].n,1);
    assert.equal((await db.query('select count(*) as n from unrelated')).rows[0].n,1);
    const call='select * from vault_update_notice($1,$2,$3,$4)';
    assert.equal((await db.query(call,[A,N,'blocked','blocked'])).rows.length,0);
    await db.query('insert into vault_instructors values($1)',[A]);
    await db.exec('set role service_role');assert.equal((await db.query(call,[A,N,'edited','edited'])).rows.length,1);await db.exec('reset role');
    await db.query('delete from vault_instructors where user_id=$1',[A]);
    assert.equal((await db.query(call,[A,N,'blocked','blocked'])).rows.length,0);
    for(const role of ['anon','authenticated']){
      await db.exec(`set role ${role}`);await assert.rejects(db.query('select * from notices'));await assert.rejects(db.query(call,[A,N,'blocked','blocked']));await db.exec('reset role');
    }
    assert.equal((await db.query('select title from notices where id=$1',[N])).rows[0].title,'edited');
  }finally{await db.close();}
});
