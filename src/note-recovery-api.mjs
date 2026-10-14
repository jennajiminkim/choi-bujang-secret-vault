import {randomUUID} from 'node:crypto';
import { createLoginVerifier } from './verify-login.mjs';
import { UUID } from './resources.mjs';
export function createRecoveryHandler({config,supabase,judgeKeySet,mode,deviceGate}) {
  const verify=createLoginVerifier({config,supabaseClient:supabase,judgeKeySet});
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Request-Id', randomUUID());
    const user=await verify(req.headers.authorization);
    if(!user)return res.status(401).json({error:'로그인이 필요합니다.',reasonCode:'login_required'});
    if(deviceGate && !await deviceGate({req,res,user}))return;
    const preview=mode==='backup' && req.method==='GET';
    if(req.method!=='POST' && !preview){res.setHeader('Allow',mode==='backup'?'GET, POST':'POST');return res.status(405).json({error:'지원하지 않는 요청입니다.'});}
    let body=preview?req.query:req.body;
    if(typeof body==='string'){try{body=JSON.parse(body);}catch{return res.status(400).json({error:'JSON 요청이 필요합니다.'});}}
    const keys=preview?['backupId']:mode==='backup'?['id']:['backupId','confirmHash'];
    if(!body||typeof body!=='object'||Array.isArray(body)
      ||Object.keys(body).sort().join(',')!==keys.sort().join(',')
      ||(!preview&&Object.keys(req.query??{}).length)
      ||typeof body[mode==='backup'&&!preview?'id':'backupId']!=='string'
      ||!UUID.test(body[mode==='backup'&&!preview?'id':'backupId'])
      ||(mode==='restore'&&!/^[a-f0-9]{64}$/.test(body.confirmHash??'')))
      return res.status(400).json({error:'대상 ID와 확인 해시를 확인하세요.',reasonCode:'invalid_restore_request'});
    const name=preview?'vault_preview_note_backup':mode==='backup'?'vault_backup_note':'vault_restore_note';
    const args={p_actor_id:user.userId,...(mode==='backup'&&!preview?{p_note_id:body.id}:{p_backup_id:body.backupId}),
      ...(mode==='restore'?{p_confirm_hash:body.confirmHash}:{})};
    try{
      const {data,error}=await supabase.rpc(name,args);
      if(error)return res.status(error.code==='23505'||error.code==='22023'?409:502)
        .json({error:'백업 중복 또는 검증·처리 실패입니다.',reasonCode:'backup_verification_failed'});
      if(!data?.length)return res.status(404).json({error:'승인된 본인 시험 대상이 없습니다.',reasonCode:'backup_target_not_found'});
      const row=data[0];
      if(row.verified===false)return res.status(409).json({error:'사본 검증에 실패했습니다.',reasonCode:'backup_verification_failed'});
      // Only identifiers and verification metadata, never contents or owner credentials.
      const result={backupId:row.backup_id,id:row.note_id,contentHash:row.content_hash};
      if(preview){result.currentHash=row.current_hash;result.verified=row.verified;}
      if(mode==='restore')result.verified=row.verified;
      return res.status(mode==='backup'&&!preview?201:200).json(result);
    }catch{return res.status(502).json({error:'복구 요청 처리 실패입니다.',reasonCode:'recovery_unavailable'});}
  };
}
