import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { decide } from './decide.mjs';
import { decide as existingZtnaDecide } from '../../src/decider.mjs';

const DEFAULT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TTL_MS = 15 * 60 * 1000;
const RULE_ID = 'xdr.brute_force.source_ip';
const SAFE_ID = /^[A-Za-z0-9._:-]{1,80}$/;

function validateMode(mode) {
  if (!['live', 'replay'].includes(mode)) throw new Error('mode는 live 또는 replay여야 합니다.');
}

function rulePath(root, mode) {
  validateMode(mode);
  return join(root, 'xdr', 'brute-force', mode === 'live' ? 'deny-rules.json' : 'replay-deny-rules.json');
}

function validRule(rule, now) {
  return rule?.ruleId === RULE_ID && rule.action === 'deny' && isIP(rule.sourceIp || '') > 0
    && Array.isArray(rule.alertIds) && rule.alertIds.length > 0 && rule.alertIds.every(id => typeof id === 'string' && SAFE_ID.test(id))
    && Number.isFinite(Date.parse(rule.createdAt)) && Number.isFinite(Date.parse(rule.expiresAt))
    && Date.parse(rule.createdAt) <= now && Date.parse(rule.expiresAt) > now
    && Date.parse(rule.expiresAt) - Date.parse(rule.createdAt) > 0
    && Date.parse(rule.expiresAt) - Date.parse(rule.createdAt) <= TTL_MS;
}

export async function loadRules({ root = DEFAULT_ROOT, mode = 'live', now = Date.now() } = {}) {
  const path = rulePath(root, mode);
  if (!Number.isFinite(now)) throw new Error('확인 시각이 아닙니다.');
  let value;
  try { value = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error('XDR 거부 규칙을 읽을 수 없습니다.');
  }
  if (value?.schema !== 'aleph.xdr.deny-rules.v1' || value.mode !== mode || !Array.isArray(value.rules)) {
    throw new Error('XDR 거부 규칙 형식이 아닙니다.');
  }
  return value.rules.filter(rule => validRule(rule, now));
}

// Call only with the engine's verified transport address, never a browser-supplied request field.
export function checkSourceIp(sourceIp, rules, now = Date.now()) {
  if (typeof sourceIp !== 'string' || !isIP(sourceIp)) return { blocked: false };
  const rule = rules.find(item => validRule(item, now) && item.sourceIp === sourceIp);
  return rule ? { blocked: true, ruleId: rule.ruleId, expiresAt: rule.expiresAt, alertIds: [...rule.alertIds] } : { blocked: false };
}

// A batch is processed serially by one writer. Do not run concurrent responders against the same root.
export async function respond(alerts, { root = DEFAULT_ROOT, mode = 'live', now = Date.now() } = {}) {
  validateMode(mode);
  if (!Array.isArray(alerts) || !Number.isFinite(now)) throw new Error('경보 배열과 확인 시각이 필요합니다.');
  const outputPath = rulePath(root, mode);
  await mkdir(dirname(outputPath), { recursive: true });
  const rules = await loadRules({ root, mode, now });
  const outcomes = [];
  for (const alert of alerts) {
    // Recompute instead of trusting a supplied block result.
    const decision = decide(alert);
    const alertId = typeof alert?.id === 'string' && SAFE_ID.test(alert.id) ? alert.id : null;
    const sourceIp = typeof alert?.data?.srcip === 'string' && isIP(alert.data.srcip) ? alert.data.srcip : null;
    const eventAt = Date.parse(alert?.timestamp);
    const fresh = Number.isFinite(eventAt) && eventAt <= now + 5000 && eventAt + TTL_MS > now;
    let installed = false;
    if (decision.action === 'block' && alertId && sourceIp && fresh) {
      let rule = rules.find(item => item.sourceIp === sourceIp);
      const expiresAt = new Date(eventAt + TTL_MS).toISOString();
      if (!rule) {
        rule = { ruleId: RULE_ID, action: 'deny', sourceIp, createdAt: new Date(Math.min(eventAt, now)).toISOString(), expiresAt, alertIds: [alertId] };
        rules.push(rule);
      } else {
        // A fresh, separately evaluated attack can start a new bounded interval.
        if (Date.parse(expiresAt) > Date.parse(rule.expiresAt)) {
          rule.createdAt = new Date(Math.min(eventAt, now)).toISOString();
          rule.expiresAt = expiresAt;
        }
        if (!rule.alertIds.includes(alertId)) rule.alertIds.push(alertId);
      }
      installed = true;
    }
    if (decision.action === 'alert' || decision.action === 'block') {
      const log = { at: new Date(now).toISOString(), mode, alertId, action: decision.action, confidence: decision.confidence,
        reason: decision.reason, installed, status: installed ? 'deny_rule_installed' : decision.action === 'block' ? 'stale_or_missing_metadata' : 'notification_only' };
      // No raw alert, account, password, token or full_log is persisted.
      await appendFile(join(root, 'xdr', 'alerts.log'), `${JSON.stringify(log)}\n`, { mode: 0o600 });
    }
    outcomes.push({ alertId, ...decision, installed });
  }
  const payload = { schema: 'aleph.xdr.deny-rules.v1', mode, rules: rules.filter(rule => validRule(rule, now)) };
  const temporary = `${outputPath}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, outputPath);
  return outcomes;
}

// Additional check around an existing ZTNA policy. It never produces an allow by itself.
// The host supplies an approved deny response and obtains IP outside the 18-field request contract.
export function withBruteForce(baseDecide, { sourceIpForRequest, denyResponse, root = DEFAULT_ROOT, mode = 'live', clock = Date.now } = {}) {
  validateMode(mode);
  if (typeof baseDecide !== 'function' || typeof sourceIpForRequest !== 'function' || typeof denyResponse !== 'function') {
    throw new Error('기존 판정기, 신뢰된 출발 주소 조회, 등록된 거부 응답이 필요합니다.');
  }
  return async function decideZtna(request) {
    const base = await baseDecide(request);
    if (!['allow', 'step_up'].includes(base?.decision)) return base;
    const now = clock();
    const sourceIp = await sourceIpForRequest(request);
    // Missing verified metadata or broken rule storage cannot silently grant access.
    if (typeof sourceIp !== 'string' || !isIP(sourceIp)) throw new Error('신뢰된 출발 주소가 없습니다.');
    const match = checkSourceIp(sourceIp, await loadRules({ root, mode, now }), now);
    if (!match.blocked) return base;
    const denial = await denyResponse(request, match);
    if (!denial || Object.keys(denial).sort().join(',') !== 'decision,reasonCode,requestId,ruleIds,schema'
      || denial.schema !== 'aleph.decision.v1' || denial.requestId !== request.requestId || denial.decision !== 'deny'
      || typeof denial.reasonCode !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(denial.reasonCode)
      || !Array.isArray(denial.ruleIds) || !denial.ruleIds.includes(RULE_ID)) {
      throw new Error('등록된 ZTNA 거부 응답 형식이 아닙니다.');
    }
    return denial;
  };
}

// Concrete connection to this repository's policy, without changing its rules.
export function createZtnaDecider(options) {
  return withBruteForce(existingZtnaDecide, options);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const replay = process.argv.includes('--replay');
    const fixture = JSON.parse(await readFile(new URL('../fixtures/brute-force.json', import.meta.url), 'utf8'));
    if (!replay) throw new Error('시험 경보는 --replay로 실행하세요. 실제 경보는 신뢰된 서버에서 respond()로 전달합니다.');
    const sorted = [...fixture.alerts].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    let installed = 0;
    for (const alert of sorted) {
      const [out] = await respond([alert], { mode: 'replay', now: Date.parse(alert.timestamp) });
      if (out.installed) installed++;
    }
    console.log(JSON.stringify({ mode: 'replay', blockCandidatesApplied: installed, liveRulesChanged: false }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
