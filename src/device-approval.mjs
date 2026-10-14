import {createHash,randomBytes} from 'node:crypto';
import * as webauthn from '@simplewebauthn/server';
import {createLoginVerifier} from './verify-login.mjs';
import {isDeviceRegistered} from './decider.mjs';
import {UUID} from './resources.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const json=(res,status,error,reasonCode)=>res.status(status).json({error,reasonCode});
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
export function createDeviceGate({supabase}){
 return async({req,res,user})=>{
  // Verified judge credentials remain the engine's separately authenticated test path.
  // Browser/student headers can never select this path; the login verifier binds the issuer.
  if(user.kind==='judge')return true;
  const grant=req.headers['x-vault-device-grant'];
  if(typeof grant!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(grant)){
   json(res,403,'기기 승인이 필요합니다.','device_not_registered');return false;
  }
  try{
   const {data:g,error:ge}=await supabase.from('vault_app_grants').select('credential_id,expires_at')
    .eq('grant_hash',sha(grant)).eq('owner_id',user.userId).maybeSingle();
   if(ge)throw Error();
   if(!g||Date.parse(g.expires_at)<=Date.now()||!Number.isFinite(Date.parse(g.expires_at)))throw Error('denied');
   const {data:c,error:ce}=await supabase.from('vault_app_credentials').select('approved')
    .eq('credential_id',g.credential_id).eq('owner_id',user.userId).maybeSingle();
   if(ce)throw Error();
   if(!isDeviceRegistered({deviceRegistered:c?.approved}))throw Error('denied');
   return true;
  }catch{
   json(res,403,'기기 승인이 없거나 확인이 만료되었습니다.','device_not_registered');return false;
  }
 };
}
export function createDeviceHandler({config,supabase,mode,judgeKeySet,engine=webauthn}){
 const verify=createLoginVerifier({config,supabaseClient:supabase,judgeKeySet});
 const origin=new URL(config.publicAppUrl).origin,rpID=new URL(origin).hostname;
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const user=await verify(req.headers.authorization);
  if(!user)return json(res,401,'로그인이 필요합니다.','login_required');
  if(req.headers.origin&&req.headers.origin!==origin)return json(res,403,'출처가 일치하지 않습니다.','invalid_origin');
  if(Object.keys(req.query??{}).length)return json(res,400,'쿼리를 지원하지 않습니다.','invalid_request');
  const allowed=mode==='status'?['GET']:['GET','POST'];
  if(!allowed.includes(req.method)){res.setHeader('Allow',allowed.join(', '));return json(res,405,'지원하지 않는 요청입니다.','method_not_allowed');}
  try{
   if(req.method==='GET'){
    const {data:rows,error}=await supabase.from('vault_app_credentials').select('credential_id,device_id,approved,transports').eq('owner_id',user.userId);
    if(error)throw Error('setup');
    if(mode==='status')return res.status(200).json({pendingCount:rows.filter(c=>c.approved!==true).length,approvedCount:rows.filter(c=>c.approved===true).length,deviceRegistered:false});
    let options;
    if(mode==='register')options=await engine.generateRegistrationOptions({
     rpName:'BYTE BACK 자료실',rpID,userName:'vault-'+sha(user.userId).slice(0,12),
     userID:new Uint8Array(createHash('sha256').update(user.userId).digest()),attestationType:'none',
     supportedAlgorithmIDs:[-7,-257],excludeCredentials:rows.map(c=>({id:c.credential_id,transports:c.transports})),
     authenticatorSelection:{residentKey:'discouraged',userVerification:'required',authenticatorAttachment:'platform'}
    });
    else{
     const approved=rows.filter(c=>c.approved===true);
     if(!approved.length)return json(res,403,'승인된 기기가 없습니다. 승인 요청 뒤 운영자 확인을 기다리세요.','device_not_registered');
     options=await engine.generateAuthenticationOptions({rpID,userVerification:'required',allowCredentials:approved.map(c=>({id:c.credential_id,transports:c.transports}))});
    }
    const {data:c,error:ce}=await supabase.from('vault_app_challenges').insert({owner_id:user.userId,ceremony:mode==='register'?'registration':'authentication',challenge:options.challenge}).select('challenge_id').single();
    if(ce)throw Error('setup');
    return res.status(200).json({challengeId:c.challenge_id,options});
   }
   let body=req.body;if(typeof body==='string'){try{body=JSON.parse(body);}catch{return json(res,400,'JSON 요청이 필요합니다.','invalid_request');}}
   if(!object(body)||Object.keys(body).sort().join(',')!=='challengeId,response'
    ||typeof body.challengeId!=='string'||!UUID.test(body.challengeId)||!object(body.response))return json(res,400,'요청 형식을 확인하세요.','invalid_request');
   const {data:challenge,error:chError}=await supabase.rpc('vault_consume_device_challenge',{
    p_actor_id:user.userId,p_challenge_id:body.challengeId,p_ceremony:mode==='register'?'registration':'authentication'});
   if(chError)throw Error('setup');
   if(!challenge?.length)return json(res,409,'확인 요청이 만료되었거나 이미 사용됐습니다.','challenge_expired');
   if(mode==='register'){
    const check=await engine.verifyRegistrationResponse({response:body.response,expectedChallenge:challenge[0].challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true,supportedAlgorithmIDs:[-7,-257]});
    const info=check.registrationInfo;
    if(!check.verified||!info||info.credentialDeviceType!=='singleDevice'||info.credentialBackedUp!==false)
     return json(res,403,'이 기기에 묶인 인증 수단이 필요합니다. 동기화된 패스키는 기기 승인에 사용하지 않습니다.','device_bound_credential_required');
    const c=info.credential,deviceId=sha(c.publicKey).slice(0,16);
    const {error}=await supabase.from('vault_app_credentials').insert({credential_id:c.id,owner_id:user.userId,
     public_key:Buffer.from(c.publicKey).toString('base64url'),counter:c.counter,device_id:deviceId,
     transports:c.transports??[],approved:false});
    if(error)return json(res,409,'이미 등록되었거나 저장할 수 없습니다.','registration_failed');
    return res.status(201).json({status:'pending',deviceId,deviceRegistered:false});
   }
   const {data:c,error:ce}=await supabase.from('vault_app_credentials').select('*').eq('credential_id',body.response.id).eq('owner_id',user.userId).maybeSingle();
   if(ce)throw Error('setup');
   if(!c||c.approved!==true)return json(res,403,'승인된 기기만 사용할 수 있습니다.','device_not_registered');
   const check=await engine.verifyAuthenticationResponse({response:body.response,expectedChallenge:challenge[0].challenge,
    expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true,
    credential:{id:c.credential_id,publicKey:new Uint8Array(Buffer.from(c.public_key,'base64url')),counter:Number(c.counter),transports:c.transports}});
   if(!check.verified||check.authenticationInfo.credentialDeviceType!=='singleDevice'||check.authenticationInfo.credentialBackedUp!==false)
    return json(res,403,'기기 확인에 실패했습니다.','device_verification_failed');
   const {data:updated,error:ue}=await supabase.from('vault_app_credentials').update({counter:check.authenticationInfo.newCounter})
    .eq('credential_id',c.credential_id).eq('owner_id',user.userId).eq('approved',true).eq('counter',c.counter).select('credential_id').maybeSingle();
   if(ue||!updated)return json(res,409,'기기 상태가 바뀌었습니다. 다시 확인하세요.','device_state_changed');
   const grant=randomBytes(32).toString('base64url'),expiresAt=new Date(Date.now()+5*60000).toISOString();
   const {error:grantError}=await supabase.from('vault_app_grants').insert({grant_hash:sha(grant),owner_id:user.userId,credential_id:c.credential_id,expires_at:expiresAt});
   if(grantError)throw Error('setup');
   return res.status(200).json({status:'approved',deviceId:c.device_id,deviceRegistered:true,grant,expiresAt});
  }catch{return json(res,503,'기기 확인 설정 또는 인증 수단을 확인하세요.','device_service_unavailable');}
 };
}
