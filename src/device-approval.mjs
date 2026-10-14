import {createHash,randomBytes} from 'node:crypto';
import {webcrypto} from 'node:crypto';
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
// One browser instance owns a non-exportable, RAM-only P-256 private key.
// This is session approval, not hardware attestation or permanent device enrollment.
export function proofMessage(origin, mode, challenge, publicKey) {
 return JSON.stringify(['vault-session-v1',origin,mode,challenge,sha(Buffer.from(publicKey,'base64url'))]);
}
export async function verifySessionProof({origin,mode,challenge,publicKey,signature}) {
 try {
  if(typeof publicKey!=='string'||! /^[A-Za-z0-9_-]{122}$/.test(publicKey)
   ||typeof signature!=='string'||! /^[A-Za-z0-9_-]{86}$/.test(signature))return false;
  const key=await webcrypto.subtle.importKey('spki',Buffer.from(publicKey,'base64url'),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  return await webcrypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,Buffer.from(signature,'base64url'),Buffer.from(proofMessage(origin,mode,challenge,publicKey)));
 } catch { return false; }
}
export function createDeviceHandler({config,supabase,mode,judgeKeySet}) {
 const verify=createLoginVerifier({config,supabaseClient:supabase,judgeKeySet});
 const origin=new URL(config.publicAppUrl).origin;
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const user=await verify(req.headers.authorization);
  if(!user)return json(res,401,'로그인이 필요합니다.','login_required');
  if(req.headers.origin&&req.headers.origin!==origin)return json(res,403,'출처가 일치하지 않습니다.','invalid_origin');
  if(Object.keys(req.query??{}).length)return json(res,400,'쿼리를 지원하지 않습니다.','invalid_request');
  if(! (mode==='status'?['GET']:['GET','POST']).includes(req.method))return json(res,405,'지원하지 않는 요청입니다.','method_not_allowed');
  try {
   if(mode==='status')return res.status(200).json({deviceRegistered:false,status:'unverified'});
   const ceremony=mode==='register'?'registration':'authentication';
   if(req.method==='GET') {
    const challenge=randomBytes(32).toString('base64url');
    const {data:c,error}=await supabase.from('vault_app_challenges').insert({owner_id:user.userId,ceremony,challenge}).select('challenge_id').single();
    if(error)throw Error('setup');
    return res.status(200).json({challengeId:c.challenge_id,challenge});
   }
   let body=req.body;if(typeof body==='string'){try{body=JSON.parse(body);}catch{return json(res,400,'JSON 요청이 필요합니다.','invalid_request');}}
   if(!object(body)||Object.keys(body).sort().join(',')!=='challengeId,publicKey,signature'
    ||typeof body.challengeId!=='string'||!UUID.test(body.challengeId))return json(res,400,'요청 형식을 확인하세요.','invalid_request');
   const {data:challenge,error}=await supabase.rpc('vault_consume_device_challenge',{
    p_actor_id:user.userId,p_challenge_id:body.challengeId,p_ceremony:ceremony});
   if(error)throw Error('setup');
   if(!challenge?.length)return json(res,409,'확인 요청이 만료되었거나 이미 사용됐습니다.','challenge_expired');
   if(!await verifySessionProof({origin,mode,challenge:challenge[0].challenge,publicKey:body.publicKey,signature:body.signature}))
    return json(res,403,'현재 앱의 인증 확인에 실패했습니다.','device_verification_failed');
   const fingerprint=sha(Buffer.from(body.publicKey,'base64url'));
   const credentialId='session_'+fingerprint,deviceId=fingerprint.slice(0,16);
   if(mode==='register') {
    const {data:existing,error:qe}=await supabase.from('vault_app_credentials').select('credential_id').eq('credential_id',credentialId).eq('owner_id',user.userId).maybeSingle();
    if(qe)throw Error('setup');
    if(!existing) {
     const {error:ie}=await supabase.from('vault_app_credentials').insert({credential_id:credentialId,owner_id:user.userId,public_key:body.publicKey,counter:0,device_id:deviceId,transports:[],approved:false});
     if(ie)throw Error('setup');
    }
    return res.status(201).json({status:'pending',deviceId,deviceRegistered:false});
   }
   const {data:c,error:ce}=await supabase.from('vault_app_credentials').select('approved,public_key').eq('credential_id',credentialId).eq('owner_id',user.userId).maybeSingle();
   if(ce)throw Error('setup');
   if(!c||c.approved!==true||c.public_key!==body.publicKey)return json(res,403,'현재 앱의 승인 대기 중입니다. 운영자 승인 후 다시 확인하세요.','device_not_registered');
   const grant=randomBytes(32).toString('base64url'),expiresAt=new Date(Date.now()+5*60000).toISOString();
   const {error:ge}=await supabase.from('vault_app_grants').insert({grant_hash:sha(grant),owner_id:user.userId,credential_id:credentialId,expires_at:expiresAt});
   if(ge)throw Error('setup');
   return res.status(200).json({status:'approved',deviceId,deviceRegistered:true,grant,expiresAt});
  } catch {return json(res,503,'기기 확인 서버 설정을 확인하세요.','device_service_unavailable');}
 };
}
