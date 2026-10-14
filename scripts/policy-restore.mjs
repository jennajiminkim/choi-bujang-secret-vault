import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {generateKeyPair,SignJWT} from 'jose';
import config from '../aleph.config.json' with {type:'json'};
import {initTrial,planRestore,applyRestore,SCOPE} from '../src/policy-recovery.mjs';
const root=resolve(import.meta.dirname,'..');
export async function rehearsePolicyRestore(){
 const trial=await initTrial(root,`policy-rehearsal-${randomUUID()}`);
 const safe=await readFile(resolve(trial,SCOPE),'utf8');
 // Simulate damage only in the isolated trial's note ownership checks.
 await writeFile(resolve(trial,SCOPE),safe.replaceAll(".eq('owner_id', user.userId)",''));
 const plan=await planRestore(root,trial);
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',n='33333333-3333-4333-8333-333333333333';
 const {privateKey,publicKey}=await generateKeyPair('ES256');
 const token=async(user)=>new SignJWT({aleph_role:'judge',aleph_identity:user===a?'a':'b',aleph_run:n})
 .setProtectedHeader({alg:'ES256'}).setSubject(user).setIssuer(config.judgeIssuer)
 .setAudience(new URL(config.publicAppUrl).hostname).setIssuedAt().setExpirationTime('5m').sign(privateKey);
 const authA=await token(a),authB=await token(b);
 const supabase={auth:{getClaims:async()=>({error:true})},from(){const filters=[];
  const row={id:n,owner_id:a,title:'fictional fixture',content:'fictional fixture'};
  const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},maybeSingle:async()=>({data:filters.every(([k,v])=>row[k]===v)?row:null,error:null})};return q;}};
 async function read(phase,auth){
  const {createNotesHandler}=await import(pathToFileURL(resolve(trial,SCOPE)).href+'?phase='+phase);
  const handler=createNotesHandler({config,supabase,judgeKeySet:async()=>publicKey});
  const res={setHeader(){},status(code){this.code=code;return this;},json(){return this;}};
  await handler({method:'GET',headers:{authorization:`Bearer ${auth}`},query:{id:n}},res);return res.code;
 }
 const beforeB=await read('before',authB);
 // Plan is made visible before the explicitly confirmed, isolated application.
 process.stdout.write(`시험 정책 복원 계획: ${JSON.stringify(plan)}\n`);
 const auditBefore=await readFile(resolve(trial,'audit.jsonl'),'utf8');
 const otherBefore=await readFile(resolve(trial,'src/resources.mjs'));
 await applyRestore(root,trial,plan);
 const afterA=await read('after',authA),afterB=await read('after',authB);
 const auditAfter=await readFile(resolve(trial,'audit.jsonl'),'utf8');
 const preserved=auditAfter.startsWith(auditBefore)&&otherBefore.equals(await readFile(resolve(trial,'src/resources.mjs')));
 if(beforeB!==200||afterA!==200||afterB!==404||!preserved)throw Error('trial_policy_recovery_failed');
 return {beforeB,afterA,afterB,preserved};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,trial,confirmation]=process.argv.slice(2);
  if(mode==='--demo'){const r=await rehearsePolicyRestore();console.log(`격리 시험: 복원 전 B→A ${r.beforeB}, 복원 후 A→A ${r.afterA}, B→A ${r.afterB}; 다른 서비스·감사 보존 ${r.preserved}`);}
  else if(mode==='--plan')console.log(JSON.stringify(await planRestore(root,resolve(trial)),null,2));
  else if(mode==='--apply'){const p=await planRestore(root,resolve(trial));await applyRestore(root,resolve(trial),{planHash:confirmation});console.log('확인된 시험 정책 복원 완료');}
  else throw Error('use_--demo_or_--plan_trial_or_--apply_trial_planHash');
 }catch{console.error('정책 복원 중단: 사본 검증·시험 경로·계획 확인을 점검하세요.');process.exitCode=1;}
}
