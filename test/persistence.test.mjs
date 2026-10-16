import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {test} from 'node:test';
import {decide} from '../xdr/persistence/decide.mjs';
import {extractAlerts} from '../xdr/persistence/read-alerts.mjs';
import {respond,loadRules,checkSourceIp,withPersistence,createZtnaDecider} from '../xdr/persistence/respond.mjs';
import {decide as baseDecide} from '../src/decider.mjs';
const fixture=JSON.parse(await readFile(new URL('../xdr/fixtures/persistence.json',import.meta.url),'utf8'));
const ordinary=fixture.alerts.filter(a=>a.rule.level<=3);
const attack=fixture.alerts[0],at=Date.parse(attack.timestamp);
const allow=r=>({schema:'aleph.decision.v1',requestId:r.requestId,decision:'allow',reasonCode:'approved',ruleIds:['existing.policy']});
const denyResponse=(r,m)=>({...allow(r),decision:'deny',reasonCode:'xdr_persistence',ruleIds:[m.ruleId]});

test('경보 24건의 다섯 항목 읽기와 비밀값 가림',()=>{
 const rows=extractAlerts(fixture.alerts);assert.equal(rows.length,24);
 assert.deepEqual(Object.keys(rows[0]),['timestamp','sourceIp','account','level','description']);
 const altered={...attack,full_log:'never-output',data:{...attack.data,srcuser:'token=never-output'},rule:{...attack.rule,description:'password="never-output"'}};
 assert.ok(!JSON.stringify(extractAlerts([altered])).includes('never-output'));
});
test('standalone file matches patterns and runs without globals or imports',async()=>{
 const source=await readFile(new URL('../xdr/persistence/decide.mjs',import.meta.url),'utf8');
 assert.ok(!/\bimport\b|\b(?:fetch|require|readFile|writeFile|eval)\s*\(/.test(source));
 const context=vm.createContext({});vm.runInContext(source.replace('export function decide','function decide')+'\nthis.run=decide; this.patterns=PATTERNS',context);
 const patterns=JSON.parse(await readFile(new URL('../xdr/persistence/patterns.json',import.meta.url),'utf8'));
 assert.deepEqual(JSON.parse(JSON.stringify(context.patterns)),patterns);
 assert.ok(patterns.every(p=>p.name&&p.condition&&p.evidence&&!p.evidence.includes('\n')));
 for(const a of fixture.alerts.toReversed())assert.deepEqual(JSON.parse(JSON.stringify(context.run(a))),decide(a));
});
test('복합 지속성 근거만 차단하고 서명 미확인·정상 서비스·단순 파일 생성은 격리하지 않는다',()=>{
 assert.equal(decide(attack).action,'block');
 assert.equal(decide({...attack,rule:{...attack.rule,level:9}}).action,'alert');
 assert.notEqual(decide({...attack,rule:{...attack.rule,mitre:[]}}).action,'block');
 assert.notEqual(decide({...attack,rule:{...attack.rule,level:'Infinity'}}).action,'block');
 for(const a of fixture.alerts.slice(8,16))assert.equal(decide({...a,rule:{...a.rule,level:13}}).action,'alert');
 const signed={...attack,rule:{...attack.rule,description:'서명된 기존 서비스가 실행 중입니다.'}};
 assert.notEqual(decide(signed).action,'block');
 assert.equal(decide({...attack,data:{...attack.data,path:'C:\\lab\\tool.exe'}}).action,'alert');
 assert.equal(decide(null).action,'record');
 for(const a of ordinary)assert.equal(decide(a).action,'record');
 const repeated=fixture.alerts[3];assert.equal(decide(repeated).action,'block');
 assert.equal(decide({...repeated,data:{...repeated.data,count:'2'}}).action,'alert');
 assert.equal(decide({...repeated,data:{...repeated.data,count:'Infinity'}}).action,'alert');
});
test('replay installs only clear candidates and normal addresses pass',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persistence-replay-'));
 try{
  const counts={block:0,alert:0,record:0};let installed=0,falseBlocks=0;
  for(const a of [...fixture.alerts].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp))){
   const now=Date.parse(a.timestamp),[out]=await respond([a],{root,mode:'replay',now});
   counts[out.action]++;installed+=Number(out.installed);
   const rules=await loadRules({root,mode:'replay',now});
   if(ordinary.includes(a)&&checkSourceIp(a.data.srcip,rules,now).blocked)falseBlocks++;
   assert.equal(checkSourceIp(a.data.srcip,rules,now).blocked,out.action==='block');
  }
  assert.deepEqual(counts,{block:8,alert:8,record:8});assert.equal(installed,8);assert.equal(falseBlocks,0);
  assert.deepEqual(await loadRules({root,mode:'live',now:at}),[]);
  const logs=(await readFile(join(root,'xdr/alerts.log'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(logs.length,16);assert.ok(logs.every(l=>!('data' in l)&&!('sourceIp' in l)&&!('useragent' in l)));
  assert.ok(logs.filter(l=>l.action==='alert').every(l=>l.installed===false));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('expiry, duplicate IDs, stale events, invalid IP, existing deny and step_up remain bounded',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persistence-policy-'));
 try{
  await respond([attack,attack],{root,now:at});const rules=await loadRules({root,now:at});
  assert.equal(rules.length,1);assert.equal(rules[0].alertIds.length,1);
  assert.equal(checkSourceIp(attack.data.srcip,rules,at+900000).blocked,false);
  assert.equal((await respond([attack],{root,now:at+3600000}))[0].installed,false);
  assert.equal((await respond([{...attack,data:{...attack.data,srcip:'invalid'}}],{root,now:at}))[0].installed,false);
  await respond([attack],{root,now:at});
  const request={requestId:'replay-request'},options={root,clock:()=>at,sourceIpForRequest:()=>attack.data.srcip,denyResponse};
  assert.equal((await withPersistence(allow,options)(request)).decision,'deny');
  assert.deepEqual(await withPersistence(allow,{...options,sourceIpForRequest:()=>ordinary[0].data.srcip})(request),allow(request));
  const step=r=>({...allow(r),decision:'step_up'});assert.equal((await withPersistence(step,options)(request)).decision,'deny');
  assert.deepEqual(await createZtnaDecider(options)(request),await baseDecide(request));
  await assert.rejects(withPersistence(allow,{...options,sourceIpForRequest:()=>null})(request));
 }finally{await rm(root,{recursive:true,force:true});}
});
