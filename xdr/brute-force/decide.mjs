// Same patterns as patterns.json; deliberately no imports, I/O, state or network.
const PATTERNS = [
  {
    name: '반복 비밀번호 추측',
    condition: 'T1110 계열 로그인 실패 또는 비밀번호 추측 경보. 수준 10 이상이며 40건 이상이거나, 5분 이내 20건 이상이거나, 다수 계정을 규칙적으로 또는 이름을 바꿔 시도한 20건 이상이면 명확한 후보. 긴 시간대·상충 신호는 알림으로 낮춤.',
    evidence: 'MITRE ATT&CK T1110.001은 반복적·순차적 비밀번호 추측과 같은 계정 또는 여러 계정의 인증 실패 상관분석을 설명한다.',
    source: 'https://attack.mitre.org/techniques/T1110/001/',
    thresholds: { highLevel: 10, highCount: 40, burstCount: 20, windowSeconds: 300, alertCount: 3 },
  },
  {
    name: '여러 계정 비밀번호 스프레이',
    condition: '같은 비밀번호를 여러 계정에 대입했다는 경보 요약이 있고 T1110 계열·수준 10 이상이며 대상 계정이 5개 이상이면 명확한 후보. 비밀번호 원문은 읽거나 비교하지 않음.',
    evidence: 'MITRE ATT&CK T1110.003은 하나 또는 소수의 비밀번호를 여러 계정에 시도하는 Password Spraying을 설명한다.',
    source: 'https://attack.mitre.org/techniques/T1110/003/',
    thresholds: { highLevel: 10, minAccounts: 5 },
  },
];

function answer(confidence, reason) {
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record', confidence, reason };
}

function positiveNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return 0;
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value)) return 0;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function decide(alert) {
  if (!alert || typeof alert !== 'object' || Array.isArray(alert)) return answer(0, '일치 패턴 없음');
  const data = alert.data || {};
  const rule = alert.rule || {};
  const description = typeof rule.description === 'string' ? rule.description.slice(0, 2000) : '';
  const level = positiveNumber(rule.level);
  const count = positiveNumber(data.count);
  const mitre = Array.isArray(rule.mitre) ? rule.mitre : rule.mitre?.id;
  const tagged = Array.isArray(mitre) && mitre.some(id => typeof id === 'string' && /^T1110(?:\.\d{3})?$/.test(id));
  const failure = /실패|failed|failure|invalid password/i.test(description);
  const samePassword = /같은 비밀번호|동일한? 비밀번호|same password|identical password/i.test(description);
  const accountText = typeof data.accounts === 'string' ? data.accounts.split(',') : [];
  const accounts = new Set(accountText.map(value => value.trim()).filter(Boolean)).size;
  const describedAccounts = positiveNumber(description.match(/계정\s*(\d+)개/)?.[1]);
  const multipleAccounts = accounts >= 2 || describedAccounts >= 2 || /여러 계정|서로 다른 계정|계정 이름을 바꿔|multiple accounts/i.test(description);
  const spray = samePassword && multipleAccounts && /실패|연속|이어졌|failed|failure|attempt/i.test(description);
  const guesses = failure || spray;
  const pattern = spray ? PATTERNS[1] : PATTERNS[0];
  if (!guesses) return answer(0, '일치 패턴 없음');
  if (!tagged) return answer(count >= 3 || spray ? 0.55 : 0.15, count >= 3 || spray ? pattern.name : '일치 패턴 없음');

  // A later success does not disprove compromise, but makes automatic IP blocking less certain.
  const laterSuccess = /뒤에?\s*성공|그 뒤 성공|성공했습니다|followed by.*success/i.test(description);
  const irregular = /고르지|불규칙|irregular/i.test(description);
  const guessedWindow = description.match(/(\d+(?:\.\d+)?)\s*(초|분|시간|일)\s*(?:안|동안|이내)/);
  const units = { '초': 1, '분': 60, '시간': 3600, '일': 86400 };
  const explicitWindow = positiveNumber(data.window_seconds);
  const window = explicitWindow || (guessedWindow ? Number(guessedWindow[1]) * units[guessedWindow[2]] : 0);
  const longWindow = window > PATTERNS[0].thresholds.windowSeconds;
  const hasSource = typeof data.srcip === 'string' && data.srcip.length > 0;
  const hasAccount = typeof data.srcuser === 'string' && data.srcuser.length > 0;
  if (tagged && level >= pattern.thresholds.highLevel && hasSource && hasAccount && !laterSuccess && !irregular && !longWindow) {
    if (spray && Math.max(accounts, describedAccounts, count) >= PATTERNS[1].thresholds.minAccounts) return answer(0.95, pattern.name);
    const t = PATTERNS[0].thresholds;
    const repeatedAccounts = multipleAccounts && /같은 간격|이름을 바꿔|regular|systematic/i.test(description);
    if (failure && (count >= t.highCount || (count >= t.burstCount && ((window > 0 && window <= t.windowSeconds) || repeatedAccounts)))) {
      return answer(0.9, PATTERNS[0].name);
    }
  }
  if (count >= PATTERNS[0].thresholds.alertCount || spray || (failure && level >= 5)) return answer(0.6, pattern.name);
  return answer(0.2, '일치 패턴 없음');
}
