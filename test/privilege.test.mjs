import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {test} from 'node:test';
import {decide} from '../xdr/privilege/decide.mjs';
import {extractAlerts} from '../xdr/privilege/read-alerts.mjs';
import {respond,loadRules,checkSession,withPrivilege,createZtnaDecider} from '../xdr/privilege/respond.mjs';
import {decide as baseDecide} from '../src/decider.mjs';
const fixture=JSON.parse(await readFile(new URL('../xdr/fixtures/privilege.json',import.meta.url),'utf8'));
const normal=fixture.alerts.filter(a=>a.rule.level<=3),attack=fixture.alerts[0],at=Date.parse(attack.timestamp);
const resolveSessionForAlert=a=>({subjectId:a.data.srcuser,sessionRef:'fixture-'+createHash('sha256').update(JSON.stringify([a.data.srcuser,a.data.srcip])).digest('hex')});
const allow=r=>({schema:'aleph.decision.v1',requestId:r.requestId,decision:'allow',reasonCode:'approved',ruleIds:['existing.policy']});
const denyResponse=(r,m)=>({...allow(r),decision:'deny',reasonCode:'xdr_privilege',ruleIds:[m.ruleId]});
test('경보 26건 읽기와 비밀값 가림',()=>{
 const rows=extractAlerts(fixture.alerts);assert.equal(rows.length,26);
 assert.deepEqual(Object.keys(rows[0]),['timestamp','sourceIp','account','level','description']);
 const altered={...attack,full_log:'never-output',data:{...attack.data,srcuser:'token=never-output'},rule:{...attack.rule,description:'password="never-output"'}};
 assert.ok(!JSON.stringify(extractAlerts([altered])).includes('never-output'));
});
test('패턴 복사와 독립 환경·역순 판단·반환 경계 검증',async()=>{
 const source=await readFile(new URL('../xdr/privilege/decide.mjs',import.meta.url),'utf8');
 assert.ok(!/\bimport\b|\b(?:fetch|require|readFile|writeFile|eval)\s*\(/.test(source));
 const context=vm.createContext({});vm.runInContext(source.replace('export function decide','function decide')+'\nthis.run=decide;this.patterns=PATTERNS;',context);
 const patterns=JSON.parse(await readFile(new URL('../xdr/privilege/patterns.json',import.meta.url),'utf8'));
 assert.deepEqual(JSON.parse(JSON.stringify(context.patterns)),patterns);assert.ok(patterns.every(p=>p.name&&p.condition&&p.evidence&&!p.evidence.includes('\n')));
 for(const a of fixture.alerts.toReversed()){
  const out=decide(a);assert.deepEqual(JSON.parse(JSON.stringify(context.run(a))),out);
  assert.equal(out.action,out.confidence>=0.85?'block':out.confidence>=0.5?'alert':'record');
 }
});
test('관리자 그룹·복합 권한 사용만 차단하고 취소·실패·조회·시각 단독은 차단하지 않는다',()=>{
 for(const a of fixture.alerts.slice(0,9))assert.equal(decide(a).action,'block');
 for(const a of fixture.alerts.slice(9,17))assert.equal(decide({...a,rule:{...a.rule,level:13}}).action,'alert');
 assert.equal(decide({...attack,rule:{...attack.rule,level:9}}).action,'alert');
 assert.notEqual(decide({...attack,rule:{...attack.rule,mitre:[]}}).action,'block');
 assert.equal(decide({...attack,data:{...attack.data,group:'project-week3'}}).action,'alert');
 assert.equal(decide({...fixture.alerts[2],rule:{...fixture.alerts[2].rule,description:'수업 시간 밖에 관리자 명령을 실행했습니다.'}}).action,'alert');
 assert.equal(decide({...fixture.alerts[4],data:{...fixture.alerts[4].data,count:'Infinity'}}).action,'alert');
 assert.equal(decide({...fixture.alerts[8],data:{...fixture.alerts[8].data,count:'1'}}).action,'alert');
 assert.equal(decide(null).action,'record');for(const a of normal)assert.equal(decide(a).action,'record');
});
test('재생에서 정상·애매한 세션 보존, 알림 원문 비저장',async()=>{
 const root=await mkdtemp(join(tmpdir(),'privilege-replay-'));
 try{
  const counts={block:0,alert:0,record:0};let installed=0,falseBlocks=0;
  for(const a of [...fixture.alerts].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp))){
   const now=Date.parse(a.timestamp),[out]=await respond([a],{root,mode:'replay',now,resolveSessionForAlert});counts[out.action]++;installed+=Number(out.installed);
   const blocked=checkSession(resolveSessionForAlert(a),await loadRules({root,mode:'replay',now}),now).blocked;
   assert.equal(blocked,out.action==='block');if(normal.includes(a)&&blocked)falseBlocks++;
  }
  assert.deepEqual(counts,{block:9,alert:8,record:9});assert.equal(installed,9);assert.equal(falseBlocks,0);
  assert.deepEqual(await loadRules({root,now:at}),[]);
  const logs=(await readFile(join(root,'xdr','alerts.log'),'utf8')).trim().split('\n').map(JSON.parse);assert.equal(logs.length,17);
  assert.ok(logs.filter(l=>l.action==='alert').every(l=>!l.installed));
  assert.ok(!JSON.stringify(logs).includes('user01'));assert.ok(logs.every(l=>!('data'in l)&&!('srcip'in l)&&!('sessionRef'in l)));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('미연결 주체는 회수하지 않고 중복·만료·과거와 미래 경보를 검사',async()=>{
 const root=await mkdtemp(join(tmpdir(),'privilege-expiry-'));
 try{
  assert.equal((await respond([attack],{root,now:at}))[0].installed,false);
  assert.equal((await respond([attack],{root,now:at,resolveSessionForAlert:()=>null}))[0].installed,false);
  await respond([attack,attack],{root,now:at,resolveSessionForAlert});const rules=await loadRules({root,now:at});assert.equal(rules.length,1);assert.equal(rules[0].alertIds.length,1);
  assert.equal(checkSession(resolveSessionForAlert(attack),rules,at+900000).blocked,false);
  assert.equal((await respond([attack],{root,now:at+3600000,resolveSessionForAlert}))[0].installed,false);
  assert.equal((await respond([attack],{root,now:at-3600000,resolveSessionForAlert}))[0].installed,false);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('대상 세션만 거부하고 같은 계정 다른 세션·다른 계정과 기존 정책을 보존',async()=>{
 const root=await mkdtemp(join(tmpdir(),'privilege-policy-'));
 try{
  await respond([attack],{root,now:at,resolveSessionForAlert});const session=resolveSessionForAlert(attack);
  const req={requestId:'test-request'},options={root,clock:()=>at,sessionForRequest:()=>session,denyResponse};
  assert.equal((await withPrivilege(allow,options)(req)).decision,'deny');
  for(const good of [{...session,sessionRef:'other-session'},{...session,subjectId:'other-subject'}])assert.deepEqual(await withPrivilege(allow,{...options,sessionForRequest:()=>good})(req),allow(req));
  const step=r=>({...allow(r),decision:'step_up'});assert.equal((await withPrivilege(step,options)(req)).decision,'deny');
  const deny=r=>({...allow(r),decision:'deny'});assert.deepEqual(await withPrivilege(deny,options)(req),deny(req));
  assert.deepEqual(await createZtnaDecider(options)(req),await baseDecide(req));
  await assert.rejects(withPrivilege(allow,{...options,sessionForRequest:()=>null})(req));
 }finally{await rm(root,{recursive:true,force:true});}
});
