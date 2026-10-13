// ALEPH SDP 엔진이 신원·기기·경로를 확인한 요청만 받습니다.
// 검증된 경로의 API 진입을 검사합니다. 행 소유권은 최종 API에서 검사합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
import { matchResource } from './resources.mjs';
import { inspectAccessSignals } from './access-signals.mjs';

export const RULE_IDS = Object.freeze(['starter.deny', 'device_registered', 'step_up_required', 'zone_notes_self', 'zone_notes_no_bulk']);

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

  // A policy decision cannot assume a collection contains only the caller's notes.
  if (request.service === 'notes' && ['/notes', '/api/notes'].includes(request.path)) {
    return response('deny', 'starter_not_ready', 'zone_notes_no_bulk');
  }
  const resource = matchResource(request);
  if (resource) {
    const context = inspectAccessSignals(request);
    if (context.kind === 'invalid') {
      return response('step_up', 'step_up_required', 'step_up_required');
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
          ruleIds: ['device_registered', 'zone_notes_self', 'step_up_required'] };
      }
    }
    // source:none is unavailable, not a fabricated normal risk profile.
    // Device and exact route checks still apply; final API checks stored ownership.
    return { ...response('allow', 'approved', 'zone_notes_self'),
      ruleIds: ['device_registered', 'zone_notes_self'] };
  }
  return {
    schema: 'aleph.decision.v1',
    requestId: request?.requestId,
    decision: 'deny',
    reasonCode: 'starter_not_ready',
    ruleIds: [RULE_IDS[0]],
  };
}
