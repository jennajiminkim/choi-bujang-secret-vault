import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with {type:'json'};
import { createRecoveryHandler } from '../src/note-recovery-api.mjs';
let handler;
export default async function restore(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!req.headers.authorization)return res.status(401).json({error:'로그인이 필요합니다.'});
 try{
  if(!handler){
   const url=process.env.SUPABASE_URL, secret=process.env.SUPABASE_SECRET_KEY;
   if(!url||!secret||new URL(url).origin!==new URL(config.identityProvider.issuer).origin)
    return res.status(503).json({error:'서버 설정을 확인하세요.'});
   const supabase=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
   handler=createRecoveryHandler({config,supabase,mode:'restore'});
  }
  return await handler(req,res);
 }catch{return res.status(503).json({error:'복구 서버에 연결할 수 없습니다.'});}
}
