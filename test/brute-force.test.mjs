import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { decide } from '../xdr/brute-force/decide.mjs';
import { extractAlerts } from '../xdr/brute-force/read-alerts.mjs';
import { respond, loadRules, checkSourceIp, withBruteForce, createZtnaDecider } from '../xdr/brute-force/respond.mjs';
import { decide as existingDecide } from '../src/decider.mjs';

const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/brute-force.json', import.meta.url), 'utf8'));
const normal = fixture.alerts.filter(alert => alert.rule.level <= 3 && alert.rule.mitre.length === 0);
const attack = fixture.alerts.find(alert => Number(alert.data.count) >= 40 && /2분/.test(alert.rule.description));
const at = Date.parse(attack.timestamp);

test('28개 경보에서 필요한 다섯 항목만 읽고 비밀값을 가린다', () => {
  const rows = extractAlerts(fixture.alerts);
  assert.equal(rows.length, fixture.alerts.length);
  assert.deepEqual(Object.keys(rows[0]), ['timestamp', 'sourceIp', 'account', 'level', 'description']);
  const dangerous = { ...attack, full_log: 'never-output', data: { ...attack.data, password: 'never-output',
    srcuser: 'token=never-output' }, rule: { ...attack.rule, description: 'password="never-output"\n비밀번호:never-output' } };
  assert.ok(!JSON.stringify(extractAlerts([dangerous])).includes('never-output'));
  assert.equal(extractAlerts([null]).length, 1);
});

test('독립 파일의 패턴 상수는 JSON과 같고 호출 순서와 무관하다', async () => {
  const source = await readFile(new URL('../xdr/brute-force/decide.mjs', import.meta.url), 'utf8');
  const patterns = JSON.parse(await readFile(new URL('../xdr/brute-force/patterns.json', import.meta.url), 'utf8'));
  assert.deepEqual(JSON.parse(vm.runInNewContext(`${source.replace('export function decide', 'function decide')}\nJSON.stringify(PATTERNS)`)), patterns);
  assert.ok(!/\bimport\b\s*(?:\(|[{'"*])|\b(?:fetch|readFile|writeFile|require)\s*\(/.test(source));
  const context = vm.createContext({});
  vm.runInContext(`${source.replace('export function decide', 'function decide')}\nthis.evaluate = decide;`, context);
  for (const alert of fixture.alerts.toReversed()) assert.deepEqual(JSON.parse(JSON.stringify(context.evaluate(alert))), decide(alert));
  for (const pattern of patterns) assert.ok(pattern.evidence.length > 0 && !pattern.evidence.includes('\n'));
});

test('패턴별 판단과 경계값, 성공·장시간·미확인 신호는 자동 차단하지 않는다', () => {
  assert.equal(decide(attack).action, 'block');
  assert.equal(decide({ ...attack, rule: { ...attack.rule, level: 9 } }).action, 'alert');
  assert.equal(decide({ ...attack, data: { ...attack.data, count: '19' } }).action, 'alert');
  assert.equal(decide({ ...attack, rule: { ...attack.rule, description: '2시간 동안 로그인 실패 100건입니다.' } }).action, 'alert');
  assert.equal(decide({ ...attack, rule: { ...attack.rule, description: '로그인 실패 48건 뒤에 성공했습니다.' } }).action, 'alert');
  assert.equal(decide({ ...attack, rule: { ...attack.rule, description: '로그인이 성공했습니다.' } }).action, 'record');
  assert.equal(decide({ ...attack, rule: { ...attack.rule, mitre: [] } }).action, 'alert');
  for (const alert of normal) assert.equal(decide(alert).action, 'record');
  assert.equal(decide(null).action, 'record');
  assert.equal(decide({ ...attack, data: { ...attack.data, count: 'Infinity' } }).action, 'alert');
});

test('시험 재생에서 명확한 후보만 거부 규칙이 되고 정상·애매한 주소는 통과한다', async () => {
  const root = await mkdtemp(join(tmpdir(), 'brute-force-'));
  try {
    let applied = 0;
    let falseBlocks = 0;
    for (const alert of [...fixture.alerts].sort((a,b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))) {
      const now = Date.parse(alert.timestamp);
      const [out] = await respond([alert], { root, mode: 'replay', now });
      if (out.installed) applied++;
      const rules = await loadRules({ root, mode: 'replay', now });
      const blocked = checkSourceIp(alert.data.srcip, rules, now).blocked;
      if (normal.includes(alert) && blocked) falseBlocks++;
      if (out.action === 'block') assert.equal(blocked, true);
      else assert.equal(blocked, false);
    }
    assert.equal(applied, 10);
    assert.equal(falseBlocks, 0);
    assert.deepEqual(await loadRules({ root, mode: 'live', now: at }), []);
    const logs = (await readFile(join(root, 'xdr', 'alerts.log'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(logs.length, 19);
    assert.equal(logs.filter(row => row.action === 'alert' && row.installed).length, 0);
    assert.ok(logs.every(row => row.mode === 'replay' && !Object.hasOwn(row, 'srcuser')));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('실제 연결 어댑터는 기존 판정, 만료, 중복·과거·미래 경보와 분리된 모드를 지킨다', async () => {
  const root = await mkdtemp(join(tmpdir(), 'brute-force-live-'));
  try {
    await respond([attack, attack], { root, now: at });
    const rules = await loadRules({ root, now: at });
    assert.equal(rules.length, 1);
    assert.equal(rules[0].alertIds.length, 1);
    assert.equal(checkSourceIp(attack.data.srcip, rules, at + 15 * 60 * 1000).blocked, false);
    assert.equal((await respond([attack], { root, now: at + 3600000 }))[0].installed, false);
    assert.equal((await respond([attack], { root, now: at - 3600000 }))[0].installed, false);
    await respond([attack], { root, now: at });
    const request = { schema: 'aleph.decision.v1', requestId: 'test-request' };
    const options = { root, clock: () => at, sourceIpForRequest: () => attack.data.srcip,
      denyResponse: (req, match) => ({ schema: 'aleph.decision.v1', requestId: req.requestId, decision: 'deny',
        reasonCode: 'xdr_brute_force', ruleIds: [match.ruleId] }) };
    // The custom reasonCode above belongs to the local test, not the real engine registry.
    const baseAllow = req => ({ schema: 'aleph.decision.v1', requestId: req.requestId,
      decision: 'allow', reasonCode: 'approved', ruleIds: ['existing.policy'] });
    assert.equal((await withBruteForce(baseAllow, options)(request)).decision, 'deny');
    const pass = withBruteForce(baseAllow, { ...options, sourceIpForRequest: () => normal[0].data.srcip });
    assert.deepEqual(await pass(request), baseAllow(request));
    const expired = withBruteForce(baseAllow, { ...options, clock: () => at + 900000 });
    assert.deepEqual(await expired(request), baseAllow(request));
    assert.deepEqual(await withBruteForce(existingDecide, options)(request), await existingDecide(request));
    assert.deepEqual(await createZtnaDecider(options)(request), await existingDecide(request));
    await assert.rejects(withBruteForce(baseAllow, { ...options, sourceIpForRequest: () => undefined })(request));
    await writeFile(join(root, 'xdr', 'brute-force', 'deny-rules.json'), '{broken');
    await assert.rejects(pass(request));
  } finally { await rm(root, { recursive: true, force: true }); }
});
