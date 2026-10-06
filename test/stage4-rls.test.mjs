import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Local PostgreSQL only: simplified Supabase auth schema, disposable rows and identities.
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const B_NOTE = '4a4e7c1c-73b8-4d10-94dd-93455b7ac640';
let db, ownershipSql, rlsSql;
const sqlFile = name => readFile(new URL(`../supabase/${name}`, import.meta.url), 'utf8');
async function asUser(role, id, callback) {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [id ?? '']);
    return await callback();
  } finally { await db.exec('rollback'); }
}
before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    create table public.unrelated (id integer);
    grant select on public.unrelated to anon;
    alter table public.unrelated enable row level security;
    create policy unrelated_keep on public.unrelated for select to anon using (true);
  `);
  await db.query('insert into auth.users values ($1, $2), ($3, $4)', [A, 'a-fixture', B, 'b-fixture']);
  await db.exec(await sqlFile('step2_notes.sql'));
  await db.exec(await sqlFile('step3_notes.sql'));
  // Include a permissive old policy and independent column grants to test removal.
  await db.exec(`grant select on public.notes to PUBLIC;
    grant select (title) on public.notes to anon;
    create policy unsafe_old_policy on public.notes for all to authenticated using (true) with check (true);`);
  ownershipSql = (await sqlFile('step4_1_owners.sql')).replaceAll('A_EMAIL_HERE', 'a-fixture').replaceAll('B_EMAIL_HERE', 'b-fixture');
  // Replace only declarations; keep the guards for unfilled placeholders intact.
  ownershipSql = ownershipSql.replace("if a_email = 'a-fixture' or b_email = 'b-fixture'", "if a_email = 'A_EMAIL_HERE' or b_email = 'B_EMAIL_HERE'");
  rlsSql = await sqlFile('step4_3_rls.sql');
  await db.exec(ownershipSql);
});
after(async () => { await db?.close(); });

test('owner SQL preserves original notes, assigns exactly three seeds and creates B test once', async () => {
  const rows = (await db.query('select id, title, owner_id from public.notes')).rows;
  assert.equal(rows.length, 5);
  assert.equal(rows.filter(row => row.owner_id === A).length, 3);
  assert.equal(rows.filter(row => row.owner_id === B).length, 1);
  assert.equal(rows.filter(row => row.owner_id === null).length, 1);
  const initialIds = rows.map(row => row.id).sort();
  await db.exec(ownershipSql);
  assert.deepEqual((await db.query('select id from public.notes')).rows.map(row => row.id).sort(), initialIds);
});
test('GRANT audit shows before/after, anon has no rights, authenticated has only CRUD', async () => {
  const beforeAudit = (await db.query(await sqlFile('step4_2_audit.sql'))).rows;
  const publicInherited = beforeAudit.find(row => row.role_name === 'anon' && row.privilege === 'SELECT');
  assert.equal(publicInherited.explicit_grant, false); assert.equal(publicInherited.effective_grant, true);
  const results = await db.exec(rlsSql);
  const beforeRows = results.flatMap(r => r.rows ?? []).filter(row => row.phase === 'before' && 'allowed' in row);
  const afterRows = results.flatMap(r => r.rows ?? []).filter(row => row.phase === 'after' && 'allowed' in row);
  assert.equal(beforeRows.length, 14); assert.equal(afterRows.length, 14);
  assert.ok(beforeRows.some(row => row.role_name === 'anon' && row.privilege === 'SELECT' && row.allowed));
  for (const row of afterRows) assert.equal(row.allowed,
    row.role_name === 'authenticated' && ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(row.privilege));
  const explicit = (await db.query("select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='notes' and grantee in ('anon', 'authenticated')")).rows;
  assert.deepEqual(explicit.map(r => `${r.grantee}:${r.privilege_type}`).sort(),
    ['DELETE', 'INSERT', 'SELECT', 'UPDATE'].map(p => `authenticated:${p}`).sort());
  const afterAudit = (await db.query(await sqlFile('step4_2_audit.sql'))).rows;
  assert.equal(afterAudit.length, 14);
  for (const row of afterAudit) {
    const expected = row.role_name === 'authenticated' && ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(row.privilege);
    assert.equal(row.explicit_grant, expected); assert.equal(row.effective_grant, expected);
  }
  const columnRights = await db.query("select has_column_privilege('anon', 'public.notes', 'title', 'SELECT') as allowed");
  assert.equal(columnRights.rows[0].allowed, false);
  const policies = (await db.query("select policyname from pg_policies where schemaname='public' and tablename='notes'")).rows;
  assert.deepEqual(policies.map(p => p.policyname).sort(), ['notes_delete_own', 'notes_insert_own', 'notes_select_own', 'notes_update_own']);
  await db.exec(rlsSql);
});
test('anon is denied for all four SQL operations', async () => {
  for (const sql of ['select * from public.notes', "insert into public.notes (title,content) values ('fixture','fixture')",
    "update public.notes set title='blocked'", 'delete from public.notes']) {
    await assert.rejects(asUser('anon', null, () => db.query(sql)), error => error.code === '42501');
  }
});
test('authenticated A/B each retain SQL CRUD for their own rows', async () => {
  for (const user of [A, B]) await asUser('authenticated', user, async () => {
    const visible = (await db.query('select owner_id from public.notes')).rows;
    assert.ok(visible.length > 0); assert.ok(visible.every(row => row.owner_id === user));
    const created = await db.query("insert into public.notes (owner_id,title,content) values ($1,'fixture','fixture') returning id", [user]);
    const id = created.rows[0].id;
    assert.equal((await db.query('select id from public.notes where id=$1', [id])).rows.length, 1);
    assert.equal((await db.query("update public.notes set title='edited' where id=$1 returning id", [id])).rows.length, 1);
    assert.equal((await db.query('delete from public.notes where id=$1 returning id', [id])).rows.length, 1);
    assert.equal((await db.query('select id from public.notes where id=$1', [id])).rows.length, 0);
  });
});
test('authenticated A/B cannot read, update or delete the other owner and cannot spoof INSERT owner', async () => {
  const aNote = (await db.query('select id from public.notes where owner_id=$1 limit 1', [A])).rows[0].id;
  for (const [user, other, target] of [[A, B, B_NOTE], [B, A, aNote]]) {
    await asUser('authenticated', user, async () => {
      assert.equal((await db.query('select id from public.notes where id=$1', [target])).rows.length, 0);
      assert.equal((await db.query("update public.notes set title='blocked' where id=$1 returning id", [target])).rows.length, 0);
      assert.equal((await db.query('delete from public.notes where id=$1 returning id', [target])).rows.length, 0);
    });
    await assert.rejects(asUser('authenticated', user, () => db.query(
      "insert into public.notes (owner_id,title,content) values ($1,'fixture','fixture')", [other])), e => e.code === '42501');
  }
});
test('UPDATE WITH CHECK refuses ownership transfer while USING hides existing foreign rows', async () => {
  const aNote = (await db.query('select id from public.notes where owner_id=$1 limit 1', [A])).rows[0].id;
  await assert.rejects(asUser('authenticated', A, () => db.query('update public.notes set owner_id=$1 where id=$2', [B, aNote])), e => e.code === '42501');
  assert.equal((await db.query('select owner_id from public.notes where id=$1', [aNote])).rows[0].owner_id, A);
});
test('other table privileges and policies are preserved', async () => {
  assert.equal((await db.query("select has_table_privilege('anon','public.unrelated','SELECT') as allowed")).rows[0].allowed, true);
  assert.equal((await db.query("select policyname from pg_policies where tablename='unrelated'")).rows[0].policyname, 'unrelated_keep');
});
