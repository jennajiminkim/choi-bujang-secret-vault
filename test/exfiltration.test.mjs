import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {test} from 'node:test';
import {decide} from '../xdr/exfiltration/decide.mjs';
import {extractAlerts} from '../xdr/exfiltration/read-alerts.mjs';
import {respond,loadRules,checkDestinationIp,withExfiltration,createZtnaDecider} from '../xdr/exfiltration/respond.mjs';
import {decide as baseDecide} from '../src/decider.mjs';
const fixture=JSON.parse(await readFile(new URL('../xdr/fixtures/exfiltration.json',import.meta.url),'utf8'));
const ordinary=fixture.alerts.filter(a=>a.rule.level<=3);
const attack=fixture.alerts[0],at=Date.parse(attack.timestamp);
const allow=r=>({schema:'aleph.decision.v1',requestId:r.requestId,decision:'allow',reasonCode:'approved',ruleIds:['existing.policy']});
const denyResponse=(r,m)=>({...allow(r),decision:'deny',reasonCode:'xdr_exfiltration',ruleIds:[m.ruleId]});

test('경보 30건의 다섯 항목 읽기와 비밀값 가림',()=>{
 const rows=extractAlerts(fixture.alerts);assert.equal(rows.length,30);
 assert.deepEqual(Object.keys(rows[0]),['timestamp','sourceIp','account','level','description']);
 const altered={...attack,full_log:'never-output',data:{...attack.data,srcuser:'token=never-output'},rule:{...attack.rule,description:'password="never-output"'}};
 assert.ok(!JSON.stringify(extractAlerts([altered])).includes('never-output'));
});
test('standalone file matches patterns and runs without globals or imports',async()=>{
 const source=await readFile(new URL('../xdr/exfiltration/decide.mjs',import.meta.url),'utf8');
 assert.ok(!/\bimport\b|\b(?:fetch|require|readFile|writeFile|eval)\s*\(/.test(source));
 const context=vm.createContext({});vm.runInContext(source.replace('export function decide','function decide')+'\nthis.run=decide; this.patterns=PATTERNS',context);
 const patterns=JSON.parse(await readFile(new URL('../xdr/exfiltration/patterns.json',import.meta.url),'utf8'));
 assert.deepEqual(JSON.parse(JSON.stringify(context.patterns)),patterns);
 assert.ok(patterns.every(p=>p.name&&p.condition&&p.evidence&&!p.evidence.includes('\n')));
 for(const a of fixture.alerts.toReversed())assert.deepEqual(JSON.parse(JSON.stringify(context.run(a))),decide(a));
});
test('용량·목적지·복합 신호 경계와 실패·압축 생성·정상 전송 보호',()=>{
 for(const a of fixture.alerts.slice(0,10))assert.equal(decide(a).action,'block');
 for(const a of fixture.alerts.slice(10,20))assert.equal(decide({...a,rule:{...a.rule,level:13}}).action,'alert');
 assert.equal(decide({...attack,rule:{...attack.rule,level:9}}).action,'alert');
 assert.notEqual(decide({...attack,rule:{...attack.rule,mitre:[]}}).action,'block');
 assert.equal(decide({...attack,data:{...attack.data,bytes:'49999999'}}).action,'alert');
 assert.equal(decide({...attack,data:{...attack.data,bytes:'50000000'}}).action,'block');
 for(const bytes of ['Infinity','NaN','-1',true,Number.MAX_SAFE_INTEGER+1])assert.equal(decide({...attack,data:{...attack.data,bytes}}).action,'alert');
 assert.equal(decide({...attack,data:{...attack.data,dstip:undefined}}).action,'alert');
 assert.equal(decide({...fixture.alerts[2],data:{...fixture.alerts[2].data,count:'4'}}).action,'alert');
 assert.equal(decide({...fixture.alerts[2],data:{...fixture.alerts[2].data,count:'5'}}).action,'block');
 const failed={...attack,rule:{...attack.rule,description:'전송이 실패 1건으로 끝났습니다. 목적지는 처음 봅니다.'}};
 assert.equal(decide(failed).action,'alert');
 assert.equal(decide(null).action,'record');for(const a of ordinary)assert.equal(decide(a).action,'record');
});
test('replay installs only clear candidates and normal addresses pass',async()=>{
 const root=await mkdtemp(join(tmpdir(),'exfiltration-replay-'));
 try{
  const counts={block:0,alert:0,record:0};let installed=0,falseBlocks=0;
  for(const a of [...fixture.alerts].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp))){
   const now=Date.parse(a.timestamp),[out]=await respond([a],{root,mode:'replay',now});
   counts[out.action]++;installed+=Number(out.installed);
   const rules=await loadRules({root,mode:'replay',now});
   if(ordinary.includes(a)&&checkDestinationIp(a.data.dstip,rules,now).blocked)falseBlocks++;
   assert.equal(checkDestinationIp(a.data.dstip,rules,now).blocked,out.action==='block');
  }
  assert.deepEqual(counts,{block:10,alert:10,record:10});assert.equal(installed,10);assert.equal(falseBlocks,0);
  assert.deepEqual(await loadRules({root,mode:'live',now:at}),[]);
  const logs=(await readFile(join(root,'xdr/alerts.log'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(logs.length,20);assert.ok(logs.every(l=>!('data' in l)&&!('destinationIp' in l)&&!('useragent' in l)));
  assert.ok(logs.filter(l=>l.action==='alert').every(l=>l.installed===false));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('expiry, duplicate IDs, stale events, invalid IP, existing deny and step_up remain bounded',async()=>{
 const root=await mkdtemp(join(tmpdir(),'exfiltration-policy-'));
 try{
  await respond([attack,attack],{root,now:at});const rules=await loadRules({root,now:at});
  assert.equal(rules.length,1);assert.equal(rules[0].alertIds.length,1);
  assert.equal(checkDestinationIp(attack.data.dstip,rules,at+900000).blocked,false);
  assert.equal((await respond([attack],{root,now:at+3600000}))[0].installed,false);
  assert.equal((await respond([{...attack,data:{...attack.data,dstip:'invalid'}}],{root,now:at}))[0].installed,false);
  await respond([attack],{root,now:at});
  const request={requestId:'replay-request'},options={root,clock:()=>at,destinationIpForRequest:()=>attack.data.dstip,denyResponse};
  assert.equal((await withExfiltration(allow,options)(request)).decision,'deny');
  assert.deepEqual(await withExfiltration(allow,{...options,destinationIpForRequest:()=>ordinary[0].data.dstip})(request),allow(request));
    assert.deepEqual(await withExfiltration(allow,{...options,destinationIpForRequest:()=>attack.data.srcip})(request),allow(request));
  const step=r=>({...allow(r),decision:'step_up'});assert.equal((await withExfiltration(step,options)(request)).decision,'deny');
  assert.deepEqual(await createZtnaDecider(options)(request),await baseDecide(request));
  await assert.rejects(withExfiltration(allow,{...options,destinationIpForRequest:()=>null})(request));
 }finally{await rm(root,{recursive:true,force:true});}
});
