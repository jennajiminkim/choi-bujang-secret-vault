import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,cp,rm,symlink,unlink} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {verifiedPolicy,initTrial,planRestore,applyRestore,SCOPE} from '../src/policy-recovery.mjs';
import {rehearsePolicyRestore} from '../scripts/policy-restore.mjs';
const repo=resolve(import.meta.dirname,'..');
test('real isolated API before/after: own allowed, other owner denied; audit and other service unchanged',async()=>{
 assert.deepEqual(await rehearsePolicyRestore(),{beforeB:200,afterA:200,afterB:404,preserved:true});
});
test('confirmation required; stale plan aborts; production paths refused',async()=>{
 const trial=await initTrial(repo,`policy-rehearsal-${randomUUID()}`);
 try{
 const plan=await planRestore(repo,trial),file=join(trial,SCOPE);
 await assert.rejects(applyRestore(repo,trial,null));
 await writeFile(file,(await readFile(file,'utf8'))+'\n// changed after preview\n');
 const before=await readFile(file),audit=await readFile(join(trial,'audit.jsonl'));
 await assert.rejects(applyRestore(repo,trial,plan));assert.deepEqual(await readFile(file),before);
 assert.deepEqual(await readFile(join(trial,'audit.jsonl')),audit);
 await assert.rejects(planRestore(repo,repo));
 }finally{await rm(trial,{recursive:true,force:true});}
});
test('missing or corrupted pre-incident snapshot stops without writing policy',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'vault-policy-test-'));
 try{
 await assert.rejects(verifiedPolicy(temp));
 execFileSync('git',['clone','--shared','--no-checkout','--quiet',repo,join(temp,'repo')]);
 const isolated=join(temp,'repo');await cp(join(repo,'backups'),join(isolated,'backups'),{recursive:true});
 const safe=await verifiedPolicy(isolated);assert.equal(safe.files.size,5);
 await writeFile(join(isolated,'backups/policy-9',SCOPE),'corrupt fixture');
 await assert.rejects(verifiedPolicy(isolated));
 }finally{await rm(temp,{recursive:true,force:true});}
});
test('audit symlink cannot append to other history',async()=>{
 const trial=await initTrial(repo,`policy-rehearsal-${randomUUID()}`);
 const audit=join(trial,'audit.jsonl'),other=join(trial,'other-audit');
 try{
 await writeFile(other,'existing history\n');await unlink(audit);await symlink(other,audit);
 await assert.rejects(planRestore(repo,trial));assert.equal(await readFile(other,'utf8'),'existing history\n');
 }finally{await rm(trial,{recursive:true,force:true});}
});

test('decider reads only contract names and emits five fields with registered rules',async()=>{
 const {decide,RULE_IDS}=await import('../src/decider.mjs');
 const {fixtureRequests}=await import('../scripts/fixture-7.mjs');
 const names=new Set(['schema','requestId','classId','projectId','subjectId','deviceId','service','method','path','route','queryLength','querySha256','at','policyRevision','deviceRegistered','stepUp','recentEvents','signals']);
 const {normal,suspicious}=fixtureRequests();
 for(const input of [normal,suspicious,{...normal,deviceRegistered:false},
  {...normal,path:'/unknown',route:'GET /unknown'},
  {...normal,service:'announcements',method:'PUT',path:'/api/announcements/demo',route:'PUT /api/announcements/:id'},
  {...normal,service:'materials',path:'/api/materials/demo',route:'GET /api/materials/:id'}]){
  const protectedRequest=new Proxy(input,{get(target,key){if(typeof key==='string'&&!names.has(key))throw Error('non_contract_read');return target[key];}});
  const out=await decide(protectedRequest);
  assert.deepEqual(Object.keys(out).sort(),['decision','reasonCode','requestId','ruleIds','schema']);
  assert.equal(out.schema,'aleph.decision.v1');assert.equal(out.requestId,input.requestId);
  assert.ok(['allow','deny','step_up'].includes(out.decision));assert.match(out.reasonCode,/^[a-z][a-z_]*$/);
  assert.ok(out.ruleIds.every(id=>RULE_IDS.includes(id)));
 }
});
