// Called only by the authenticated engine; these fields do not authenticate a browser.
// No I/O, device mutation, note contents, credentials, or access-policy responses.
export const DETECTION_RULE_IDS = Object.freeze(['burst_read_unusual_network']);
const WINDOW_MS = 600000;
const SUBJECT = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const DEVICE = /^[0-9a-f]{16}$/iu;
const unusual = new Set(['unusual', 'new', 'first_seen']);
const usual = new Set(['usual', 'known', 'home']);
const firstString = (...values) => values.find(value => typeof value === 'string') ?? null;

// The aliases below come from the user-supplied successful example, not an
// independently verified engine contract. Missing/unknown signals stay null.
export function readEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
  const at = typeof event.at === 'string' ? Date.parse(event.at) : NaN;
  const subject = event.identity?.sub;
  if (!Number.isFinite(at) || typeof subject !== 'string' || !SUBJECT.test(subject)
      || typeof event.method !== 'string') return null;
  const deviceRaw = firstString(event.deviceId, event.device_id, event.device?.id,
    event.device?.deviceId, typeof event.device === 'string' ? event.device : undefined,
    event.identity?.deviceId, event.identity?.device_id,
    typeof event.identity?.device === 'string' ? event.identity.device : event.identity?.device?.id);
  const networkRaw = firstString(event.network, event.signals?.network,
    event.context?.network, event.network?.kind);
  const decisionRaw = firstString(event.decision, event.result?.decision);
  const network = networkRaw?.toLowerCase() ?? null;
  const decision = decisionRaw?.toLowerCase() ?? null;
  // Legacy practice events have exactly these three fields, and only sub inside identity.
  const legacy = Object.keys(event).sort().join(',') === 'at,identity,method'
    && event.identity && Object.keys(event.identity).join(',') === 'sub';
  return { at, subject, method: event.method.toUpperCase(),
    device: deviceRaw && DEVICE.test(deviceRaw) ? deviceRaw.toLowerCase() : null,
    network: unusual.has(network) || usual.has(network) ? network : null,
    decision: ['allow', 'deny', 'step_up'].includes(decision) ? decision : null, legacy };
}

// Count any sliding window; a normal early window cannot hide a later attack.
function burst(reads) {
  reads.sort((a, b) => a.at - b.at);
  let start = 0;
  for (let end = 0; end < reads.length; end++) {
    while (reads[end].at - reads[start].at >= WINDOW_MS) start++;
    if (end - start + 1 > 120) return { at: reads[end].at, subject: reads[end].subject,
      device: reads[end].device };
  }
  return null;
}

export function detect(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  const parsed = events.map(readEvent).filter(Boolean);
  // The documented old practice contract has no network or device; isolate it
  // from enriched events so absent evidence never grants a device proposal.
  const legacyOnly = parsed.length === events.length && parsed.every(event => event.legacy);
  const groups = new Map();
  for (const event of parsed) {
    if (event.method !== 'GET') continue;
    if (!legacyOnly && (!event.device || !unusual.has(event.network)
        || !event.decision || event.decision === 'deny')) continue;
    const key = legacyOnly ? event.subject : JSON.stringify([event.subject, event.device]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  const candidates = [...groups.values()].map(burst).filter(Boolean).sort((a, b) => a.at - b.at);
  if (!candidates.length) return { action: 'observe' };
  const target = candidates[0];
  const result = { action: 'propose_revocation', reasonCode: 'burst_read', subject: target.subject };
  if (!legacyOnly) result.device = target.device;
  return result;
}
