import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide, RULE_IDS } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';

test('등록값이 정확한 true일 때만 읽기 허용; 누락·거짓·문자열·숫자는 거부', async () => {
  const { normal } = fixtureRequests();
  assert.ok(RULE_IDS.includes('device_registered'));
  const allowed = await decide(normal);
  assert.equal(allowed.decision, 'allow');
  assert.equal(allowed.reasonCode, 'approved');
  assert.deepEqual(Object.keys(allowed).sort(), ['decision','reasonCode','requestId','ruleIds','schema']);
  for (const status of [false, undefined, null, 'true', 'false', 1, 0]) {
    const out = await decide({ ...normal, deviceRegistered: status });
    assert.equal(out.decision, 'deny');
    assert.equal(out.reasonCode, 'device_not_registered');
    assert.deepEqual(out.ruleIds, ['device_registered']);
    assert.equal(out.requestId, normal.requestId);
  }
  const missing = { ...normal }; delete missing.deviceRegistered;
  assert.equal((await decide(missing)).reasonCode, 'device_not_registered');
});

test('자료 서비스의 GET 경로만 허용하고 쓰기·다른 서비스·경로 불일치는 기존 거부', async () => {
  const { normal } = fixtureRequests();
  for (const base of ['/notes','/api/notes']) {
    for (const request of [{ ...normal, path: base, route: `GET ${base}` },
      { ...normal, path: `${base}/demo`, route: `GET ${base}/:id` }]) {
      assert.equal((await decide(request)).decision, 'allow');
    }
  }
  for (const change of [{method:'POST'},{method:'PUT'},{method:'DELETE'},{service:'other'},
    {path:'/admin'},{route:'GET /admin'},{path:'/notes/../admin'}, {path:'/notes/..'}]) {
    const result = await decide({ ...normal, ...change });
    assert.equal(result.decision, 'deny');
    assert.equal(result.reasonCode, 'starter_not_ready');
    assert.deepEqual(result.ruleIds, ['starter.deny']);
  }
});

test('공개 배포 식별 정보는 5단계를 보존하며 6단계도 올바르게 기록한다', () => {
  const env = { VERCEL_GIT_PROVIDER:'github', VERCEL_GIT_REPO_OWNER:'jennajiminkim',
    VERCEL_GIT_REPO_SLUG:'choi-bujang-secret-vault', VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),
    VERCEL_URL:'fixture.vercel.app' };
  const config = { step:6, judgeIssuer:'https://aleph-judge-production.up.railway.app/defense/judge',
    sampleMarker:'SAMPLE_NOTE_1', allowedRoutes:[{method:'GET',path:'/api/notes'}], originalApiUrl:'https://example.invalid/rest/v1/notes' };
  assert.equal(deploymentIdentity(env,config).step,6);
  assert.equal(deploymentIdentity(env,{...config,step:5}).step,5);
  assert.throws(()=>deploymentIdentity({...env,VERCEL_GIT_COMMIT_SHA:undefined},config));
});
