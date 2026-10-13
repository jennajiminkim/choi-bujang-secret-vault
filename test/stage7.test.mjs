import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide, RULE_IDS, createResourceDecider } from '../src/decider.mjs';
import { inspectAccessSignals } from '../src/access-signals.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';

test('출처 없음과 잘못된 출처를 구분하고 헤더를 신뢰 신호로 승격하지 않는다', () => {
  const {normal}=fixtureRequests();
  assert.equal(inspectAccessSignals(normal).kind,'fixture');
  assert.equal(inspectAccessSignals({...normal,signals:{source:'none',region:'unknown',network:'unknown',hour:14}}).kind,'unavailable');
  for (const change of [{headers:{'x-region':'local'}},{signals:undefined},{recentEvents:undefined},
    {signals:{...normal.signals,source:'client'}},{signals:{...normal.signals,hour:'14'}},
    {signals:{...normal.signals,source:'none'}},{signals:{...normal.signals,network:undefined}}]) {
    assert.equal(inspectAccessSignals({...normal,...change}).kind,'invalid');
  }
});

test('정상은 허용, 세 신호가 겹친 경우만 추가 확인; 지역과 단일 신호만으로 차단하지 않는다',async()=>{
  const {normal,suspicious}=fixtureRequests();
  assert.ok(RULE_IDS.includes('device_registered') && RULE_IDS.includes('step_up_required'));
  assert.equal((await decide(normal)).decision,'allow');
  const out=await decide(suspicious);
  assert.equal(out.decision,'step_up');
  assert.equal(out.reasonCode,'step_up_required');
  assert.deepEqual(Object.keys(out).sort(),['decision','reasonCode','requestId','ruleIds','schema']);
  assert.equal(Object.hasOwn(out,'notes'),false);
  for (const request of [
    {...normal,signals:{...normal.signals,region:'foreign'}},
    {...suspicious,signals:{...suspicious.signals,hour:14}},
    {...suspicious,signals:{...suspicious.signals,network:'usual'}},
    {...suspicious,recentEvents:[{kind:'risk_signal',ageSeconds:60,count:19}]},
    {...suspicious,recentEvents:[{kind:'risk_signal',ageSeconds:301,count:20}]},
  ]) assert.equal((await decide(request)).decision,'allow');
  const boundary={...suspicious,recentEvents:[{kind:'risk_signal',ageSeconds:300,count:20}]};
  assert.equal((await decide(boundary)).decision,'step_up');
});

test('미등록 거부와 경로 범위는 유지하고 불명확한 입력은 추가 확인',async()=>{
  const {normal,suspicious}=fixtureRequests();
  const unregistered=await decide({...suspicious,deviceRegistered:false});
  assert.equal(unregistered.decision,'deny');
  assert.equal(unregistered.reasonCode,'device_not_registered');
  assert.equal((await decide({...suspicious,method:'POST'})).decision,'deny');
  assert.equal((await decide({...normal,headers:{'x-network':'usual'}})).decision,'step_up');
  assert.equal((await decide({...normal,signals:undefined})).decision,'step_up');
  const unavailable={...normal,path:'/notes/11111111-1111-4111-8111-111111111111',signals:{source:'none',region:'unknown',network:'unknown',hour:14}};
  const linked = createResourceDecider({authorize:async()=>true}); // Test-only trusted server grant.
  assert.deepEqual((await linked(unavailable)).ruleIds,['device_registered','resource_zones']);
  assert.equal((await decide({...suspicious,recentEvents:[{kind:'risk_signal',count:'20',ageSeconds:60}]})).decision,'step_up');
});

test('검증된 가상 재확인만 허용하고 누락·문자열·범위 밖 재확인값은 해제하지 않는다',async()=>{
  const {suspicious}=fixtureRequests();
  const fresh={...suspicious,stepUp:{verified:true,authAgeSeconds:60}};
  const out=await decide(fresh);
  assert.equal(out.decision,'allow');
  assert.equal(out.reasonCode,'approved');
  assert.ok(out.ruleIds.includes('step_up_required'));
  for (const stepUp of [undefined,{verified:'true',authAgeSeconds:60},{verified:true,authAgeSeconds:901},
    {verified:true,authAgeSeconds:-1},{verified:true,authAgeSeconds:null},{verified:false,authAgeSeconds:null}]) {
    assert.equal((await decide({...suspicious,stepUp})).decision,'step_up');
  }
  assert.equal((await decide({...fresh,deviceRegistered:false})).decision,'deny');
});

test('가상 사건의 원본을 바꾸거나 출력에 자료·원시 입력을 포함하지 않는다',async()=>{
  const {suspicious}=fixtureRequests();
  const before=JSON.stringify(suspicious);
  await decide(suspicious);
  assert.equal(JSON.stringify(suspicious),before);
  const after=await decide(suspicious);
  assert.equal(JSON.stringify(after).includes(suspicious.subjectId),false);
  assert.equal(JSON.stringify(after).includes(suspicious.deviceId),false);
});

test('7단계 배포 식별 정보는 실제 설정 단계를 보존한다',()=>{
  const env={VERCEL_GIT_PROVIDER:'github',VERCEL_GIT_REPO_OWNER:'jennajiminkim',
    VERCEL_GIT_REPO_SLUG:'choi-bujang-secret-vault',VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),VERCEL_URL:'fixture.vercel.app'};
  const config={step:7,judgeIssuer:'https://aleph-judge-production.up.railway.app/defense/judge',sampleMarker:'SAMPLE_NOTE_1',
    allowedRoutes:[{method:'GET',path:'/api/notes'}],originalApiUrl:'https://example.invalid/rest/v1/notes'};
  assert.equal(deploymentIdentity(env,config).step,7);
});
