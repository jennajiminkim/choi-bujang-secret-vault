import {appendFile,mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decide} from './decide.mjs';
import {decide as existingDecide} from '../../src/decider.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const TTL=15*60*1000,RULE_ID='xdr.privilege.session';
const SAFE=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const HASH=/^[a-f0-9]{64}$/;
function modeCheck(mode){if(!['live','replay'].includes(mode))throw Error('mode는 live 또는 replay여야 합니다.');}
function pathFor(root,mode){modeCheck(mode);return join(root,'xdr','privilege',mode==='live'?'deny-rules.json':'replay-deny-rules.json');}
function binding(value){
 if(!value||typeof value.subjectId!=='string'||typeof value.sessionRef!=='string'||!SAFE.test(value.subjectId)||!SAFE.test(value.sessionRef))return null;
 // Opaque references from the trusted host, never access/refresh tokens.
 const hash=value=>createHash('sha256').update(value).digest('hex');
 return {subjectKey:hash(value.subjectId),sessionKey:hash(value.sessionRef)};
}
function valid(rule,now){return rule?.ruleId===RULE_ID&&rule.action==='deny'&&HASH.test(rule.subjectKey??'')&&HASH.test(rule.sessionKey??'')
 &&Array.isArray(rule.alertIds)&&rule.alertIds.length>0&&rule.alertIds.every(id=>typeof id==='string'&&SAFE.test(id))
 &&Number.isFinite(Date.parse(rule.createdAt))&&Number.isFinite(Date.parse(rule.expiresAt))&&Date.parse(rule.createdAt)<=now&&Date.parse(rule.expiresAt)>now
 &&Date.parse(rule.expiresAt)-Date.parse(rule.createdAt)>0&&Date.parse(rule.expiresAt)-Date.parse(rule.createdAt)<=TTL;}
export async function loadRules({root=ROOT,mode='live',now=Date.now()}={}){
 if(!Number.isFinite(now))throw Error('확인 시각이 아닙니다.');
 let data;try{data=JSON.parse(await readFile(pathFor(root,mode),'utf8'));}catch(e){if(e.code==='ENOENT')return [];throw Error('세션 거부 규칙을 읽을 수 없습니다.');}
 if(data?.schema!=='aleph.xdr.deny-rules.v1'||data.mode!==mode||!Array.isArray(data.rules))throw Error('세션 거부 규칙 형식이 아닙니다.');
 return data.rules.filter(rule=>valid(rule,now));
}
export function checkSession(verifiedSession,rules,now=Date.now()){
 const key=binding(verifiedSession);if(!key)return {blocked:false};
 const rule=rules.find(rule=>valid(rule,now)&&rule.subjectKey===key.subjectKey&&rule.sessionKey===key.sessionKey);
 return rule?{blocked:true,ruleId:RULE_ID,expiresAt:rule.expiresAt,alertIds:[...rule.alertIds]}:{blocked:false};
}
// One serial writer per root. Live resolution must come from an authenticated event/session mapping.
export async function respond(alerts,{root=ROOT,mode='live',now=Date.now(),resolveSessionForAlert}={}){
 modeCheck(mode);if(!Array.isArray(alerts)||!Number.isFinite(now))throw Error('경보 배열과 확인 시각이 필요합니다.');
 const path=pathFor(root,mode);await mkdir(join(root,'xdr','privilege'),{recursive:true});
 const rules=await loadRules({root,mode,now}),outcomes=[];
 for(const alert of alerts){
  const decision=decide(alert),alertId=typeof alert?.id==='string'&&SAFE.test(alert.id)?alert.id:null;
  const eventAt=Date.parse(alert?.timestamp),fresh=Number.isFinite(eventAt)&&eventAt<=now+5000&&eventAt+TTL>now;
  let installed=false;
  if(decision.action==='block'&&alertId&&fresh&&typeof resolveSessionForAlert==='function'){
   const key=binding(await resolveSessionForAlert(alert));
   if(key){
    const createdAt=new Date(Math.min(eventAt,now)).toISOString(),expiresAt=new Date(Math.min(eventAt,now)+TTL).toISOString();
    let rule=rules.find(rule=>rule.subjectKey===key.subjectKey&&rule.sessionKey===key.sessionKey);
    if(!rule){rule={ruleId:RULE_ID,action:'deny',...key,createdAt,expiresAt,alertIds:[alertId]};rules.push(rule);}
    else{if(Date.parse(expiresAt)>Date.parse(rule.expiresAt)){rule.createdAt=createdAt;rule.expiresAt=expiresAt;}if(!rule.alertIds.includes(alertId))rule.alertIds.push(alertId);}
    installed=true;
   }
  }
  if(decision.action!=='record')await appendFile(join(root,'xdr','alerts.log'),JSON.stringify({moduleKey:'privilege',at:new Date(now).toISOString(),mode,alertId,...decision,installed,
   status:installed?'session_deny_installed':decision.action==='block'?'unresolved_or_stale_session':'notification_only'})+'\n',{mode:0o600});
  outcomes.push({alertId,...decision,installed});
 }
 const temporary=path+'.'+randomUUID()+'.tmp';
 await writeFile(temporary,JSON.stringify({schema:'aleph.xdr.deny-rules.v1',mode,rules:rules.filter(rule=>valid(rule,now))},null,2)+'\n',{mode:0o600});await rename(temporary,path);
 return outcomes;
}
export function withPrivilege(baseDecide,{sessionForRequest,denyResponse,root=ROOT,mode='live',clock=Date.now}={}){
 modeCheck(mode);if(typeof baseDecide!=='function'||typeof sessionForRequest!=='function'||typeof denyResponse!=='function')throw Error('기존 판정기와 검증된 세션 조회·거부 응답이 필요합니다.');
 return async request=>{
  const base=await baseDecide(request);if(!['allow','step_up'].includes(base?.decision))return base;
  const now=clock(),session=await sessionForRequest(request);
  if(!binding(session))throw Error('검증된 세션 식별 정보가 없습니다.');
  const matched=checkSession(session,await loadRules({root,mode,now}),now);if(!matched.blocked)return base;
  const denial=await denyResponse(request,matched);
  if(!denial||Object.keys(denial).sort().join(',')!=='decision,reasonCode,requestId,ruleIds,schema'||denial.schema!=='aleph.decision.v1'
   ||denial.requestId!==request.requestId||denial.decision!=='deny'||typeof denial.reasonCode!=='string'||!/^[a-z][a-z0-9_]{0,63}$/.test(denial.reasonCode)
   ||!Array.isArray(denial.ruleIds)||!denial.ruleIds.includes(RULE_ID))throw Error('추가 세션 거부 응답 형식이 아닙니다.');
  return denial;
 };
}
export function createZtnaDecider(options){return withPrivilege(existingDecide,options);}
if(typeof process!=='undefined'&&process?.argv?.[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(!process.argv.includes('--replay'))throw Error('시험 경보는 --replay로만 실행하세요.');
  const fixture=JSON.parse(await readFile(new URL('../fixtures/privilege.json',import.meta.url),'utf8'));
  // Replay-only fabricated bindings. These are never live engine subjects or sessions.
  const resolveSessionForAlert=a=>({subjectId:a.data.srcuser,sessionRef:'fixture-'+createHash('sha256').update(JSON.stringify([a.data.srcuser,a.data.srcip])).digest('hex')});
  let installed=0;for(const a of [...fixture.alerts].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp))){const [out]=await respond([a],{mode:'replay',now:Date.parse(a.timestamp),resolveSessionForAlert});installed+=Number(out.installed);}
  console.log(JSON.stringify({mode:'replay',blockCandidatesApplied:installed,liveRulesChanged:false}));
 }catch(e){console.error(e.message);process.exitCode=1;}
}
