import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { decide } from '../xdr/web-injection/decide.mjs';
import { extractAlerts } from '../xdr/web-injection/read-alerts.mjs';
import { respond, loadRules, checkSourceIp, withWebInjection, createZtnaDecider } from '../xdr/web-injection/respond.mjs';
import { respond as respondBrute, loadRules as loadBrute, withBruteForce } from '../xdr/brute-force/respond.mjs';
import { decide as existingDecide } from '../src/decider.mjs';

const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/web-injection.json', import.meta.url), 'utf8'));
const normal = fixture.alerts.filter(alert => alert.rule.level <= 3 && alert.rule.mitre.length === 0);
const attack = fixture.alerts.find(alert => /SQL 구문/.test(alert.rule.description) && Number(alert.data.count) >= 5);
const at = Date.parse(attack.timestamp);
const allow = request => ({ schema: 'aleph.decision.v1', requestId: request.requestId, decision: 'allow',
  reasonCode: 'approved', ruleIds: ['existing.policy'] });
// This reason is for the local simulation only, not a registration in the real engine.
const denyResponse = (request, match) => ({ schema: 'aleph.decision.v1', requestId: request.requestId,
  decision: 'deny', reasonCode: 'xdr_web_injection', ruleIds: [match.ruleId] });

test('웹 경보 26건을 다섯 항목 26줄로 읽고 계정 누락과 비밀값을 안전하게 처리한다', () => {
  const rows = extractAlerts(fixture.alerts);
  assert.equal(rows.length, 26);
  assert.deepEqual(Object.keys(rows[0]), ['timestamp', 'sourceIp', 'account', 'level', 'description']);
  assert.equal(rows[0].account, '');
  const altered = { ...attack, data: { ...attack.data, srcuser: 'password=not-for-output', token: 'not-for-output' },
    full_log: 'not-for-output', rule: { ...attack.rule, description: 'token="not-for-output"\nsecret=not-for-output' } };
  assert.ok(!JSON.stringify(extractAlerts([altered])).includes('not-for-output'));
});

test('웹 판단은 JSON 패턴과 같고 고립된 파일에서 순서와 무관하게 실행된다', async () => {
  const source = await readFile(new URL('../xdr/web-injection/decide.mjs', import.meta.url), 'utf8');
  const patterns = JSON.parse(await readFile(new URL('../xdr/web-injection/patterns.json', import.meta.url), 'utf8'));
  assert.deepEqual(JSON.parse(vm.runInNewContext(`${source.replace('export function decide','function decide')}\nJSON.stringify(PATTERNS)`)), patterns);
  assert.ok(!/\bimport\b\s*(?:\(|[{'"*])|\b(?:fetch|readFile|writeFile|require)\s*\(/.test(source));
  const context = vm.createContext({});
  vm.runInContext(`${source.replace('export function decide','function decide')}\nthis.evaluate=decide;`, context);
  for (const alert of fixture.alerts.toReversed()) {
    assert.deepEqual(JSON.parse(JSON.stringify(context.evaluate(alert))), decide(alert));
  }
  assert.ok(patterns.every(pattern => pattern.evidence && !pattern.evidence.includes('\n')));
});

test('명확한 반복만 block이고 단일 표기·수업명·잘못된 건수는 자동 차단하지 않는다', () => {
  assert.equal(decide(attack).action, 'block');
  assert.equal(decide({ ...attack, data: { ...attack.data, count: '4' } }).action, 'alert');
  assert.equal(decide({ ...attack, data: { ...attack.data, count: '5' } }).action, 'block');
  assert.equal(decide({ ...attack, data: { ...attack.data, count: 'Infinity' } }).action, 'alert');
  assert.equal(decide({ ...attack, rule: { ...attack.rule, level: 9 } }).action, 'alert');
  assert.equal(decide({ ...attack, rule: { ...attack.rule, mitre: [] } }).action, 'alert');
  assert.equal(decide({ ...attack, rule: { ...attack.rule, description: 'SQL 구문을 수업에서 검색했습니다.' } }).action, 'alert');
  const basic = { ...normal[0], rule: { ...normal[0].rule, description: '일반 검색' }, data: { ...normal[0].data, count: '20' } };
  for (const url of ['/search?q=select-course','/search?q=script-class','/files?name=up-notes',"/search?q=O'Brien"]) {
    assert.equal(decide({ ...basic, data: { ...basic.data, url } }).action, 'record');
  }
  // Safe text fixtures only; these are never sent to a server or executed.
  for (const query of ['SELECT item FROM demo','<script>demo</script>','../../demo']) {
    const url = `/search?q=${encodeURIComponent(encodeURIComponent(query))}`;
    const sample = { ...attack, rule: { ...attack.rule, description: '같은 주소의 인자 표기가 반복됐습니다.' }, data: { ...attack.data, url } };
    assert.equal(decide(sample).action, 'block');
    assert.equal(decide({ ...sample, data: { ...sample.data, count: '1' } }).action, 'alert');
  }
  assert.equal(decide(null).action, 'record');
  assert.equal(decide({ ...basic, data: { ...basic.data, url: '/search?q=%FF%ZZ' } }).action, 'record');
});

test('웹 경보 재생은 후보 8건만 적용하고 애매한·정상 주소를 차단하지 않는다', async () => {
  const root = await mkdtemp(join(tmpdir(), 'web-injection-replay-'));
  try {
    const counts = { block: 0, alert: 0, record: 0 };
    let installed = 0;
    let falseBlocks = 0;
    for (const alert of [...fixture.alerts].sort((a,b) => Date.parse(a.timestamp)-Date.parse(b.timestamp))) {
      const now = Date.parse(alert.timestamp);
      const [out] = await respond([alert], { root, mode: 'replay', now });
      counts[out.action]++;
      installed += Number(out.installed);
      const blocked = checkSourceIp(alert.data.srcip, await loadRules({ root, mode: 'replay', now }), now).blocked;
      if (normal.includes(alert) && blocked) falseBlocks++;
      assert.equal(blocked, out.action === 'block');
    }
    assert.deepEqual(counts, { block: 8, alert: 9, record: 9 });
    assert.equal(installed, 8);
    assert.equal(falseBlocks, 0);
    assert.deepEqual(await loadRules({ root, mode: 'live', now: at }), []);
    const logs = (await readFile(join(root,'xdr','alerts.log'),'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(logs.length, 17);
    assert.equal(logs.filter(log => log.action === 'alert' && log.installed).length, 0);
    assert.ok(logs.every(log => log.moduleKey === 'web-injection' && log.mode === 'replay' && !Object.hasOwn(log,'url')));
  } finally { await rm(root, { recursive:true, force:true }); }
});

test('만료·중복·잘못된 주소·옛 경보를 검사하고 기존 정책과 등록 응답 계약을 유지한다', async () => {
  const root = await mkdtemp(join(tmpdir(), 'web-injection-live-'));
  try {
    await respond([attack,attack],{ root, now:at });
    const rules = await loadRules({ root, now:at });
    assert.equal(rules.length, 1);
    assert.equal(rules[0].alertIds.length, 1);
    assert.equal(checkSourceIp(attack.data.srcip,rules,at+900000).blocked,false);
    assert.equal((await respond([attack],{root,now:at+3600000}))[0].installed,false);
    assert.equal((await respond([attack],{root,now:at-3600000}))[0].installed,false);
    assert.equal((await respond([{...attack,data:{...attack.data,srcip:'invalid'}}],{root,now:at}))[0].installed,false);
    const nearFuture={...attack,timestamp:new Date(at+5000).toISOString()};
    assert.equal((await respond([nearFuture],{root,now:at}))[0].installed,true);
    assert.equal((await loadRules({root,now:at})).length,1);
    await respond([attack],{root,now:at});
    const request={schema:'aleph.decision.v1',requestId:'demo-request'};
    const options={root,clock:()=>at,sourceIpForRequest:()=>attack.data.srcip,denyResponse};
    assert.equal((await withWebInjection(allow,options)(request)).decision,'deny');
    const pass=withWebInjection(allow,{...options,sourceIpForRequest:()=>normal[0].data.srcip});
    assert.deepEqual(await pass(request),allow(request));
    assert.deepEqual(await createZtnaDecider(options)(request),await existingDecide(request));
    const stepUp=req=>({...allow(req),decision:'step_up'});
    assert.equal((await withWebInjection(stepUp,options)(request)).decision,'deny');
    assert.deepEqual(await withWebInjection(stepUp,{...options,sourceIpForRequest:()=>normal[0].data.srcip})(request),stepUp(request));
    await assert.rejects(withWebInjection(allow,{...options,sourceIpForRequest:()=>undefined})(request));
    await writeFile(join(root,'xdr','web-injection','deny-rules.json'),'{bad');
    await assert.rejects(pass(request));
  } finally { await rm(root, {recursive:true,force:true}); }
});

test('첫 보너스와 규칙을 분리하고 두 추가 검사를 겹쳐도 정상 요청과 기존 거부를 보존한다', async () => {
  const root=await mkdtemp(join(tmpdir(),'xdr-combined-'));
  try {
    const brute=JSON.parse(await readFile(new URL('../xdr/fixtures/brute-force.json',import.meta.url),'utf8'));
    const bruteAttack=brute.alerts.find(alert=>Number(alert.data.count)>=40 && alert.data.srcip!==attack.data.srcip);
    const now=Math.max(at,Date.parse(bruteAttack.timestamp));
    const webAttack={...attack,timestamp:new Date(now).toISOString()};
    await respondBrute([bruteAttack],{root,now});
    const before=await loadBrute({root,now});
    await respond([webAttack],{root,now});
    assert.deepEqual(await loadBrute({root,now}),before);
    let ip=normal[0].data.srcip;
    const options={root,clock:()=>now,sourceIpForRequest:()=>ip,denyResponse};
    const combined=withWebInjection(withBruteForce(allow,options),options);
    const request={schema:'aleph.decision.v1',requestId:'combined'};
    assert.deepEqual(await combined(request),allow(request));
    ip=webAttack.data.srcip;
    assert.deepEqual((await combined(request)).ruleIds,['xdr.web_injection.source_ip']);
    ip=bruteAttack.data.srcip;
    assert.deepEqual((await combined(request)).ruleIds,['xdr.brute_force.source_ip']);
  } finally { await rm(root,{recursive:true,force:true}); }
});
