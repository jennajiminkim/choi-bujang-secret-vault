const PATTERNS = [
  {
    "name": "Log4Shell 원격 조회 구문",
    "condition": "요청 머리글·URL·인자에 완전한 ${jndi:원격프로토콜://대상} 형태가 있고 수준 10 이상과 T1190 근거가 함께 있으면 block 후보. 낮은 수준·근거 누락·불완전 구문은 alert만 한다.",
    "evidence": "CVE-2021-44228은 로그 메시지·인자의 공격자 제어 LDAP 등 JNDI 조회로 원격 코드 실행이 가능한 취약점이다.",
    "sources": [
      "https://nvd.nist.gov/vuln/detail/CVE-2021-44228",
      "https://www.cve.org/CVERecord?id=CVE-2021-44228"
    ],
    "thresholds": {
      "highLevel": 10,
      "alertLevel": 5
    }
  },
  {
    "name": "취약점 점검 흔적",
    "condition": "수준 5 이상 T1190 경보에서 취약점 점검 도구·탐색 흔적 요약이 있으면 alert. 도구 이름만으로 block하지 않는다. 완전한 악용 구문은 첫 패턴으로 평가한다.",
    "evidence": "MITRE T1190은 공개 앱 취약점 악용과 관련 요청·로그의 이상 징후를 설명하며 탐색 흔적만으로 악용 성공을 증명하지 않는다.",
    "sources": [
      "https://attack.mitre.org/techniques/T1190/"
    ]
  },
  {
    "name": "알려진 취약점 의심 신호",
    "condition": "완전한 원격 조회 구문이 없어도 수준 5 이상 T1190 경보이거나 요청에 CVE-2021-44228·Log4Shell·JNDI 의심 표기가 있으면 alert. 일반 이벤트는 record.",
    "evidence": "CVE-2021-44228의 핵심은 JNDI 조회이므로 취약점 이름이나 단어 검색만으로 원격 코드 실행을 확정할 수 없다.",
    "sources": [
      "https://nvd.nist.gov/vuln/detail/CVE-2021-44228"
    ]
  }
];

function answer(confidence, reason) {
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record', confidence, reason };
}
function decode(value) {
  let text = typeof value === 'string' ? value.slice(0, 8192) : '';
  for (let i = 0; i < 3; i++) {
    try { const next = decodeURIComponent(text); if (next === text) break; text = next; }
    catch { break; }
  }
  return text;
}
function strings(value, depth = 0) {
  if (typeof value === 'string') return [decode(value)];
  if (!value || typeof value !== 'object' || depth >= 2) return [];
  return Object.values(value).slice(0, 32).flatMap(item => strings(item, depth + 1));
}
export function decide(alert) {
  if (!alert || typeof alert !== 'object' || Array.isArray(alert)) return answer(0, '일반 이벤트');
  const data = alert.data || {};
  // Inspect request fields only; descriptions cannot create a confirmed payload.
  const fields = ['url', 'useragent', 'user_agent', 'headers', 'args', 'params', 'query'];
  const request = fields.flatMap(key => strings(data[key]));
  const complete = request.some(text => /\$\{\s*jndi\s*:\s*(?:ldaps?|rmi|dns):\/\/[^\s{}/?#]+[^\s{}]*\}/i.test(text));
  const levelRaw = alert.rule?.level;
  const level = (typeof levelRaw === 'number' || (typeof levelRaw === 'string' && /^\d+$/.test(levelRaw))) ? Number(levelRaw) : 0;
  const mitre = alert.rule?.mitre;
  const tags = Array.isArray(mitre) ? mitre : Array.isArray(mitre?.id) ? mitre.id : [];
  const t1190 = tags.includes('T1190');
  if (complete) return answer(t1190 && Number.isFinite(level) && level >= PATTERNS[0].thresholds.highLevel ? 0.97 : 0.75, PATTERNS[0].name);
  const description = decode(alert.rule?.description);
  const tool = /취약점.*점검|점검 도구|vulnerability.?scan|log4shell.?scan/i.test(description);
  if (t1190 && level >= 5 && tool) return answer(0.6, PATTERNS[1].name);
  const weak = request.some(text => /jndi|CVE-2021-44228|log4shell/i.test(text));
  if ((t1190 && level >= 5) || weak) return answer(0.55, PATTERNS[2].name);
  return answer(0.1, '일반 이벤트');
}
