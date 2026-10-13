// ALEPH SDP 엔진이 신원·기기·경로를 확인한 요청만 받습니다.
// 등록 기기의 자료실 읽기만 허용하고 나머지는 기존 기본 거부를 유지합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['starter.deny', 'device_registered']);

export async function decide(request) {
  const response = (decision, reasonCode, ruleId) => ({
    schema: 'aleph.decision.v1',
    requestId: request?.requestId,
    decision,
    reasonCode,
    ruleIds: [ruleId],
  });
  if (request?.deviceRegistered !== true) {
    return response('deny', 'device_not_registered', 'device_registered');
  }

  // /notes is the engine's service path; /api/notes is the existing app's API path.
  // Check matching route and path together, rather than trusting a route string alone.
  const readPath = ['/notes', '/api/notes'].some(base =>
    (request.route === `GET ${base}` && request.path === base)
    || (request.route === `GET ${base}/:id` && typeof request.path === 'string'
      && request.path.startsWith(`${base}/`)
      && /^[^/?#]+$/.test(request.path.slice(base.length + 1))
      && !['.', '..'].includes(request.path.slice(base.length + 1)))
  );
  if (request.service === 'notes' && request.method === 'GET' && readPath) {
    return response('allow', 'approved', 'device_registered');
  }
  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: 'deny',
    reasonCode: 'starter_not_ready',
    ruleIds: [RULE_IDS[0]],
  };
}
