import {readFile,writeFile,mkdir,realpath,lstat,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,join,relative} from 'node:path';
export const SAFE_COMMIT='97324e69b84da03d79b346923abb614688e146d3';
export const SCOPE='src/notes-api.mjs';
const FILES=[SCOPE,'src/verify-login.mjs','src/resources.mjs','src/decider.mjs','src/access-signals.mjs'];
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function verifiedPolicy(repo){
 const base=join(repo,'backups/policy-9');
 const manifest=JSON.parse(await readFile(join(base,'manifest.json'),'utf8'));
 if(manifest.schema!=='vault.safe-policy.v1'||manifest.sourceCommit!==SAFE_COMMIT
 ||JSON.stringify(manifest.restoreScope)!==JSON.stringify([SCOPE])
 ||JSON.stringify(manifest.files.map(f=>f.path))!==JSON.stringify(FILES))throw Error('invalid_policy_manifest');
 const files=new Map();
 for(const entry of manifest.files){
  const bytes=await readFile(join(base,entry.path));
  const original=execFileSync('git',['show',`${SAFE_COMMIT}:${entry.path}`],{cwd:repo,maxBuffer:1048576});
  if(sha(bytes)!==entry.sha256||!bytes.equals(original))throw Error('backup_verification_failed');
  files.set(entry.path,bytes);
 }
 return {manifest,files};
}
// Only an existing, isolated rehearsal directory may ever be written.
async function target(repo,trial){
 const parent=await realpath(join(repo,'artifacts'));
 if(parent!==join(await realpath(repo),'artifacts'))throw Error('unsafe_trial_parent');
 const actual=await realpath(trial);
 const name=relative(parent,actual);
 if(!/^policy-rehearsal-[a-z0-9-]+$/.test(name))throw Error('not_a_trial_policy');
 const file=join(actual,SCOPE);
 if((await lstat(file)).isSymbolicLink()||!(await realpath(file)).startsWith(actual+'/'))throw Error('unsafe_trial_path');
 const audit=join(actual,'audit.jsonl');
 if((await lstat(audit)).isSymbolicLink()||await realpath(audit)!==audit)throw Error('unsafe_audit_path');
 return file;
}
export async function initTrial(repo,name){
 if(!/^policy-rehearsal-[a-z0-9-]+$/.test(name))throw Error('invalid_trial_name');
 const safe=await verifiedPolicy(repo);
 await mkdir(join(repo,'artifacts'),{recursive:true});
 const trial=join(repo,'artifacts',name);
 await mkdir(trial); // never overwrite an existing rehearsal
 for(const [path,bytes] of safe.files){await mkdir(resolve(trial,path,'..'),{recursive:true});await writeFile(join(trial,path),bytes,{flag:'wx'});}
 await writeFile(join(trial,'audit.jsonl'),JSON.stringify({event:'trial_initialized',sourceCommit:SAFE_COMMIT})+'\n',{flag:'wx'});
 return trial;
}
export async function planRestore(repo,trial){
 const safe=await verifiedPolicy(repo),file=await target(repo,trial);
 const before=await readFile(file),after=safe.files.get(SCOPE);
 const change={path:SCOPE,sourceCommit:SAFE_COMMIT,beforeSha256:sha(before),afterSha256:sha(after),
   changed:!before.equals(after),ownerFiltersBefore:(before.toString().match(/\.eq\('owner_id', user\.userId\)/g)||[]).length,
   ownerFiltersAfter:(after.toString().match(/\.eq\('owner_id', user\.userId\)/g)||[]).length};
 return {...change,planHash:sha(JSON.stringify(change))};
}
export async function applyRestore(repo,trial,approved){
 const plan=await planRestore(repo,trial);
 if(!approved||approved.planHash!==plan.planHash)throw Error('plan_confirmation_required_or_stale');
 const safe=await verifiedPolicy(repo),file=await target(repo,trial);
 if(plan.changed)await writeFile(file,safe.files.get(SCOPE));
 if(sha(await readFile(file))!==plan.afterSha256)throw Error('restore_verification_failed');
 await appendFile(join(trial,'audit.jsonl'),JSON.stringify({event:'policy_restored',sourceCommit:SAFE_COMMIT,
  path:SCOPE,beforeSha256:plan.beforeSha256,afterSha256:plan.afterSha256,planHash:plan.planHash,at:new Date().toISOString()})+'\n');
 return {restored:true,sourceCommit:SAFE_COMMIT,path:SCOPE};
}
