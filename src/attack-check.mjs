import publicConfig from '../public/auth-config.json' with { type: 'json' };
// Only record HTTP results from requests actually sent. Never include tokens or note bodies.
export async function runAttackChecks(config) {
  if (config.step !== 5) throw new Error('현재 자기 점검은 5단계에 맞춰져 있습니다.');
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
  await check('deployment_identity', '/aleph.json', 'JSON 배포 식별 정보 step 5', {}, (r, d) =>
    `HTTP ${r.status}; ${d?.schema === 'aleph.defense.deployment.v1' ? '배포 JSON 있음' : '배포 JSON 확인 실패'}; 단계 ${Number.isInteger(d?.step) ? d.step : '확인 실패'}`);
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
  results.push({ attackId: 'live_student_crud', expected: '5단계 배포에서 실제 A/B의 본인 CRUD 허용과 상대 메모 GET·PUT·DELETE 거부',
    observed: '미실행: 권한 회수 전후 실제 A/B 계정 CRUD 시험은 사용자 확인이 필요합니다. 이전 단계의 A CRUD 확인은 5단계 시험을 대신하지 않습니다.' });
  results.push({ attackId: 'live_direct_grants', expected: '실제 학습 DB에서 PUBLIC·anon·authenticated 직접 권한 없음, 서버 CRUD 유지',
    observed: '미실행: 5단계 권한 회수 SQL은 검토용으로 제공했습니다. 직접 anon 거부 결과만으로 authenticated 권한 회수를 증명하지 않습니다.' });
  return results;
}
