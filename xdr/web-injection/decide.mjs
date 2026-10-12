// Standalone evaluator: no imports, I/O, network or cross-alert state.
const PATTERNS = [
  {
    "name": "SQL 주입 형태",
    "condition": "요청 인자의 이어 붙인 SQL, UNION SELECT 또는 SELECT ... FROM 형태나 경보의 SQL 주입 요약. 확인된 같은 출발 주소의 집계 건수 5 이상, 수준 10 이상, T1190 경보에서 명확한 형태이면 차단 후보. 단일·수업명·부정 설명은 알림으로만 처리.",
    "evidence": "MITRE ATT&CK T1190은 외부 공개 앱을 통한 SQL 주입 악용 사례를 설명한다.",
    "sources": [
      "https://attack.mitre.org/techniques/T1190/"
    ],
    "thresholds": {
      "highLevel": 10,
      "minRepeat": 5,
      "alertLevel": 5
    }
  },
  {
    "name": "스크립트 주입 형태",
    "condition": "요청 인자의 script 태그, 이벤트 처리 속성 또는 경보의 스크립트 삽입 요약. 확인된 같은 출발 주소의 집계 건수 5 이상, 수준 10 이상, T1190 경보에서 명확한 형태이면 차단 후보. 단일·수업명·부정 설명은 알림으로만 처리.",
    "evidence": "MITRE T1190의 외부 공개 앱 악용 범위에서 CWE-79는 입력에 섞인 클라이언트 스크립트의 실행 위험을 설명한다.",
    "sources": [
      "https://attack.mitre.org/techniques/T1190/",
      "https://cwe.mitre.org/data/definitions/79.html"
    ],
    "thresholds": {
      "highLevel": 10,
      "minRepeat": 5,
      "alertLevel": 5
    }
  },
  {
    "name": "경로 이탈 형태",
    "condition": "요청 인자의 ../ 또는 ..\\ 표기와 경보의 다단계 경로 이탈 요약. 확인된 같은 출발 주소의 집계 건수 5 이상, 수준 10 이상, T1190 경보에서 명확한 형태이면 차단 후보. 단일·수업명·부정 설명은 알림으로만 처리.",
    "evidence": "MITRE ATT&CK T1190은 directory traversal 취약점을 악용한 외부 공개 앱 침투 사례를 설명한다.",
    "sources": [
      "https://attack.mitre.org/techniques/T1190/"
    ],
    "thresholds": {
      "highLevel": 10,
      "minRepeat": 5,
      "alertLevel": 5
    }
  },
  {
    "name": "명령 주입 형태",
    "condition": "경보에 명령 구분자의 연속 요청 요약이 있으면 확인. 요청 인자의 구분자 하나만으로는 차단하지 않음. 확인된 같은 출발 주소의 집계 건수 5 이상, 수준 10 이상, T1190 경보에서 명확한 형태이면 차단 후보. 단일·수업명·부정 설명은 알림으로만 처리.",
    "evidence": "MITRE T1190은 명령 주입을 통한 공개 앱 악용 사례를, CWE-78은 입력에 섞인 OS 명령 해석 위험을 설명한다.",
    "sources": [
      "https://attack.mitre.org/techniques/T1190/",
      "https://cwe.mitre.org/data/definitions/78.html"
    ],
    "thresholds": {
      "highLevel": 10,
      "minRepeat": 5,
      "alertLevel": 5
    }
  },
  {
    "name": "웹 주입 의심 신호",
    "condition": "T1190 표기가 있는 수준 5 이상 경보에서 따옴표·공격 단어·긴 주소·단일 주입 의심 등은 확인 알림만 남김. 이 조건만으로 block하지 않음.",
    "evidence": "MITRE T1190은 비정상 요청 형태와 앱 로그를 함께 확인하도록 설명하며 단어 하나만으로 공격 성공을 확정하지 않는다.",
    "sources": [
      "https://attack.mitre.org/techniques/T1190/"
    ],
    "thresholds": {
      "highLevel": 10,
      "minRepeat": 5,
      "alertLevel": 5
    }
  }
];

function answer(confidence, reason) {
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record', confidence, reason };
}

function countOf(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return 0;
  if (typeof value === 'string' && !/^\d+$/.test(value)) return 0;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

// Decode only bounded text, never execute or echo the request contents.
function decode(value) {
  if (typeof value !== 'string') return '';
  let text = value.slice(0, 8192).replace(/\+/g, ' ');
  for (let i = 0; i < 3; i++) {
    const next = text.replace(/(?:%[a-f0-9]{2})+/gi, part => {
      try { return decodeURIComponent(part); } catch { return part; }
    });
    if (next === text) break;
    text = next;
  }
  return text;
}

export function decide(alert) {
  if (!alert || typeof alert !== 'object' || Array.isArray(alert)) return answer(0, '일치 패턴 없음');
  const rule = alert.rule || {};
  const data = alert.data || {};
  const description = typeof rule.description === 'string' ? rule.description.slice(0, 2000) : '';
  const level = countOf(rule.level);
  const count = countOf(data.count);
  const mitre = Array.isArray(rule.mitre) ? rule.mitre : rule.mitre?.id;
  const tagged = Array.isArray(mitre) && mitre.includes('T1190');
  const url = typeof data.url === 'string' ? data.url : '';
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  const parameters = [query, data.query, data.body].map(decode).join(' ');
  const sqlText = /\bunion\s+(?:all\s+)?select\b|\bselect\s+[^;&]{1,150}\s+from\s+[a-z_]|\b(?:or|and)\s+['"]?\d+['"]?\s*=\s*['"]?\d+|;\s*(?:select|drop|insert|update|delete)\b/i.test(parameters);
  const scriptText = /<\s*script\b|<[^>]{0,200}\bon[a-z]+\s*=|javascript\s*:/i.test(parameters);
  const traversalText = /\.\.[/\\]/.test(`${decode(url.split('?')[0])} ${parameters}`);
  const sqlSummary = /SQL\s*(?:구문|주입|표식)|데이터베이스 조회를 이어 붙/i.test(description);
  const scriptSummary = /스크립트\s*(?:삽입|표식|표기)|script injection|cross.site scripting/i.test(description);
  const traversalSummary = /경로.*(?:거슬러 올라|이탈)|path traversal|directory traversal/i.test(description);
  // A raw semicolon or ampersand is insufficient; require a trusted injection summary for commands.
  const commandSummary = /명령\s*(?:구분자|주입)|command injection/i.test(description);
  const matches = [sqlText || sqlSummary, scriptText || scriptSummary, traversalText || traversalSummary, commandSummary];
  const names = matches.map((match, index) => match ? PATTERNS[index].name : null).filter(Boolean);
  const reason = names.length ? names.join(' + ') : PATTERNS[4].name;
  const contextual = /수업|공지 제목|삽입 표식은 아닙|공격 표기는 없|정상 조회|class(?:room)?|course/i.test(description);
  const notRepeated = /반복(?:은|이)?\s*없|반복되지|한 번|1건|single|not repeated/i.test(description);
  const repeated = count >= PATTERNS[0].thresholds.minRepeat && !notRepeated;
  const hasSource = typeof data.srcip === 'string' && data.srcip.length > 0;
  if (names.length && tagged && level >= PATTERNS[0].thresholds.highLevel && hasSource && repeated && !contextual) {
    return answer(names.length > 1 ? 0.95 : 0.9, reason);
  }
  if (names.length) return answer(0.65, reason);
  if (tagged && level >= PATTERNS[4].thresholds.alertLevel) return answer(0.55, PATTERNS[4].name);
  return answer(0.1, '일치 패턴 없음');
}
