import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createRecoveryHandler} from '../src/note-recovery-api.mjs';
import backupEntry from '../api/note-backups.js';
import restoreEntry from '../api/note-restores.js';
import config from '../aleph.config.json' with {type:'json'};
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const N='33333333-3333-4333-8333-333333333333',O='44444444-4444-4444-8444-444444444444';
const response=()=>({setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
test('anonymous recovery rejected before database access',async()=>{
 for(const entry of [backupEntry,restoreEntry]){const out=response();await entry({headers:{},method:'POST'},out);assert.equal(out.code,401);}
 const supabase={auth:{getClaims:async()=>({error:true})},rpc(){throw Error('unexpected_db_access');}};
 const handler=createRecoveryHandler({config,supabase,mode:'restore'});
 const out=response();await handler({headers:{},method:'POST',body:{}},out);assert.equal(out.code,401);
});
test('real SQL: one B snapshot, preview, verified restore, ownership and append-only audit',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table notes(id uuid primary key,owner_id uuid,title text not null,content text not null,created_at timestamptz not null default now());`);
 await db.exec(await readFile(new URL('../supabase/step10_note_backups.sql',import.meta.url),'utf8'));
 await db.query('insert into notes(id,owner_id,title,content)values($1,$2,$3,$4),($5,$6,$7,$8)',[N,B,'fixture','safe fixture',O,A,'other fixture','unchanged fixture']);
 await db.query('insert into vault_backup_targets values($1,$2)',[B,N]);
 const denied=await db.query('select * from vault_backup_note($1,$2)',[A,N]);assert.equal(denied.rows.length,0);
 const backup=(await db.query('select * from vault_backup_note($1,$2)',[B,N])).rows[0];assert.match(backup.content_hash,/^[a-f0-9]{64}$/);
 await assert.rejects(db.query('select * from vault_backup_note($1,$2)',[B,N]));
 await db.query("update notes set content='changed fixture' where id=$1",[N]);
 const preview=(await db.query('select * from vault_preview_note_backup($1,$2)',[B,backup.backup_id])).rows[0];
 assert.equal(preview.verified,true);assert.notEqual(preview.current_hash,preview.content_hash);
 assert.equal((await db.query('select * from vault_restore_note($1,$2,$3)',[A,backup.backup_id,backup.content_hash])).rows.length,0);
 await assert.rejects(db.query('select * from vault_restore_note($1,$2,$3)',[B,backup.backup_id,'0'.repeat(64)]));
 const restored=(await db.query('select * from vault_restore_note($1,$2,$3)',[B,backup.backup_id,backup.content_hash])).rows[0];assert.equal(restored.verified,true);
 assert.deepEqual((await db.query('select id,owner_id,content from notes where id=$1',[N])).rows[0],{id:N,owner_id:B,content:'safe fixture'});
 assert.equal((await db.query('select content from notes where id=$1',[O])).rows[0].content,'unchanged fixture');
 assert.equal((await db.query('select count(*)::int as count from vault_restore_audit')).rows[0].count,2);
 await assert.rejects(db.exec('delete from vault_note_backups'));await assert.rejects(db.exec('delete from vault_restore_audit'));
 await db.query('delete from notes where id=$1',[N]);
 assert.equal((await db.query('select * from vault_restore_note($1,$2,$3)',[B,backup.backup_id,backup.content_hash])).rows[0].verified,true);
 await db.query('update notes set owner_id=$1 where id=$2',[A,N]);
 assert.equal((await db.query('select * from vault_restore_note($1,$2,$3)',[B,backup.backup_id,backup.content_hash])).rows.length,0);
 for(const role of ['anon','authenticated','service_role']){
 const privileges=await db.query("select has_table_privilege($1,'vault_note_backups','SELECT') as readable",[role]);assert.equal(privileges.rows[0].readable,false);
 }
 }finally{await db.close();}
});

test('API binds verified identity, forbids role/owner input, never returns snapshot contents',async()=>{
 const {generateKeyPair,SignJWT}=await import('jose');
 const {privateKey,publicKey}=await generateKeyPair('ES256');
 const token=await new SignJWT({aleph_role:'judge',aleph_identity:'b',aleph_run:N})
 .setProtectedHeader({alg:'ES256'}).setSubject(B).setIssuer(config.judgeIssuer)
 .setAudience(new URL(config.publicAppUrl).hostname).setIssuedAt().setExpirationTime('5m').sign(privateKey);
 let calls=0;
 const supabase={auth:{getClaims:async()=>({error:true})},rpc:async(name,args)=>{
  calls++;assert.equal(args.p_actor_id,B);
  return {data:[{backup_id:O,note_id:N,content_hash:'a'.repeat(64),verified:true,current_hash:'b'.repeat(64),title:'not returned',content:'not returned',owner_id:B}],error:null};
 }};
 for(const mode of ['backup','restore']){
 const handler=createRecoveryHandler({config,supabase,mode,judgeKeySet:async()=>publicKey});
 const send=async(method,body,query={})=>{const out=response();await handler({method,body,query,headers:{authorization:`Bearer ${token}`}},out);return out;};
 const body=mode==='backup'?{id:N}:{backupId:O,confirmHash:'a'.repeat(64)};
 const out=await send('POST',body);assert.equal(out.code,mode==='backup'?201:200);
 assert.equal('content'in out.body,false);assert.equal('owner_id'in out.body,false);
 const count=calls;assert.equal((await send('POST',{...body,role:'admin'})).code,400);assert.equal(calls,count);
 assert.equal((await send('POST',body,{action:'restore'})).code,400);
 assert.equal((await send('DELETE',body)).code,405);
 if(mode==='backup')assert.equal((await send('GET',null,{backupId:O})).body.verified,true);
 }
});
