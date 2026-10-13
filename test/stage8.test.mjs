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
  const {normal}=fixtureRequests();assert.ok(RULE_IDS.includes('resource_routes'));
  for(const subjectId of ['learner_fixture','opaque-engine-subject']){
    assert.equal((await decide({...normal,subjectId})).decision,'allow');
    for(const method of ['GET','PUT','DELETE']){
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
  for(const [service,method,path,route] of [['notes','PUT',`/api/notes/${N}`,'PUT /api/notes/:id'],['notices','GET',`/notices/${N}`,'GET /notices/:id']]){
    const routeFields={service,method,path,route};
    assert.equal((await decide({...normal,...routeFields,deviceRegistered:false})).reasonCode,'device_not_registered');
    assert.equal((await decide({...suspicious,...routeFields})).decision,'step_up');
    assert.equal((await decide({...suspicious,...routeFields,stepUp:{verified:true,authAgeSeconds:60}})).decision,'allow');
  }
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
