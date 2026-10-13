import publicConfig from '../public/auth-config.json' with { type: 'json' };
import { decide } from './decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
// Distinguish actual HTTP observations from local simulated policy checks.
// Never include tokens, device keys, subject IDs or note bodies.
export async function runAttackChecks(config) {
  if (![5, 6, 7, 8].includes(config.step)) throw new Error('현재 자기 점검은 5~8단계에 맞춰져 있습니다.');
  const app = new URL(config.publicAppUrl);
  if (app.protocol !== 'https:' || app.username || app.password || app.pathname !== '/' || app.search || app.hash) {
    throw new Error('aleph.config.json의 실제 배포 주소를 확인해 주세요.');
  }
  const results = [];
  async function check(attackId, path, expected, options, inspect) {
    try {
      const response = await fetch(new URL(path, app), {
        ...options, redirect: 'error', signal: AbortSignal.timeout(10000),
      });
      const contentType = response.headers.get('content-type') || '';
      let data;
      if (contentType.includes('application/json')) {
        try { data = await response.json(); } catch { /* record invalid JSON */ }
      }
      results.push({ attackId, expected, observed: inspect(response, data, contentType) });
    } catch {
      results.push({ attackId, expected, observed: '요청을 보냈지만 응답 확인에 실패했습니다. 배포 주소와 네트워크를 확인해야 합니다.' });
    }
  }
  const dummy = '00000000-0000-4000-8000-000000000000';
  const denied = (r, d) => `HTTP ${r.status}; JSON 오류 ${typeof d?.error === 'string' ? '있음' : '없음'}; ${[401, 403].includes(r.status) && typeof d?.error === 'string' ? '기대 결과 일치' : '기대 결과 불일치'}`;
  for (const [method, path] of [['GET', '/api/notes'], ['POST', '/api/notes'], ['GET', `/api/notes/${dummy}`], ['PUT', `/api/notes/${dummy}`], ['DELETE', `/api/notes/${dummy}`]]) {
    await check(`anonymous_${method.toLowerCase()}_${path === '/api/notes' ? 'list' : 'item'}`, path,
      '로그인 없이 요청하면 401 또는 403 JSON 오류, 메모 없음', { method }, denied);
  }
  await check('invalid_login_token', '/api/notes', '잘못된 인증은 401 또는 403 JSON 오류',
    { headers: { Authorization: 'Bearer invalid' } }, denied);
  await check('static_notes_removed', '/data.json', '404 또는 정적 메모 0건', {}, (r, d) =>
    `HTTP ${r.status}; ${r.status === 404 ? '파일 없음' : Array.isArray(d?.notes) ? `정적 메모 ${d.notes.length}건` : '정적 JSON 형식 확인 실패'}`);
  await check('deployment_identity', '/aleph.json', `JSON 배포 식별 정보 step ${config.step}, publicAppUrl은 설정의 공개 주소와 일치`, {}, (r, d) =>
    `HTTP ${r.status}; ${d?.schema === 'aleph.defense.deployment.v1' ? '배포 JSON 있음' : '배포 JSON 확인 실패'}; 단계 ${Number.isInteger(d?.step) ? d.step : '확인 실패'}; 공개 주소 일치 ${d?.publicAppUrl === app.origin ? '있음' : '없음'}; ${r.ok && d?.step === config.step && d?.publicAppUrl === app.origin ? '기대 결과 일치' : '기대 결과 불일치'}`);
  await check('security_header', '/', '첫 화면 X-Content-Type-Options: nosniff', {}, r =>
    `HTTP ${r.status}; nosniff ${r.headers.get('x-content-type-options')?.toLowerCase() === 'nosniff' ? '있음' : '없음'}`);
  await check('deployment_routes', '/aleph.json', 'allowedRoutes에 실제 자료 경로가 하나 이상 있음', {}, (r, d) =>
    `HTTP ${r.status}; 허용 경로 ${Array.isArray(d?.allowedRoutes) ? d.allowedRoutes.length : 0}개; ${r.ok && Array.isArray(d?.allowedRoutes) && d.allowedRoutes.length > 0 && JSON.stringify(d.allowedRoutes) === JSON.stringify(config.allowedRoutes) ? '기대 결과 일치' : '기대 결과 불일치'}`);
  const provider = new URL(config.identityProvider.issuer);
  if (provider.origin !== new URL(publicConfig.url).origin) throw new Error('공개 설정과 발급자가 다릅니다.');
  const original = new URL(config.originalApiUrl);
  if (original.protocol !== 'https:' || original.origin !== provider.origin || original.pathname !== '/rest/v1/notes' || original.username || original.password || original.search || original.hash) {
    throw new Error('쿼리 없는 원본 자료 HTTPS 경로를 확인해 주세요.');
  }
  original.searchParams.set('select', 'id'); original.searchParams.set('limit', '1');
  await check('direct_anon_data_api', original.href,
    '로그인 토큰 없이 공개용 키만 보낸 직접 Data API는 401 또는 403 JSON 오류',
    { headers: { apikey: publicConfig.publishableKey } },
    (r, d) => `HTTP ${r.status}; JSON 권한 오류 ${d?.code === '42501' ? '있음' : '확인 필요'}; ${[401, 403].includes(r.status) && d?.code === '42501' ? '기대 결과 일치' : '기대 결과 불일치'}`);
  await check('browser_public_key', '/auth-config.json', '화면 코드에 공개 키 없음 추가점수 조건', {}, (r, d) =>
    `HTTP ${r.status}; ${typeof d?.publishableKey === 'string' && d.publishableKey.startsWith('sb_publishable_') ? '로그인용 공개 키 있음; Auth 호출 유지 조건에 따라 추가점수 조건 미충족' : '공개 키 노출 여부 확인 필요'}`);
  results.push({ attackId: 'live_student_crud', expected: '실제 A/B의 본인 CRUD 허용과 상대 메모 GET·PUT·DELETE 거부',
    observed: '미실행: 권한 회수 전후 실제 A/B 계정 CRUD 시험은 사용자 확인이 필요합니다. 이전 단계의 A CRUD 확인은 5단계 시험을 대신하지 않습니다.' });
  results.push({ attackId: 'live_direct_grants', expected: '실제 학습 DB에서 PUBLIC·anon·authenticated 직접 권한 없음, 서버 CRUD 유지',
    observed: '미실행: 5단계 권한 회수 SQL은 검토용으로 제공했습니다. 직접 anon 거부 결과만으로 authenticated 권한 회수를 증명하지 않습니다.' });
  if (config.step === 8) {
    await check('anonymous_announcements', `/api/announcements/${dummy}`, '로그인 없이 공지 개별 API 요청은 401 또는 403 JSON 오류', {method:'GET'}, denied);
    const {normal, suspicious} = fixtureRequests();
    const priorCases = [[normal, 'allow'], [{...normal, deviceRegistered:false}, 'deny'],
      [suspicious, 'step_up'], [{...suspicious,stepUp:{verified:true,authAgeSeconds:60}}, 'allow']];
    const priorResults = await Promise.all(priorCases.map(async ([input,expected]) => (await decide(input)).decision === expected));
    results.push({attackId:'local_previous_rules',expected:'로컬 가상 정상·미등록·복합 이상·가상 재확인 네 항목 유지',
      observed:`로컬 ${priorResults.filter(Boolean).length}/4 일치; 실제 엔진 시험 아님`});
    const paths = [
      [{...normal,path:`/api/notes/${dummy}`,route:'GET /api/notes/:id'}, 'allow'],
      [{...normal,method:'PUT',path:`/api/notes/${dummy}`,route:'PUT /api/notes/:id'}, 'allow'],
      [{...normal,path:'/notes/export'},'deny'],
      [{...normal,path:'/notes',route:'GET /notes'},'deny'],
      [{...normal,path:'/api/notes',route:'GET /api/notes'},'deny'],
      [{...normal,service:'notices',path:`/notices/${dummy}`,route:'GET /notices/:id'},'allow'],
      [{...normal,service:'notices',method:'PUT',path:`/notices/${dummy}`,route:'PUT /notices/:id'},'deny'],
      [{...normal,service:'announcements',path:'/api/announcements/fixture_notice',route:'GET /api/announcements/:id'},'allow'],
      [{...normal,service:'announcements',method:'PUT',path:'/api/announcements/fixture_notice',route:'PUT /api/announcements/:id'},'deny'],
      [{...normal,service:'materials',path:'/api/materials/fixture_material',route:'GET /api/materials/:id'},'deny'],
    ];
    const pathResults = await Promise.all(paths.map(async ([input,expected]) => (await decide(input)).decision === expected));
    const announcement = await decide({...normal,service:'announcements',method:'PUT',path:'/api/announcements/fixture_notice',route:'PUT /api/announcements/:id'});
    const material = await decide({...normal,service:'materials',path:'/api/materials/fixture_material',route:'GET /api/materials/:id'});
    results.push({attackId:'local_resource_routes',expected:'로컬 개별 메모 GET·PUT 및 공지 GET 허용; 목록·공지 쓰기·강사 자료 거부',
      observed:`로컬 ${pathResults.filter(Boolean).length}/${paths.length} 일치; 공지 쓰기 ${announcement.reasonCode}; 강사 자료 ${material.reasonCode}; 소유자는 최종 API가 비교`});
    results.push({attackId:'live_instructor_update',expected:'승인된 강사만 공지 수정, 학생은 403',
      observed:'미실행: 실제 학습 DB의 강사 설정 및 학생/강사 인증 요청은 사용자 확인이 필요합니다. 로컬 API·SQL 시험과 구분합니다.'});
    const bulk = await decide({...normal,path:'/notes',route:'GET /notes'});
    results.push({attackId:'local_bulk_denial',expected:'로컬 GET /notes는 deny · zone_notes_no_bulk',
      observed:`로컬 ${bulk.decision}; 규칙 ${bulk.ruleIds.join(',')}; ${bulk.decision==='deny' && bulk.ruleIds.includes('zone_notes_no_bulk')?'일치':'불일치'}; 소유자 비교는 최종 API가 수행`});
    results.push({attackId:'live_step_up_flow',expected:'운영 엔진에서 새 로그인 검증 전 자료 차단, 재검증 후 요청 허용',
      observed:'미실행: 실제 재로그인·확인 요청 연결 계약이 없어 로컬 가상 사건만 시험했습니다.'});
    return results;
  }
  if (config.step >= 6) {
    const { normal, suspicious } = fixtureRequests();
    for (const [attackId, request, expected, reason] of [
      ['local_registered_device', normal, 'allow', 'approved'],
      ['local_unregistered_device', { ...normal, deviceRegistered: false }, 'deny', 'device_not_registered'],
      ['local_missing_device_status', { ...normal, deviceRegistered: undefined }, 'deny', 'device_not_registered'],
    ]) {
      const result = await decide(request);
      results.push({ attackId, expected: `로컬 가상 요청: ${expected} · ${reason}`,
        observed: `로컬 가상 요청: ${result.decision} · ${result.reasonCode}; ${result.decision === expected && result.reasonCode === reason ? '일치' : '불일치'}; 심판 또는 실제 기기 접속 시험 아님` });
    }
    if (config.step === 7) {
      for (const [attackId, input, expected] of [
        ['local_compound_step_up', suspicious, 'step_up'],
        ['local_rechecked_fixture', { ...suspicious, stepUp: { verified: true, authAgeSeconds: 60 } }, 'allow'],
      ]) {
        const output = await decide(input);
        results.push({ attackId, expected: `로컬 가상 요청: ${expected}`,
          observed: `로컬 가상 요청: ${output.decision} · ${output.reasonCode}; ${output.decision === expected ? '일치' : '불일치'}; 실제 로그인·자료 차단 시험 아님` });
      }
      results.push({ attackId: 'live_step_up_flow', expected: '운영 엔진에서 같은 주체의 새 로그인 검증 전 자료 없음, 재검증 후 새 요청 허용',
        observed: '미실행: stepUp 요약 계약은 있으나 실제 새 로그인·확인 요청 연결은 저장소에서 확인되지 않아 운영 자료 차단과 해제는 시험하지 않았습니다.' });
    } else {
      results.push({ attackId: 'live_registered_device', expected: '운영 엔진을 통한 등록 기기의 기존 화면·자료 읽기',
        observed: '미실행: 등록 기기의 실제 화면 확인은 사용자 확인이 필요합니다. 미등록 기기 공격은 심판이 수행합니다.' });
    }
  }
  return results;
}
