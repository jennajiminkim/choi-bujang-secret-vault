import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
import config from '../aleph.config.json' with { type: 'json' };
import { createNotesHandler } from '../src/notes-api.mjs';
import notesApi from '../api/notes.js';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';

// Ephemeral keys and identities exist only in this test process.
const { privateKey, publicKey } = await generateKeyPair('ES256');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const run = '33333333-3333-4333-8333-333333333333';
async function token(user, extra = {}) {
  return new SignJWT({ aleph_role: 'judge', aleph_identity: user === A ? 'a' : 'b', aleph_run: run, ...extra })
    .setProtectedHeader({ alg: 'ES256' }).setSubject(user)
    .setIssuer(config.judgeIssuer).setAudience(new URL(config.publicAppUrl).hostname)
    .setIssuedAt().setExpirationTime('5m').sign(privateKey);
}
function database() {
  const rows = new Map(); let calls = 0;
  const client = { auth: { getClaims: async () => ({ data: null, error: new Error('reject') }) },
    from() {
      calls++;
      let action = 'read', payload; const filters = [];
      const q = {
        select() { return q; }, eq(key, value) { filters.push([key, value]); return q; },
        insert(value) { action = 'insert'; payload = value; return q; },
        update(value) { action = 'update'; payload = value; return q; },
        delete() { action = 'delete'; return q; },
        order() { return Promise.resolve(result(false)); },
        single() { return Promise.resolve(result(true)); },
        maybeSingle() { return Promise.resolve(result(true)); },
      };
      function result(single) {
        if (action === 'insert') {
          if (rows.has(payload.id)) return { data: null, error: { code: '23505' } };
          rows.set(payload.id, { ...payload }); return { data: { ...payload }, error: null };
        }
        let found = [...rows.values()].filter(row => filters.every(([key, value]) => row[key] === value));
        if (action === 'update') found.forEach(row => Object.assign(row, payload));
        if (action === 'delete') found.forEach(row => rows.delete(row.id));
        return { data: single ? found[0] ?? null : found, error: null };
      }
      return q;
    },
  };
  return { client, rows, calls: () => calls };
}
function response() {
  return { headers: {}, setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
const authA = await token(A); const authB = await token(B);
function setup() {
  const db = database(); const handler = createNotesHandler({ config, supabase: db.client, judgeKeySet: async () => publicKey });
  const request = async (method, id, body, auth = authA) => {
    const res = response();
    await handler({ method, query: id === undefined ? {} : { id }, body, headers: auth ? { authorization: `Bearer ${auth}` } : {} }, res);
    return res;
  };
  return { db, request };
}
test('anonymous and invalid credentials reject every CRUD method before a DB read', async () => {
  const { db, request } = setup();
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    for (const auth of [null, 'invalid', await token(A, { aleph_role: 'student' })]) {
      const res = await request(method, method === 'PUT' || method === 'DELETE' ? run : undefined, { userId: A, role: 'admin' }, auth);
      assert.equal(res.code, 401); assert.equal(typeof res.body.error, 'string');
      assert.equal(res.headers['Cache-Control'], 'no-store');
    }
  }
  assert.equal(db.calls(), 0);
});
test('production entry point returns anonymous JSON 401 without server secrets', async () => {
  const res = response(); await notesApi({ method: 'GET', headers: {} }, res);
  assert.equal(res.code, 401); assert.equal(typeof res.body.error, 'string');
});
test('A creates, reads, updates, deletes UUID notes; deleted GET returns 404', async () => {
  const { db, request } = setup();
  const created = await request('POST', undefined, { title: 'fixture', body: 'fixture', owner_id: B, userId: B, role: 'admin' });
  assert.equal(created.code, 201); const { id } = created.body;
  assert.match(id, /^[a-f0-9-]{36}$/); assert.equal(db.rows.get(id).owner_id, A);
  assert.deepEqual((await request('GET', id)).body, { id, title: 'fixture', body: 'fixture' });
  assert.equal((await request('GET')).body.length, 1);
  assert.equal((await request('PUT', id, { title: 'edited', body: 'edited' })).code, 200);
  assert.equal(db.rows.get(id).owner_id, A);
  assert.equal((await request('DELETE', id)).code, 200);
  assert.equal((await request('GET', id)).code, 404);
});
test('supplied UUID, duplicate IDs, invalid IDs and payloads follow API contract', async () => {
  const { request } = setup(); const body = { id: run, title: 'fixture', body: 'fixture' };
  assert.deepEqual((await request('POST', undefined, body)).body, { id: run });
  assert.equal((await request('POST', undefined, body)).code, 409);
  assert.equal((await request('POST', undefined, { ...body, id: '123' })).code, 400);
  assert.equal((await request('GET', '123')).code, 400);
  assert.equal((await request('PUT', run, { title: '', body: 'fixture' })).code, 400);
  assert.equal((await request('POST', undefined, '{')).code, 400);
});
test('A and B keep their own CRUD while every cross-owner operation is denied', async () => {
  const { request, db } = setup();
  const a = (await request('POST', undefined, { title: 'A fixture', body: 'fixture' })).body.id;
  const b = (await request('POST', undefined, { title: 'B fixture', body: 'fixture' }, authB)).body.id;
  for (const [ownId, otherId, auth] of [[a, b, authA], [b, a, authB]]) {
    const list = await request('GET', undefined, undefined, auth);
    assert.deepEqual(list.body.map(note => note.id), [ownId]);
    assert.equal((await request('GET', ownId, undefined, auth)).code, 200);
    assert.equal((await request('GET', otherId, undefined, auth)).code, 404);
    assert.equal((await request('PUT', otherId, { title: 'blocked', body: 'blocked' }, auth)).code, 404);
    assert.equal((await request('DELETE', otherId, undefined, auth)).code, 404);
    assert.equal((await request('PUT', ownId, { title: 'edited', body: 'edited' }, auth)).code, 200);
  }
  assert.equal(db.rows.get(a).owner_id, A); assert.equal(db.rows.get(b).owner_id, B);
  for (const [id, auth] of [[a, authA], [b, authB]]) {
    assert.equal((await request('DELETE', id, undefined, auth)).code, 200);
    assert.equal((await request('GET', id, undefined, auth)).code, 404);
  }
});
test('owner changes are rejected and rejected updates leave original data intact', async () => {
  const { request, db } = setup();
  const id = (await request('POST', undefined, { title: 'fixture', body: 'fixture', owner_id: B, userId: B, role: 'admin' })).body.id;
  assert.equal(db.rows.get(id).owner_id, A);
  assert.equal((await request('PUT', id, { title: 'blocked', body: 'blocked', owner_id: B })).code, 403);
  assert.equal((await request('PUT', id, { title: 'blocked', body: 'blocked', owner_id: A })).code, 403);
  assert.equal((await request('PUT', id, { title: 'blocked', body: 'blocked', userId: B, role: 'admin' })).code, 400);
  assert.equal(db.rows.get(id).title, 'fixture'); assert.equal(db.rows.get(id).owner_id, A);
});
test('URL owner spoofing cannot grant cross-owner read, update or delete', async () => {
  const db = database();
  const handler = createNotesHandler({ config, supabase: db.client, judgeKeySet: async () => publicKey });
  db.rows.set(run, { id: run, owner_id: A, title: 'fixture', content: 'fixture' });
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const res = response();
    await handler({ method, headers: { authorization: `Bearer ${authB}` }, query: { id: run, owner_id: A, userId: A, role: 'admin' }, body: { title: 'blocked', body: 'blocked' } }, res);
    assert.equal(res.code, 404); assert.deepEqual(Object.keys(res.body), ['error']);
  }
  assert.equal(db.rows.get(run).owner_id, A); assert.equal(db.rows.get(run).title, 'fixture');
});
test('unassigned rows are denied and a reused ID cannot overwrite another owner', async () => {
  const { db, request } = setup();
  db.rows.set(run, { id: run, owner_id: null, title: 'fixture', content: 'fixture' });
  for (const auth of [authA, authB]) {
    assert.deepEqual((await request('GET', undefined, undefined, auth)).body, []);
    assert.equal((await request('GET', run, undefined, auth)).code, 404);
    assert.equal((await request('PUT', run, { title: 'blocked', body: 'blocked' }, auth)).code, 404);
    assert.equal((await request('DELETE', run, undefined, auth)).code, 404);
  }
  db.rows.get(run).owner_id = A;
  assert.equal((await request('POST', undefined, { id: run, title: 'blocked', body: 'blocked' }, authB)).code, 409);
  assert.equal(db.rows.get(run).owner_id, A); assert.equal(db.rows.get(run).title, 'fixture');
});
test('expired, foreign issuer and wrong audience signed tokens are rejected', async () => {
  const { request, db } = setup();
  for (const params of [ { issuer: 'https://other.supabase.co/auth/v1' }, { audience: 'other.vercel.app' }, { expires: '0s' } ]) {
    const value = await new SignJWT({ aleph_role: 'judge', aleph_identity: 'a', aleph_run: run })
      .setProtectedHeader({ alg: 'ES256' }).setSubject(A).setIssuer(params.issuer || config.judgeIssuer)
      .setAudience(params.audience || new URL(config.publicAppUrl).hostname).setIssuedAt()
      .setExpirationTime(params.expires || '5m').sign(privateKey);
    assert.equal((await request('GET', undefined, undefined, value)).code, 401);
  }
  assert.equal(db.calls(), 0);
});
test('deployment identity remains schema v1 and records stage 5', () => {
  const result = deploymentIdentity({ VERCEL_GIT_PROVIDER: 'github', VERCEL_GIT_REPO_OWNER: 'jennajiminkim',
    VERCEL_GIT_REPO_SLUG: 'choi-bujang-secret-vault', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40),
    VERCEL_URL: 'choi-bujang-secret-vault-tawny.vercel.app' }, config);
  assert.equal(result.step, 5); assert.equal(result.schema, 'aleph.defense.deployment.v1');
});

test('normal Supabase student claims go through the unchanged verification helper', async () => {
  const db = database(); let claimCalls = 0;
  db.client.auth.getClaims = async value => {
    claimCalls++;
    try {
      const { payload } = await jwtVerify(value, publicKey, {
        issuer: config.identityProvider.issuer, audience: 'authenticated', algorithms: ['ES256'],
      });
      return { data: { claims: payload }, error: null };
    } catch { return { data: null, error: new Error('reject') }; }
  };
  const handler = createNotesHandler({ config, supabase: db.client, judgeKeySet: async () => publicKey });
  const studentToken = await new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'ES256' })
    .setIssuer(config.identityProvider.issuer).setSubject(A).setAudience('authenticated')
    .setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const res = response();
  await handler({ method: 'POST', query: {}, headers: { authorization: `Bearer ${studentToken}` },
    body: { title: 'fixture', body: 'fixture' } }, res);
  assert.equal(res.code, 201); assert.equal(claimCalls, 1); assert.equal(db.rows.get(res.body.id).owner_id, A);
  const tampered = studentToken.slice(0, -8) + 'aaaaaaaa';
  const rejected = response();
  await handler({ method: 'GET', query: {}, headers: { authorization: `Bearer ${tampered}` } }, rejected);
  assert.equal(rejected.code, 401);
});
