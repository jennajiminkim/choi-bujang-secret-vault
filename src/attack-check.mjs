import { readFileSync } from 'node:fs';
const publicConfig = JSON.parse(readFileSync(new URL('../public/auth-config.json', import.meta.url), 'utf8'));
import { decide } from './decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
// Distinguish actual HTTP observations from local simulated policy checks.
// Never include tokens, device keys, subject IDs or note bodies.
export async function runAttackChecks(config) {
  if (![5, 6, 7, 8, 9, 10, 11, 12].includes(config.step)) throw new Error('현재 자기 점검은 5~12단계에 맞춰져 있습니다.');
  if (config.step === 12) {
    // The bundle declares unexecuted checks; actual API evidence stays in the recapture table.
    const checks = [
      ['public_app', '접속 앱공개 화면 GET /: 200'],
      ['own_notes_list', '본인 메모 목록 GET /api/notes: 200'],
      ['own_note_read', '본인 메모 한 건 GET /api/notes/:id: 200'],
      ['anonymous_notes', '익명 GET /api/notes: 401 또는 403'],
      ['foreign_note_read', '다른 계정 메모 GET /api/notes/:id: 404'],
      ['unregistered_device', '기기 확인값 없는 GET /api/notes: 403'],
      ['backup_verify', '본인 사전 백업 GET /api/note-backups?backupId=:id: 200 및 사본 검증'],
      ['own_note_update', '본인 메모 PUT /api/notes/:id: 200'],
      ['student_notice_update', '학생 공지 수정 PUT /api/notices/:id: 403'],
      ['engine_step_up', '제공 엔진의 복합 이상 step_up 및 새 로그인 검증 후 허용'],
      ['engine_revocation', '복합 탐지 propose_revocation 및 엔진 회수 확인, 정상 기기 유지'],
      ['note_restore', 'B 시험 메모 한 건 POST /api/note-restores: 200 및 복원 검증'],
      ['judge_assault_41', '공식 41종 시험: 심판 집행 결과 필요'],
    ];
    return checks.map(([attackId, expectation]) => ({
      attackId,
      expected: `${expectation}. 미실행 이유: 12단계 번들은 HTTP 요청과 로컬 연습을 실행하지 않습니다. 실제 API 결과는 탈환 작전실 recapture:table에서 별도로 확인하며 엔진·41종 결과는 수신 전입니다.`,
      observed: 'not_run',
    }));
  }
  const app = new URL(config.publicAppUrl);
  if (app.protocol !== 'https:' || app.username || app.password || app.pathname !== '/' || app.search || app.hash) {
    throw new Error('aleph.config.json의 실제 배포 주소를 확인해 주세요.');
  }
  const results = [];
  async function check(attackId, path, expected, options, inspect) {
    const method = (options?.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD'].includes(method)) {
      results.push({ attackId, expected, observed: `미실행: ${method} 쓰기 요청은 격리 실행의 GET·HEAD 허용 범위 밖이므로 보내지 않았습니다.` });
      return;
    }
    try {
      const response = await fetch(new URL(path, app), {
        ...options, redirect: 'error', signal: AbortSignal.timeout(10000),
      });
      results.push({ attackId, expected, observed: `HTTP ${response.status}` });
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
  await check('direct_anon_data_api', original.href + '?select=id&limit=1',
    '로그인 토큰 없이 공개용 키만 보낸 직접 Data API는 401 또는 403 JSON 오류',
    { headers: { apikey: publicConfig.publishableKey } },
    (r, d) => `HTTP ${r.status}; JSON 권한 오류 ${d?.code === '42501' ? '있음' : '확인 필요'}; ${[401, 403].includes(r.status) && d?.code === '42501' ? '기대 결과 일치' : '기대 결과 불일치'}`);
  await check('browser_public_key', '/auth-config.json', '화면 코드에 공개 키 없음 추가점수 조건', {}, (r, d) =>
    `HTTP ${r.status}; ${typeof d?.publishableKey === 'string' && d.publishableKey.startsWith('sb_publishable_') ? '로그인용 공개 키 있음; Auth 호출 유지 조건에 따라 추가점수 조건 미충족' : '공개 키 노출 여부 확인 필요'}`);
  results.push({ attackId: 'live_student_crud', expected: '실제 A/B의 본인 CRUD 허용과 상대 메모 GET·PUT·DELETE 거부',
    observed: '미실행: 권한 회수 전후 실제 A/B 계정 CRUD 시험은 사용자 확인이 필요합니다. 이전 단계의 A CRUD 확인은 5단계 시험을 대신하지 않습니다.' });
  results.push({ attackId: 'live_direct_grants', expected: '실제 학습 DB에서 PUBLIC·anon·authenticated 직접 권한 없음, 서버 CRUD 유지',
    observed: '미실행: 5단계 권한 회수 SQL은 검토용으로 제공했습니다. 직접 anon 거부 결과만으로 authenticated 권한 회수를 증명하지 않습니다.' });
  if (config.step >= 8) {
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
    if (config.step >= 9) {
      const { checkDetection } = await import('../scripts/detect-test.mjs');
      const { detect } = await import('./detect.mjs');
      const checks = await checkDetection(detect);
      results[results.findIndex(item => item.attackId === 'local_bulk_denial')] = {
        attackId:'local_detection_practice', expected:'기존 로컬 탐지 연습 6건 통과',
        observed:`로컬 ${checks.filter(item => item.passed).length}/6 통과; 실제 회수·시간 측정은 미실행` };
      results[results.findIndex(item => item.attackId === 'live_step_up_flow')] = {
        attackId:'live_device_revocation', expected:'심판의 복합 의심 기기 한 개 회수·정상 기기 유지 및 경과 시간 측정',
        observed:'미실행: 학생 함수는 회수 제안만 반환하며 실제 집행·시간 측정은 심판이 수행합니다.' };
    }
    if (config.step === 10) {
      // Keep the submission limit at 20: replace unrelated live teacher/grant placeholders.
      const { rehearsePolicyRestore } = await import('../scripts/policy-restore.mjs');
      const trial = await rehearsePolicyRestore();
      results[results.findIndex(item => item.attackId === 'live_instructor_update')] = {
        attackId:'local_policy_recovery', expected:'사전 사본 재검증 후 격리 정책 복원: A 정상 200, B의 A 요청 404, 다른 규칙·감사 보존',
        observed:`로컬 복원 전 B→A ${trial.beforeB}; 복원 후 A→A ${trial.afterA}, B→A ${trial.afterB}; 다른 서비스·감사 보존 ${trial.preserved}; 운영 정책 변경 없음` };
      // User's manual observation is attributed, never an automated live claim.
      results[results.findIndex(item => item.attackId === 'live_direct_grants')] = {
        attackId:'user_reported_note_restore', expected:'B의 지정한 한 건 백업 재검증·복원, 원래 내용 유지',
        observed:'사용자 확인(2026-10-14): 사전 백업 201, 재검증 200·verified true, 복원 뒤 화면에서 원래 내용, 재검증 200·verified true. 자동 운영 시험 아님; 실제 ID·본문·해시 제외' };
      // Keep the restore check listed; the read-only runner records POST as unexecuted.
      const index=results.findIndex(item => item.attackId === 'browser_public_key');
      results.splice(index,1);
      await check('anonymous_note_restore','/api/note-restores','익명 POST 복원은 401 또는 403 JSON 오류',
        {method:'POST'},denied);
    }
    if (config.step === 12) {
      // This is a 20-entry self-check, not the judge's 41-kind assault.
      const index=results.findIndex(item=>item.attackId==='browser_public_key');
      if(index>=0)results.splice(index,1);
      await check('anonymous_operations','/api/operations','익명 작전실 API는 401 또는 403 JSON 오류, 비공개 기록 없음',{method:'GET'},denied);
      const recordsIndex=results.findIndex(item=>item.attackId==='live_instructor_update');
      if(recordsIndex>=0)results[recordsIndex]={attackId:'live_operations_records',expected:'새 기록 테이블 적용 후 정상·금지 요청의 HTTP/요청 ID/시각과 화면 수치 대조',
        observed:'미실행: step12_operations.sql 적용과 승인된 앱의 실제 기록·수치 대조는 사용자 실행이 필요합니다. 로컬 HTTP/SQL/화면 시험과 구분합니다.'};
      const assaultIndex=results.findIndex(item=>item.attackId==='live_direct_grants');
      if(assaultIndex>=0)results[assaultIndex]={attackId:'judge_assault_41',expected:'제공 ALEPH SDP 엔진·심판의 공식 41종 집행 결과',
        observed:'미실행: 공식 종별 명세·결과 수신 계약이 없어 실행 확인 0/41입니다. 자체 점검 20개를 총공세 통과로 처리하지 않습니다.'};
    }
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
