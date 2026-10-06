import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';
import { runAttackChecks } from '../src/attack-check.mjs';

const config = {
  step: 5,
  identityProvider: { issuer: 'https://eqkxsftptrmgacddkswd.supabase.co/auth/v1' },
  judgeIssuer: 'https://aleph-judge-production.up.railway.app/defense/judge',
  sampleMarker: 'SAMPLE_NOTE_1',
  publicAppUrl: 'https://student-defense.vercel.app',
  allowedRoutes: [{ method: 'GET', path: '/api/notes' }],
  originalApiUrl: 'https://eqkxsftptrmgacddkswd.supabase.co/rest/v1/notes',
};
const env = {
  VERCEL_GIT_PROVIDER: 'github',
  VERCEL_GIT_REPO_OWNER: 'Student-A',
  VERCEL_GIT_REPO_SLUG: 'aleph-defense',
  VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40),
  VERCEL_URL: 'student-defense-123.vercel.app',
};

test('build identity uses Vercel Git and deployment metadata', () => {
  assert.deepEqual(deploymentIdentity(env, config), {
    schema: 'aleph.defense.deployment.v1',
    step: 5,
    repoUrl: 'https://github.com/student-a/aleph-defense',
    commit: 'a'.repeat(40),
    publicAppUrl: 'https://student-defense-123.vercel.app',
    judgeIssuer: config.judgeIssuer,
    sampleMarker: config.sampleMarker,
    allowedRoutes: config.allowedRoutes,
    originalApiUrl: config.originalApiUrl,
  });
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_PROVIDER: undefined }, config));
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_COMMIT_SHA: 'short' }, config));
});

test('stage 5 checks distinguish JSON denial from HTML and never record note bodies', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), init });
      const path = new URL(url).pathname;
      if (path === '/auth-config.json') return Response.json({ publishableKey: 'sb_publishable_fixture' });
      if (path === '/rest/v1/notes') return Response.json({ code: '42501', message: 'permission denied' }, { status: 401 });
      if (path === '/data.json') return Response.json({ notes: [] });
      if (path === '/aleph.json') return Response.json({ schema: 'aleph.defense.deployment.v1', step: 5, allowedRoutes: config.allowedRoutes });
      if (path === '/') return new Response('<html></html>', { headers: { 'x-content-type-options': 'nosniff' } });
      return Response.json({ error: 'login required' }, { status: 401 });
    };
    const results = await runAttackChecks(config);
    assert.equal(requests[0].url, 'https://student-defense.vercel.app/api/notes');
    assert.equal(requests[0].init.headers, undefined);
    assert.ok(requests.every(request => request.init.redirect === 'error'));
    assert.match(results[0].observed, /HTTP 401.*JSON 오류 있음.*기대 결과 일치/u);
    assert.match(results.find(x => x.attackId === 'static_notes_removed').observed, /메모 0건/u);
    assert.match(results.find(x => x.attackId === 'deployment_identity').observed, /단계 5/u);
    assert.match(results.find(x => x.attackId === 'live_student_crud').observed, /미실행/u);
    assert.match(results.find(x => x.attackId === 'deployment_routes').observed, /기대 결과 일치/u);
    assert.match(results.find(x => x.attackId === 'browser_public_key').observed, /추가점수 조건 미충족/u);
    assert.match(results.find(x => x.attackId === 'direct_anon_data_api').observed, /HTTP 401.*기대 결과 일치/u);
    const direct = requests.find(request => new URL(request.url).pathname === '/rest/v1/notes');
    assert.deepEqual(Object.keys(direct.init.headers), ['apikey']);
    globalThis.fetch = async () => new Response('<html>not an API error</html>', { status: 401 });
    const [failed] = await runAttackChecks(config);
    assert.match(failed.observed, /JSON 오류 없음.*기대 결과 불일치/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
