import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';
import { runAttackChecks } from '../src/attack-check.mjs';

const config = {
  step: 3,
  judgeIssuer: 'https://aleph-judge-production.up.railway.app/defense/judge',
  sampleMarker: 'SAMPLE_NOTE_1',
  publicAppUrl: 'https://student-defense.vercel.app',
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
    step: 3,
    repoUrl: 'https://github.com/student-a/aleph-defense',
    commit: 'a'.repeat(40),
    publicAppUrl: 'https://student-defense-123.vercel.app',
    judgeIssuer: config.judgeIssuer,
    sampleMarker: config.sampleMarker,
  });
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_PROVIDER: undefined }, config));
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_COMMIT_SHA: 'short' }, config));
});

test('stage 3 checks distinguish JSON denial from HTML and never record note bodies', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), init });
      const path = new URL(url).pathname;
      if (path === '/data.json') return Response.json({ notes: [] });
      if (path === '/aleph.json') return Response.json({ schema: 'aleph.defense.deployment.v1', step: 3 });
      if (path === '/') return new Response('<html></html>', { headers: { 'x-content-type-options': 'nosniff' } });
      return Response.json({ error: 'login required' }, { status: 401 });
    };
    const results = await runAttackChecks(config);
    assert.equal(requests[0].url, 'https://student-defense.vercel.app/api/notes');
    assert.equal(requests[0].init.headers, undefined);
    assert.ok(requests.every(request => request.init.redirect === 'error'));
    assert.match(results[0].observed, /HTTP 401.*JSON 오류 있음.*기대 결과 일치/u);
    assert.match(results.find(x => x.attackId === 'static_notes_removed').observed, /메모 0건/u);
    assert.match(results.find(x => x.attackId === 'deployment_identity').observed, /단계 3/u);
    assert.match(results.find(x => x.attackId === 'live_student_crud').observed, /미실행/u);
    globalThis.fetch = async () => new Response('<html>not an API error</html>', { status: 401 });
    const [failed] = await runAttackChecks(config);
    assert.match(failed.observed, /JSON 오류 없음.*기대 결과 불일치/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
