// Only the authenticated engine may call the policy. This is shape validation,
// not an authentication mechanism for arbitrary browser-submitted JSON.
const REQUEST_KEYS = new Set(['schema', 'requestId', 'classId', 'projectId', 'subjectId', 'deviceId',
  'service', 'method', 'path', 'route', 'queryLength', 'querySha256', 'at', 'policyRevision',
  'deviceRegistered', 'stepUp', 'recentEvents', 'signals']);
const object = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, names) => object(value)
  && Object.keys(value).sort().join(',') === [...names].sort().join(',');

export function inspectAccessSignals(request) {
  const invalid = () => ({ kind: 'invalid' });
  if (!object(request) || request.schema !== 'aleph.decision.v1'
      || Object.keys(request).some(key => !REQUEST_KEYS.has(key))) return invalid();
  const signals = request.signals;
  if (!exactKeys(signals, ['source', 'region', 'network', 'hour'])) return invalid();
  if (!['judge_fixture', 'none'].includes(signals.source)) return invalid();
  if (typeof signals.region !== 'string' || !/^[a-z][a-z0-9_-]{0,39}$/.test(signals.region)
      || !['usual', 'unusual', 'unknown'].includes(signals.network)
      || !Number.isInteger(signals.hour) || signals.hour < 0 || signals.hour > 23) return invalid();
  const events = request.recentEvents;
  if (!Array.isArray(events) || events.length > 12 || events.some(event =>
    !exactKeys(event, ['kind', 'ageSeconds', 'count'])
    || typeof event.kind !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(event.kind)
    || !Number.isFinite(event.ageSeconds) || event.ageSeconds < 0
    || !Number.isSafeInteger(event.count) || event.count < 0)) return invalid();
  const stepUp = request.stepUp;
  if (!exactKeys(stepUp, ['verified', 'authAgeSeconds'])
      || !((stepUp.verified === false && stepUp.authAgeSeconds === null)
        || (stepUp.verified === true && Number.isFinite(stepUp.authAgeSeconds)
          && stepUp.authAgeSeconds >= 0 && stepUp.authAgeSeconds <= 900))) return invalid();
  if (signals.source === 'none') {
    if (signals.region !== 'unknown' || signals.network !== 'unknown') return invalid();
    return { kind: 'unavailable' }; // No invented normal location/network/behaviour.
  }
  if (signals.network === 'unknown' || signals.region === 'unknown') return invalid();
  return { kind: 'fixture', signals: { ...signals }, events: events.map(event => ({ ...event })), stepUp: { ...stepUp } };
}
