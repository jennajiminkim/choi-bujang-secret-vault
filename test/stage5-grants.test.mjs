import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { generateKeyPair, SignJWT } from 'jose';
import config from '../aleph.config.json' with { type: 'json' };
import { createNotesHandler } from '../src/notes-api.mjs';

// Disposable local PostgreSQL; no production credentials or Supabase requests.
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const sqlFile = name => readFile(new URL(`../supabase/${name}`, import.meta.url), 'utf8');
let db, revokeSql, auditSql, originalRows, originalPolicies;
async function asRole(role, callback) {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    const value = await callback();
    await db.exec('commit');
    return value;
  } catch (error) { await db.exec('rollback'); throw error; }
}
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    create table public.unrelated (id integer);
    grant select on public.unrelated to anon;
    alter table public.unrelated enable row level security;
    create policy unrelated_keep on public.unrelated for select to anon using (true);`);
  await db.exec(await sqlFile('step2_notes.sql'));
  await db.exec(await sqlFile('step3_notes.sql'));
  await db.exec(await sqlFile('step4_3_rls.sql'));
  await db.query('update public.notes set owner_id=$1 where title <> $2', [A, '훈련 행정 자료']);
  await db.query('update public.notes set owner_id=$1 where title=$2', [B, '훈련 행정 자료']);
  originalRows = (await db.query('select * from public.notes order by id')).rows;
  originalPolicies = (await db.query("select * from pg_policies where schemaname='public' and tablename='notes' order by policyname")).rows;
  revokeSql = await sqlFile('step5_revoke.sql');
  auditSql = await sqlFile('step5_audit.sql');
});
after(async () => { await db?.close(); });

test('stage 5 SQL revokes table and independent column rights, preserving server rights', async () => {
  await db.exec('grant select on public.notes to PUBLIC; grant update (title) on public.notes to anon;');
  const before = (await db.query(auditSql)).rows;
  assert.ok(before.some(r => r.role_name === 'authenticated' && r.effective_grant));
  assert.ok(before.some(r => r.role_name === 'anon' && r.any_column_grant));
  const results = await db.exec(revokeSql);
  for (const phase of ['before', 'after']) assert.equal(results.flatMap(r => r.rows ?? [])
    .filter(r => r.phase === phase && 'allowed' in r).length, 21);
  const after = (await db.query(auditSql)).rows;
  for (const r of after.filter(r => r.role_name !== 'service_role')) {
    assert.equal(r.explicit_grant, false); assert.equal(r.effective_grant, false); assert.equal(r.any_column_grant, false);
  }
  for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) assert.equal(
    after.find(r => r.role_name === 'service_role' && r.privilege === p).effective_grant, true);
});

test('both anon and authenticated direct SQL CRUD fail even with an owner identity', async () => {
  for (const role of ['anon', 'authenticated']) for (const query of [
    'select id from public.notes', "insert into public.notes (title,content) values ('fixture','fixture')",
    "update public.notes set title='blocked'", 'delete from public.notes',
  ]) await assert.rejects(asRole(role, async () => {
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [A]);
    return db.query(query);
  }), e => e.code === '42501');
});

test('unchanged notes handler retains A/B own CRUD and denies cross-owner and anonymous after revoke', async () => {
  // Small PostgREST-shaped adapter executes the handler's queries as service_role in real local SQL.
  const supabase = { auth: { getClaims: async () => ({ data: null, error: new Error('judge fixture') }) },
    from(table) {
      assert.equal(table, 'notes');
      let action = 'read', fields = '*', payload; const filters = [];
      const q = {
        select(value) { fields = value; return q; },
        eq(key, value) { filters.push([key, value]); return q; },
        insert(value) { action = 'insert'; payload = value; return q; },
        update(value) { action = 'update'; payload = value; return q; },
        delete() { action = 'delete'; return q; },
        order() { return execute(false); }, single() { return execute(true); }, maybeSingle() { return execute(true); },
      };
      async function execute(single) {
        const values = [], parameter = value => { values.push(value); return `$${values.length}`; };
        const identifier = key => { assert.ok(['id','owner_id','title','content'].includes(key)); return key; };
        const columns = fields.split(',').map(identifier).join(',');
        let query;
        if (action === 'insert') {
          const keys = Object.keys(payload).map(identifier);
          query = `insert into public.notes (${keys.join(',')}) values (${keys.map(k => parameter(payload[k])).join(',')}) returning ${columns}`;
        } else {
          const assignment = action === 'update' ? Object.entries(payload).map(([k,v]) => `${identifier(k)}=${parameter(v)}`).join(',') : '';
          const where = filters.length ? ` where ${filters.map(([k,v]) => `${identifier(k)}=${parameter(v)}`).join(' and ')}` : '';
          query = action === 'read' ? `select ${columns} from public.notes${where}`
            : action === 'update' ? `update public.notes set ${assignment}${where} returning ${columns}`
            : `delete from public.notes${where} returning ${columns}`;
        }
        try {
          const { rows } = await asRole('service_role', () => db.query(query, values));
          return { data: single ? rows[0] ?? null : rows, error: null };
        } catch (error) { return { data: null, error: { code: error.code } }; }
      }
      return q;
    },
  };
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const handler = createNotesHandler({ config, supabase, judgeKeySet: async () => publicKey });
  const tokens = {};
  for (const [user, identity] of [[A, 'a'], [B, 'b']]) tokens[user] = await new SignJWT({ aleph_role: 'judge', aleph_identity: identity,
    aleph_run: '33333333-3333-4333-8333-333333333333' }).setProtectedHeader({ alg: 'ES256' }).setSubject(user)
    .setIssuer(config.judgeIssuer).setAudience(new URL(config.publicAppUrl).hostname).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  async function request(user, method, id, body) {
    const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
    await handler({ method, query: id ? { id } : {}, body, headers: user ? { authorization: `Bearer ${tokens[user]}` } : {} }, res);
    return res;
  }
  assert.equal((await request(null, 'GET')).code, 401);
  for (const [user, other] of [[A, B], [B, A]]) {
    assert.ok((await request(user, 'GET')).body.length > 0);
    const created = await request(user, 'POST', undefined, { title: 'fixture', body: 'fixture', owner_id: other });
    assert.equal(created.code, 201); const id = created.body.id;
    assert.equal((await db.query('select owner_id from public.notes where id=$1', [id])).rows[0].owner_id, user);
    assert.equal((await request(user, 'GET', id)).code, 200);
    for (const method of ['GET', 'PUT', 'DELETE']) assert.equal(
      (await request(other, method, id, { title: 'blocked', body: 'fixture' })).code, 404);
    assert.equal((await request(user, 'PUT', id, { title: 'edited', body: 'fixture', owner_id: other })).code, 403);
    assert.equal((await request(user, 'PUT', id, { title: 'edited', body: 'fixture' })).code, 200);
    assert.equal((await request(user, 'DELETE', id)).code, 200);
    assert.equal((await request(user, 'GET', id)).code, 404);
  }
});

test('revoke is repeatable and preserves rows, ownership, RLS and unrelated grants', async () => {
  await db.exec(revokeSql);
  assert.deepEqual((await db.query('select * from public.notes order by id')).rows, originalRows);
  assert.deepEqual((await db.query("select * from pg_policies where schemaname='public' and tablename='notes' order by policyname")).rows, originalPolicies);
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.notes'::regclass")).rows[0].relrowsecurity, true);
  assert.equal((await db.query("select has_table_privilege('anon','public.unrelated','SELECT') as allowed")).rows[0].allowed, true);
  assert.equal((await db.query("select policyname from pg_policies where tablename='unrelated'")).rows[0].policyname, 'unrelated_keep');
});

test('unexpected inherited rights abort the proposal without touching other role grants', async () => {
  await db.exec('create role extra_reader; grant select on public.notes to extra_reader, authenticated; grant extra_reader to authenticated;');
  await assert.rejects(db.exec(revokeSql), /직접 테이블 권한이 남아/u);
  await db.exec('rollback');
  const rows = (await db.query("select grantee from information_schema.role_table_grants where table_schema='public' and table_name='notes' and privilege_type='SELECT'")).rows;
  assert.ok(rows.some(r => r.grantee === 'authenticated'));
  assert.ok(rows.some(r => r.grantee === 'extra_reader'));
  await db.exec('revoke extra_reader from authenticated; revoke select on public.notes from authenticated;');
});
