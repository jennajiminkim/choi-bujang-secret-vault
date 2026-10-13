import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
import { PGlite } from '@electric-sql/pglite';
import config from '../aleph.config.json' with {type:'json'};
import { decide, createResourceDecider } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { classifyResource } from '../src/resources.mjs';
import { createResourceAuthorizer } from '../src/resource-authorization.mjs';
import { createNotesHandler } from '../src/notes-api.mjs';
import { createNoticesHandler } from '../src/notices-api.mjs';

const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const N='33333333-3333-4333-8333-333333333333';
const {privateKey,publicKey}=await generateKeyPair('ES256'); // Ephemeral test process only; never persisted or printed.
async function studentToken(id) {
  return new SignJWT({role:'authenticated'}).setProtectedHeader({alg:'ES256'}).setSubject(id)
    .setIssuer(config.identityProvider.issuer).setAudience('authenticated').setIssuedAt().setExpirationTime('5m').sign(privateKey);
}
const authA=await studentToken(A),authB=await studentToken(B);
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v},status(v){this.code=v;return this},json(v){this.body=v;return this}});

function database() {
  const tables={notes:[{id:A,owner_id:A,title:'fixture',content:'fixture'}],
    notices:[{id:N,title:'notice',content:'fixture'}],vault_instructors:[{user_id:A}],
    vault_subject_links:[{repo_url:config.repoUrl,class_id:'real-class',project_id:'real-project',subject_id:'opaque-A',user_id:A},
      {repo_url:config.repoUrl,class_id:'real-class',project_id:'real-project',subject_id:'opaque-B',user_id:B}]};
  let revokeBeforeRpc=false;
  const client={auth:{getClaims:async value=>{
    try { const {payload}=await jwtVerify(value,publicKey,{issuer:config.identityProvider.issuer,audience:'authenticated',algorithms:['ES256']});
      return {data:{claims:payload},error:null}; } catch{return {data:null,error:{message:'invalid'}};}
  }},from(table){
    let action='read',payload;const filters=[];
    const result=single=>{
      const rows=tables[table];if(!rows)return {data:null,error:{code:'42P01'}};
      const found=rows.filter(row=>filters.every(([k,v])=>row[k]===v));
      if(action==='update')found.forEach(row=>Object.assign(row,payload));
      if(action==='insert'){if(rows.some(row=>row.id===payload.id))return {data:null,error:{code:'23505'}};rows.push({...payload});return {data:payload,error:null};}
      if(action==='delete')tables[table]=rows.filter(row=>!found.includes(row));
      return {data:single?found[0]??null:found,error:null};
    };
    const q={select(){return q},eq(k,v){filters.push([k,v]);return q},update(v){action='update';payload=v;return q},
      insert(v){action='insert';payload=v;return q},delete(){action='delete';return q},order(){return Promise.resolve(result(false))},
      maybeSingle(){return Promise.resolve(result(true))},single(){return Promise.resolve(result(true))}};return q;
  },async rpc(name,p){
    assert.equal(name,'vault_update_notice');
    if(revokeBeforeRpc)tables.vault_instructors=[];
    if(!tables.vault_instructors.some(row=>row.user_id===p.p_actor_id))return {data:[],error:null};
    const row=tables.notices.find(row=>row.id===p.p_notice_id);if(!row)return {data:[],error:null};
    Object.assign(row,{title:p.p_title,content:p.p_content});return {data:[row],error:null};
  }};
  return {client,tables,revoke(){revokeBeforeRpc=true}};
}
function setup() {
  const db=database();const notes=createNotesHandler({config,supabase:db.client,judgeKeySet:async()=>publicKey});
  const notices=createNoticesHandler({config,supabase:db.client,judgeKeySet:async()=>publicKey});
  const request=async(collection,method,id,body,auth=authA,extraQuery={})=>{
    const res=response();await (collection==='notes'?notes:notices)({method,query:{...(id?{id}:{}),...extraQuery},body,
      headers:{authorization:`Bearer ${auth}`}},res);return res;
  };return {db,request};
}

test('구역 판정은 A의 읽기·수정 허용, B의 A 접근과 일반 학생 공지 수정 거부',async()=>{
  const {normal}=fixtureRequests();
  const note={...normal,path:`/notes/${normal.subjectId}--note`,route:'GET /notes/:id'};
  assert.equal((await decide(note)).decision,'allow');
  assert.equal((await decide({...note,method:'PUT',route:'PUT /notes/:id'})).decision,'allow');
  assert.equal((await decide({...note,subjectId:'learner_b_fixture'})).decision,'deny');
  const notice={...normal,service:'notices',path:`/notices/${N}`,method:'PUT',route:'PUT /notices/:id'};
  assert.equal((await decide(notice)).decision,'deny');
  assert.equal((await decide({...notice,subjectId:'instructor_fixture'})).decision,'deny'); // A name cannot establish an instructor grant.
  assert.equal((await decide({...note,deviceRegistered:false})).reasonCode,'device_not_registered');
});

test('export·계층 이탈·인코딩·서비스/경로 불일치와 미확인 사용자 연결은 거부',async()=>{
  const {normal}=fixtureRequests();
  for(const path of ['/notes/export','/notes/../admin','/notes/%2e%2e','/notes/demo/export','/notices/'+N]) {
    assert.equal(classifyResource({...normal,path},{fixtureDemo:false}),null);
    assert.equal((await decide({...normal,path})).decision,'deny');
  }
  const actual={...normal,classId:'real-class',projectId:'real-project',subjectId:'opaque-A',path:`/notes/${A}`,
    signals:{source:'none',region:'unknown',network:'unknown',hour:14}};
  const db=database();const policy=createResourceDecider({authorize:createResourceAuthorizer({config,supabase:db.client})});
  assert.equal((await policy(actual)).decision,'allow');
  assert.equal((await policy({...actual,subjectId:'opaque-B'})).decision,'deny');
  assert.equal((await policy({...actual,subjectId:A})).decision,'deny'); // Never assume subjectId is a database UUID.
  assert.equal((await policy({...actual,classId:'other-class'})).decision,'deny');
  for (const value of [undefined, false, {allowed:false}]) {
    const unresolved=createResourceDecider({authorize:async()=>value});
    assert.equal((await unresolved(actual)).decision,'deny');
  }
  assert.equal((await createResourceDecider({authorize:async()=>{throw new Error('unavailable')}})(actual)).decision,'deny');
});

test('API 재확인: 자기 메모 CRUD 유지, 타인 메모와 위조 role 직접 요청 거부',async()=>{
  const {request,db}=setup();
  const own=await request('notes','GET',A);assert.equal(own.code,200);assert.equal(own.headers['X-Resource-Id'],`notes:${A}`);
  assert.equal((await request('notes','PUT',A,{title:'edited',body:'fixture'})).code,200);
  for(const method of ['GET','PUT','DELETE']) {
    const out=await request('notes',method,A,{title:'blocked',body:'fixture'},authB);
    assert.equal(out.code,404);assert.deepEqual(Object.keys(out.body),['error']);
  }
  const denied=await request('notices','PUT',N,{title:'blocked',body:'fixture',role:'instructor'},authB);
  assert.equal(denied.code,403);assert.equal(denied.body.code,'instructor_required');
  assert.equal(db.tables.notices[0].title,'notice');
  assert.equal((await request('notes','GET',A,undefined,authA,{action:'export'})).code,400);
  assert.equal((await request('notices','GET',N,undefined,authA,{role:'instructor'})).code,400);
  assert.equal((await request('notes','GET',[A])).code,400);
});

test('실제 API의 본인 목록·단건 진입은 연결표 없이 허용하고 쿼리 우회는 거부한다',async()=>{
  const {normal}=fixtureRequests();
  const ownList={...normal,classId:'another-class',projectId:'another-project',subjectId:'opaque-current-user',
    path:'/api/notes',route:'GET /api/notes',
    signals:{source:'none',region:'unknown',network:'unknown',hour:14}};
  assert.equal((await decide(ownList)).decision,'allow');
  assert.equal((await decide({...ownList,queryLength:40})).decision,'deny');
  assert.equal((await decide({...ownList,subjectId:''})).decision,'deny');
  assert.equal((await decide({...ownList,deviceRegistered:false})).reasonCode,'device_not_registered');
  assert.equal((await decide({...ownList,signals:{source:'judge_fixture',region:'local',network:'unusual',hour:3},
    recentEvents:[{kind:'risk_signal',ageSeconds:60,count:20}]})).decision,'step_up');
  assert.equal((await decide({...ownList,path:`/api/notes/${A}`,route:'GET /api/notes/:id'})).decision,'allow');
  assert.equal((await decide({...ownList,path:'/notes',route:'GET /notes'})).decision,'deny');
});

test('문자 ID도 소유권 확인 뒤 판정하고 UUID 형식이 아니라는 이유만으로 거부하지 않는다',async()=>{
  const {normal}=fixtureRequests();
  const request={...normal,classId:'test-class',projectId:'test-project',subjectId:'opaque-A',path:'/notes/note-one'};
  const authorizer=async(input,resource)=>resource.id==='note-one' && input.subjectId==='opaque-A';
  const policy=createResourceDecider({authorize:authorizer});
  assert.equal(classifyResource(request)?.id,'note-one');
  assert.equal((await policy(request)).decision,'allow');
  assert.equal((await policy({...request,method:'PUT',route:'PUT /notes/:id'})).decision,'allow');
  assert.equal((await policy({...request,subjectId:'opaque-B'})).decision,'deny');
  assert.equal((await policy({...request,path:'/notes/export'})).decision,'deny');
});

test('주체별 논리 자원은 반·프로젝트 하드코딩과 최초 요청 순서 없이 본인만 허용한다',async()=>{
  const {normal}=fixtureRequests();
  for(const source of ['none','judge_fixture']) {
    const input={...normal,classId:'independent-class',projectId:'independent-project',subjectId:'owner_alpha',
      path:'/notes/owner_alpha--memo',signals:source==='none'
        ? {source,region:'unknown',network:'unknown',hour:14} : {...normal.signals,source}};
    // The attacker arrives first: no ownership may be acquired by visiting the ID.
    assert.equal((await decide({...input,subjectId:'owner_beta'})).decision,'deny');
    assert.equal((await decide(input)).decision,'allow');
    assert.equal((await decide({...input,method:'PUT',route:'PUT /notes/:id'})).decision,'allow');
    assert.equal((await decide({...input,subjectId:'owner_alph'})).decision,'deny');
    assert.equal((await decide({...input,subjectId:'OWNER_ALPHA'})).decision,'deny');
    assert.equal((await decide({...input,path:'/notes/unassigned-memo'})).decision,'deny');
    assert.equal((await decide({...input,path:`/api/notes/${A}`,queryLength:10,route:'GET /api/notes/:id'})).decision,'deny');
  }
});

test('판정기 API 진입 허용 뒤 최종 API는 본인 단건 200, B의 A 메모 404를 보장한다',async()=>{
  const {normal}=fixtureRequests();
  const {request,db}=setup();
  db.tables.vault_subject_links=[]; // No operator mapping: neither path may depend on it.
  const input={...normal,classId:'independent-class',projectId:'independent-project',subjectId:'opaque-A',
    path:`/api/notes/${A}`,route:'GET /api/notes/:id',signals:{source:'none',region:'unknown',network:'unknown',hour:14}};
  for(const method of ['GET','PUT','DELETE']) {
    const entry={...input,method,route:`${method} /api/notes/:id`};
    assert.equal((await decide(entry)).decision,'allow');
    // Entry is permission to invoke the owner-filtered API, not permission to receive the row.
    assert.equal((await decide({...entry,subjectId:'opaque-B'})).decision,'allow');
    const denied=await request('notes',method,A,{title:'blocked',body:'fixture'},authB);
    assert.equal(denied.code,404);assert.deepEqual(Object.keys(denied.body),['error']);
  }
  assert.equal((await request('notes','GET',A)).code,200);
  assert.equal(db.tables.notes[0].title,'fixture');
  assert.equal((await request('notes','PUT',A,{title:'edited',body:'fixture'})).code,200);
});

test('공지 읽기와 서버 저장 강사 수정 허용; 갱신 순간 권한 회수도 대조한다',async()=>{
  const {request,db}=setup();
  const read=await request('notices','GET',N,undefined,authB);assert.equal(read.code,200);
  assert.equal(read.headers['X-Resource-Id'],`notices:${N}`);
  assert.equal((await request('notices','PUT',N,{title:'updated',body:'fixture'})).code,200);
  db.revoke();
  assert.equal((await request('notices','PUT',N,{title:'not-applied',body:'fixture'})).code,404);
  assert.equal(db.tables.notices[0].title,'updated');
  assert.equal((await request('notices','PUT',N,{title:'blocked',body:'fixture'},authB)).code,403);
});

test('권한/공지 SQL은 직접 클라이언트 접근을 막고 기존 notes는 바꾸지 않는다',async()=>{
  const db=new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create table public.notes (id uuid primary key, owner_id uuid);");
    const sql=await readFile(new URL('../supabase/step8_resources.sql',import.meta.url),'utf8');
    await db.exec(sql);await db.exec(sql);
    await db.exec(`insert into public.notices(id,title,content) values('${N}','fixture','fixture'); insert into public.vault_instructors(user_id) values('${A}');`);
    const before=await db.query('select count(*)::int as n from notes');assert.equal(before.rows[0].n,0);
    for(const role of ['anon','authenticated']) {
      const permissions=await db.query(`select has_table_privilege('${role}','public.vault_instructors','SELECT') as allowed, has_function_privilege('${role}','public.vault_update_notice(uuid,uuid,text,text)','EXECUTE') as callable`);
      assert.equal(permissions.rows[0].allowed,false);assert.equal(permissions.rows[0].callable,false);
    }
    await db.exec('set role service_role');
    const denied=await db.query('select * from public.vault_update_notice($1,$2,$3,$4)',[B,N,'blocked','fixture']);assert.equal(denied.rows.length,0);
    const allowed=await db.query('select * from public.vault_update_notice($1,$2,$3,$4)',[A,N,'edited','fixture']);assert.equal(allowed.rows[0].title,'edited');
  }finally{await db.close();}
});
