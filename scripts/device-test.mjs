import {randomBytes,createHash} from 'node:crypto';
import {createDeviceGate} from '../src/device-approval.mjs';
export async function runDeviceGateChecks(){
 const grant=randomBytes(32).toString('base64url');
 let approved=false;
 const owner='11111111-1111-4111-8111-111111111111';
 const supabase={from(table){const filters=[];
  const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},async maybeSingle(){
   const row=table==='vault_app_grants'?{grant_hash:createHash('sha256').update(grant).digest('hex'),owner_id:owner,
    credential_id:'fixture',expires_at:new Date(Date.now()+60000).toISOString()}:
    {credential_id:'fixture',owner_id:owner,approved};
   return {data:filters.every(([k,v])=>row[k]===v)?row:null,error:null};
  }};return q;
 }};
 const gate=createDeviceGate({supabase});
 async function check(proof,expected){const res={status(){return this;},json(){return this;}};
  return await gate({req:{headers:{'x-vault-device-grant':proof}},user:{kind:'student',userId:owner},res})===expected;}
 const outcomes=[await check(undefined,false),await check(grant,false)];
 approved=true;outcomes.push(await check(grant,true),await check('a'.repeat(43),false));
 approved=false;outcomes.push(await check(grant,false));
 return {passed:outcomes.filter(Boolean).length,total:outcomes.length};
}
