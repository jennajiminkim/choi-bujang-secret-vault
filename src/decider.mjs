// ALEPH SDP 엔진이 신원·기기·경로를 확인한 요청만 받습니다.
// 등록 기기·추가 확인·서버 저장 자원 권한을 모두 통과해야 허용합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
import { inspectAccessSignals } from './access-signals.mjs';
import { classifyResource } from './resources.mjs';
import { authorizeServerResource } from './resource-authorization.mjs';

export const RULE_IDS = Object.freeze(['starter.deny', 'device_registered', 'step_up_required', 'resource_zones']);

export function createResourceDecider({ authorize = authorizeServerResource } = {}) {
return async function decide(request) {
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

  const resource = classifyResource(request);
  if (resource) {
    const context = inspectAccessSignals(request);
    if (context.kind === 'invalid') {
      return response('step_up', 'step_up_required', 'step_up_required');
    }
    let granted = false;
    try { granted = await authorize(request, resource); } catch { /* unresolved permission stays denied */ }
    if (granted !== true) {
      return response('deny', 'starter_not_ready', 'resource_zones');
    }
    if (context.kind === 'fixture') {
      const unusualHour = context.signals.hour < 6 || context.signals.hour >= 23;
      const unusualNetwork = context.signals.network === 'unusual';
      const manyRecentRequests = context.events.some(event =>
        event.kind === 'risk_signal' && event.ageSeconds <= 300 && event.count >= 20);
      if (unusualHour && unusualNetwork && manyRecentRequests) {
        // This is ONLY the judge/local fixture's validated recheck state.
        // No live login freshness or challenge binding is inferred from this flag.
        if (context.stepUp.verified !== true) {
          return response('step_up', 'step_up_required', 'step_up_required');
        }
        return { ...response('allow', 'approved', 'device_registered'),
          ruleIds: ['device_registered', 'step_up_required', 'resource_zones'] };
      }
    }
    // source:none is unavailable, not a fabricated normal risk profile.
    // Device and server resource grants still apply without inventing a normal risk profile.
    return { ...response('allow', 'approved', 'device_registered'), ruleIds: ['device_registered', 'resource_zones'] };
  }
  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: 'deny',
    reasonCode: 'starter_not_ready',
    ruleIds: [RULE_IDS[0]],
  };
};
}

export const decide = createResourceDecider();
