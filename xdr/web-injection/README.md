# 보너스 xdr-02 · 웹 주입 공격

## 만든 부품과 기준

- `read-alerts.mjs`: Wazuh 모양 연습 경보 26건을 시각·출발 주소·계정·규칙 수준·설명의 다섯 항목, JSONL 26줄로 읽습니다. 계정이 없으면 빈 문자열입니다. 원본·URL·full_log·토큰을 출력하지 않으며 지정된 비밀값 표기를 가립니다. 판단 모듈은 이 파일을 불러오지 않습니다.
- `patterns.json`: SQL 주입, 스크립트 주입, 경로 이탈, 명령 주입, 알림 전용 의심 신호에 대해 이름·조건·근거 한 줄과 공식 출처를 기록합니다.
- `decide.mjs`: 동일한 패턴 상수를 맨 위에 두고 `decide(alert)` 하나를 내보냅니다. import·패키지·파일 작업·네트워크·호출 간 상태가 없습니다. 반환은 `{action, confidence, reason}`이고 이유에는 고정 패턴 이름만 씁니다. 공격 문자열·실제 주소·계정·비밀값은 이유에 복사하지 않습니다.
- `respond.mjs`: 판단을 다시 계산하여 유효한 경보 번호·출발 IP·시각이 있는 신선한 block 후보만 만료 15분의 추가 IP 거부 규칙으로 저장합니다. 알림은 기존 `xdr/alerts.log`에 `moduleKey: web-injection`을 붙여 JSON 한 줄씩 추가합니다. 원본이나 URL·계정은 로그에 쓰지 않습니다.
- `result.json`: 기존 `xdr:run` 실행기가 만든 판단 결과입니다. fixture와 실행기는 바꾸지 않았습니다.

**0.85 이상 block, 0.5 이상 alert, 그 아래 record**입니다. 명확한 형태·T1190 태그·규칙 수준 10 이상·같은 주소의 집계 반복 5건 이상을 함께 확인해야 block 후보가 됩니다. 단일 시도나 수업명·부정 설명은 자동 차단하지 않습니다. SQL 단어·따옴표·구분자 하나만으로 공격을 확정하지 않습니다. T1190 또는 경보 수준만으로도 block하지 않습니다.

5건·수준 10·확신도 값은 이 과제의 학습용 정책이며 MITRE가 정한 보편적인 수치나 통계 확률이 아닙니다. MITRE T1190을 외부 공개 앱 악용의 상위 근거로 쓰고, 스크립트와 명령 주입의 구체적 형태는 MITRE CWE-79·CWE-78로 보강했습니다. 스크립트 표기가 곧 초기 침투 성공을 뜻하지는 않습니다.

fixture의 URL은 `doc-sql-chain`처럼 실제 공격을 실행하지 않는 문서용 표기입니다. 판단은 신뢰된 경보 요약과 집계 건수에 근거합니다. 요청 인자가 있는 경우 SQL 구조·script 태그·경로 이탈을 제한된 길이에서 확인하고 URL 인코딩을 최대 세 번만 풉니다. 입력을 실행하거나 서버에 보내지 않습니다. 모든 웹 공격·인코딩 변종을 탐지하는 WAF를 구현했다고 주장하지 않습니다.

경보 한 건의 count는 같은 출발 IP에 대해 수집기가 집계한 건수여야 합니다. 경보마다 독립 판단하므로 다른 경보의 count를 합산하지 않습니다. 단일 HTTP 요청의 원시 로그 집계·실시간 Wazuh 수집·중앙 규칙 저장소는 별도 연결이 필요합니다.

## 다시 실행과 직접 확인

```bash
node xdr/web-injection/read-alerts.mjs
npm run xdr:run -- web-injection
npm run xdr:respond:web
npm run test:xdr
```

GitHub에서 `xdr/web-injection/result.json`을 열면 **block 8·alert 9·record 9**가 보입니다. 경보 26건과 읽기 출력 26줄이 같습니다. 수준 3 이하·MITRE 태그 없음인 정상 연습 경보 9건의 block은 **0건**입니다. 애매한 경보 9건은 알림만 남고 거부 규칙을 만들지 않았습니다. 이는 로컬 자기 점검이며 심판의 비공개 정답 확인이 아닙니다.

`npm run xdr:respond:web`는 옛 fixture를 시간순으로 시험 재생하며 각 경보 시각을 시계로 사용합니다. 명확한 후보 8건에 차단 규칙을 적용했습니다. `replay-deny-rules.json`과 `mode: replay` 로그를 만들고 실제 `deny-rules.json`은 변경하지 않습니다. 마지막 경보 시각에는 앞선 규칙이 만료되어 목록이 비어 있을 수 있습니다. 옛 경보를 오늘 시각으로 바꾸어 현재 차단을 생성하지 않습니다.

`npm run test:xdr`는 기존 시험 8개와 웹 주입 시험 6개를 함께 실행하며 **총 14개 통과**입니다. 원본 보존, 비밀값 가리기, 단독 파일 실행, 순서 독립성, 패턴 상수 일치, 반복 기준 경계값, 단일·수업 단어·이중 인코딩, 정상 통과, 15분 만료, 중복·과거·미래 경보, 두 보너스 규칙 분리와 결합을 확인했습니다. 시험의 SQL·스크립트 문자열은 로컬 텍스트이며 실행하거나 외부로 전송하지 않았습니다.

## 기존 ZTNA와 연결

`respond(alerts, {root, mode: 'live', now})`는 신뢰된 서버 경보에 쓰는 함수입니다. `xdr/web-injection/deny-rules.json`에 `ruleId`, `action: deny`, `sourceIp`, `createdAt`, `expiresAt`, `alertIds`를 저장합니다. 경보 발생으로부터 최대 15분만 적용하고 주소·번호·신선도를 확인합니다. 최대 5초 미래 시각은 시계 오차로 인정하되 유효기간은 현재 시각부터 15분을 넘지 않습니다. 한 규칙 저장 경로는 한 responder 프로세스만 쓰도록 운영합니다.

`createZtnaDecider(options)`는 이 저장소의 기존 `src/decider.mjs`를 연결합니다. `withWebInjection(baseDecide, options)`는 기존 정책 또는 다른 추가 검사와 합칠 수 있는 팩터리입니다. 기존 deny는 유지하고, 차단 IP의 allow·step_up만 deny로 바꾸며, 비차단 요청은 기존 응답을 그대로 반환합니다. 자체적으로 allow를 만들지 않습니다. 첫 번째 보너스의 `withBruteForce`와 겹쳐 연결하는 시험도 통과했습니다.

options는 엔진이 확인한 서버 측 주소를 조회하는 `sourceIpForRequest`, 등록된 reasonCode와 `xdr.web_injection.source_ip` 규칙 ID로 계약의 다섯 항목을 반환하는 `denyResponse`, 규칙 저장소 `root`를 받습니다. 기본은 `mode: live`, `clock: Date.now`입니다. replay 및 시계 대체는 로컬 시험 전용입니다. 확인된 주소가 없거나 규칙 파일이 깨졌다면 예외가 나며 호스트는 접속을 거부해야 합니다. 아직 파일이 없으면 추가 규칙은 0건입니다.

**운영 엔진 연결은 아직 미완료입니다.** 현재 18개 요청 항목에는 출발 IP가 없고 신뢰된 주소 전달·XDR 사유 코드 등록·실제 호스트 진입점 연결이 제공되지 않았습니다. `request.srcip` 등 임의 항목이나 브라우저 헤더를 추가하지 않았습니다. 어댑터를 구현하고 로컬에서 시험했지만 실제 운영 차단이나 Vercel API 보호가 연결됐다고 보고하지 않습니다.

기존 ZTNA의 `starter.deny`는 모든 요청을 거부하는 시작점 그대로입니다. 정상 통과 시험은 정상 요청을 허용하는 로컬 정책에 추가 검사를 붙여 확인한 결과이며 현재 운영 판정기의 정상 허용을 뜻하지 않습니다.

## 보존과 저장점

첫 번째 보너스의 모든 파일·시험 경보, 기존 ZTNA 규칙, 로그인·API·DB 설정 및 `aleph.config.json`의 5단계·judgeIssuer를 보존했습니다. 실제·시험 규칙과 공유 알림 로그는 Git에서 제외합니다. 저장점 메시지는 **보너스 xdr-02 저장점**입니다.

근거:

- https://attack.mitre.org/techniques/T1190/
- https://cwe.mitre.org/data/definitions/79.html
- https://cwe.mitre.org/data/definitions/78.html
