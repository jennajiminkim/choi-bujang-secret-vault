import {randomUUID} from 'node:crypto';
import {createLoginVerifier} from './verify-login.mjs';
import {RULE_IDS} from './decider.mjs';
import {DETECTION_RULE_IDS} from './detect.mjs';
import manifest from '../backups/policy-9/manifest.json' with {type:'json'};
import {UUID} from './resources.mjs';
import {OPERATIONS_CASES,USER_VERIFICATIONS} from './operations-cases.mjs';
const json=(res,status,error)=>res.status(status).json({error});
export function checkTotals(rows) {
 return {scope:'own_recent_50',recorded:rows.length,matched:rows.filter(r=>r.matched===true).length,
  mismatched:rows.filter(r=>r.matched===false).length,unavailable:rows.filter(r=>r.actual_status===null).length};
}
export function createOperationsHandler({config,supabase,deviceGate,judgeKeySet,fetcher=fetch,commit=process.env.VERCEL_GIT_COMMIT_SHA}) {
 const verify=createLoginVerifier({config,supabaseClient:supabase,judgeKeySet});
 const origin=new URL(config.publicAppUrl).origin;
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const user=await verify(req.headers.authorization);
  if(!user)return json(res,401,'로그인이 필요합니다.');
  if(!deviceGate)return json(res,403,'기기 확인 검사가 준비되지 않았습니다.');
  if(!await deviceGate({req,res,user}))return;
  if(req.headers.origin&&req.headers.origin!==origin)return json(res,403,'출처가 일치하지 않습니다.');
  if(Object.keys(req.query??{}).length)return json(res,400,'쿼리는 지원하지 않습니다.');
  if(!['GET','POST'].includes(req.method))return json(res,405,'지원하지 않는 요청입니다.');
  const safeRows=async(table,fields,ownerField)=>{
   try {
    const {data,error}=await supabase.from(table).select(fields).eq(ownerField,user.userId).order(table==='vault_ops_checks'?'checked_at':table==='vault_restore_audit'?'at':'created_at',{ascending:false}).limit(50);
    return error||!Array.isArray(data)?null:data;
   } catch {return null;}
  };
  if(req.method==='GET'){
   const [checks,credentials,restores]=await Promise.all([
    safeRows('vault_ops_checks','check_id,request_id,case_id,method,route,expected_statuses,actual_status,matched,checked_at,source,details','owner_id'),
    safeRows('vault_app_credentials','approved','owner_id'),
    safeRows('vault_restore_audit','operation,at','actor_id')]);
   return res.status(200).json({schema:'vault.operations.v1',
    commit:/^[a-f0-9]{40}$/.test(commit??'')?commit:null,
    policy:{source:'loaded_student_module',ruleIds:[...RULE_IDS]},
    detection:{source:'student_module',ruleIds:[...DETECTION_RULE_IDS],events:null,status:'engine_events_not_connected'},
    revocation:{engineStatus:'not_measured',scope:'own_recent_50_app_credentials',
     approved:credentials?credentials.filter(c=>c.approved===true).length:null,
     notApproved:credentials?credentials.filter(c=>c.approved!==true).length:null,
     note:'미승인과 철회를 구별할 이력이 없어 notApproved를 회수 건수로 표시하지 않습니다.'},
    recovery:{policySnapshotCommit:manifest.sourceCommit,snapshotSource:'repository_manifest',
     auditStatus:restores?'available':'unavailable',scope:'own_recent_50_audit',
     restoreCount:restores?restores.filter(r=>r.operation==='restore').length:null,
     latestRestoreAt:restores?.find(r=>r.operation==='restore')?.at??null},
    checks:{status:checks?'available':'store_unavailable',totals:checks?checkTotals(checks):null,records:checks??[]},
    cases:OPERATIONS_CASES,userReports:USER_VERIFICATIONS,
    assault:{expectedKinds:41,executedKinds:0,status:'not_run',source:'judge_results_not_received'},
    provenance:{engine:'ALEPH SDP 엔진(제공)',student:'판정·탐지·자료 API·승인 앱·복구·작전실',judgePassed:null}});
  }
  let body=req.body;
  if(typeof body==='string'){try{body=JSON.parse(body);}catch{return json(res,400,'JSON 요청이 필요합니다.');}}
  const check=OPERATIONS_CASES.find(c=>c.id===body?.caseId&&c.runnable!==false);
  const keys=check?.input?['caseId',check.input]:['caseId'];
  if(!check||!body||Array.isArray(body)||Object.keys(body).sort().join(',')!==keys.sort().join(',')
   ||(check.input&&(typeof body[check.input]!=='string'||!UUID.test(body[check.input]))))return json(res,400,'정해진 읽기 점검과 자료 ID만 지정하세요.');
  // Fail before sending a check if the durable record store is not ready.
  if(await safeRows('vault_ops_checks','check_id','owner_id')===null)return json(res,503,'점검 기록 테이블이 준비되지 않았습니다. step12_operations.sql을 적용하세요.');
  let path=check.path;
  if(check.input)path=path.replace(':id',encodeURIComponent(body[check.input]));
  const headers={};
  if(!['anonymous_read','app_page'].includes(check.id))headers.Authorization=req.headers.authorization;
  if(!['anonymous_read','app_page','unregistered_read'].includes(check.id))headers['X-Vault-Device-Grant']=req.headers['x-vault-device-grant'];
  const record={check_id:randomUUID(),owner_id:user.userId,case_id:check.id,method:check.method,route:check.path,
   expected_statuses:check.expected,actual_status:null,matched:null,request_id:null,
   checked_at:new Date().toISOString(),source:'server_http',details:{}};
  try {
   // No user-provided URL, redirect destination, status, timestamp or pass flag is trusted.
   const response=await fetcher(origin+path,{method:'GET',headers,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(10000)});
   record.actual_status=response.status;
   const requestId=response.headers.get('x-request-id');
   record.request_id=UUID.test(requestId??'')?requestId:null;
   const contentType=response.headers.get('content-type')??'';
   record.details={expectedResponseType:check.id==='app_page'?/text\/html/i.test(contentType):/application\/json/i.test(contentType)};
   record.matched=check.expected.includes(response.status)&&record.details.expectedResponseType
    &&(check.id==='app_page'||record.request_id!==null);
   if(check.id==='backup_verify'&&response.status===200){
    const metadata=await response.json();
    record.details={...record.details,verified:metadata.verified===true,currentMatches:typeof metadata.currentHash==='string'&&metadata.currentHash===metadata.contentHash};
    record.matched=record.matched&&record.details.verified;
   }else await response.body?.cancel(); // Never read, display or persist a memo response body.
  }catch {record.details={errorCode:'http_unavailable'};record.matched=record.actual_status===null?null:false;}
  record.checked_at=new Date().toISOString();
  try {
   const {error}=await supabase.from('vault_ops_checks').insert(record);
   if(error)return json(res,503,'요청은 보냈지만 기록 저장에 실패했습니다. 통과로 처리하지 않습니다.');
  }catch{return json(res,503,'점검 기록을 저장할 수 없습니다.');}
  const {owner_id,...safe}=record;
  return res.status(201).json(safe);
 };
}
