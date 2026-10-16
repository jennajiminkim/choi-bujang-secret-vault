# 보너스 xdr-03 · 알려진 취약점 악용 탐지

`read-alerts.mjs`는 원본을 변경하지 않고 시각·출발 주소·계정·수준·설명 다섯 항목만 JSONL로 출력합니다. 없는 계정은 빈 문자열이며 토큰·암호 표기는 가립니다. URL·머리글·full_log는 출력하지 않습니다.

`patterns.json`은 NVD/CVE-2021-44228과 MITRE ATT&CK T1190을 근거로 원격 JNDI 조회 형태, 점검 흔적, 약한 의심 신호를 구분합니다. 각 항목에 근거 한 줄과 출처가 있습니다. 도구 이름만으로 특정 제품이나 악용 성공을 추측하지 않습니다.

`decide.mjs` 맨 위에 같은 패턴 상수를 복사했습니다. 내보내는 함수는 decide(alert) 하나이며 다른 파일·패키지·네트워크·파일 작업·호출 간 상태가 없습니다. 정해진 요청 필드만 제한된 길이·깊이로 검사하고 URL 인코딩을 최대 3회 풉니다. 문자열을 실행하거나 원격 조회하지 않습니다. 반환 reason은 고정된 패턴 이름이고 원본 입력을 포함하지 않습니다.

완전한 원격 조회 구문과 T1190 근거, 규칙 수준 10 이상이 함께 있으면 확신도 0.97로 block 후보입니다. 완전한 구문이 있어도 근거·수준이 부족하면 0.75 alert, 도구 흔적은 0.6 alert, 약한 신호는 0.55 alert입니다. 일반 이벤트는 0.1 record입니다. 0.85 이상 block, 0.5 이상 alert 경계를 사용합니다. 이 수치는 학습 정책이며 통계적 확률이나 NVD가 정한 차단 기준이 아닙니다. 설명의 공격 단어만으로 block하지 않습니다. 모든 난독화·취약점 변종을 탐지하거나 대상 서버의 취약 버전·공격 성공을 확인하는 도구는 아닙니다.

## 실행 및 로컬 결과

```bash
node xdr/known-cve/read-alerts.mjs
npm run xdr:run -- known-cve
node xdr/known-cve/respond.mjs --replay
node --test test/known-cve.test.mjs
```

- 원본 경보 24건 / 읽기 24줄
- block 8 / alert 8 / record 8
- 정상 연습 이벤트(수준 3 이하·MITRE 태그 없음) 8건의 block 0건
- 재생에서 명확한 후보 8건만 적용, 애매한 8건은 알림만 기록
- 신규 시험 5개, 기존 XDR 시험 14개, 기존 판정기 연습 4항목 통과

시험 재생은 경보 시각을 시계로 사용합니다. 오래된 fixture를 오늘 시각으로 바꾸어 운영 차단을 생성하지 않습니다. 로그는 xdr/alerts.log에 mode/reason/경보 번호 등 메타데이터만 추가하며 원본·계정·토큰·요청 내용은 쓰지 않습니다. `deny-rules.json`, `replay-deny-rules.json`과 임시 파일·알림 로그는 Git에서 제외합니다. 결과 JSON에는 고정 이유와 경보 번호만 저장합니다.

## 기존 판정기에 추가하는 연결

`respond(alerts, options)`가 판단을 다시 계산하고 유효한 출발 IP·경보 번호·신선한 시각이 있는 block 후보만 15분 TTL의 추가 거부 파일에 넣습니다. 규칙 ID는 `xdr.known_cve.source_ip`입니다. 만료·중복·옛 경보·잘못된 주소를 검사하며 다른 XDR 규칙 파일은 수정하지 않습니다. 한 root는 한 writer가 직렬 처리해야 합니다.

`withKnownCve(baseDecide, options)`는 기존 판정 결과를 먼저 확인하고 추가 IP 거부만 적용합니다. 기존 deny는 유지하며 추가 검사가 자체 allow를 만들지 않습니다. `createZtnaDecider(options)`는 현재 src/decider.mjs와 연결하는 어댑터입니다. 운영 호스트가 sourceIpForRequest로 검증한 전송 출발 IP를 제공하고, denyResponse로 엔진에 등록된 거부 응답과 규칙 ID를 공급해야 합니다. 브라우저 입력·임의 헤더를 출발 주소로 믿지 않습니다.

현재 판정 요청 계약에는 출발 IP가 없고 운영 엔진의 추가 사유·규칙 등록 연결도 확인되지 않았습니다. 기존 RULE_IDS를 수정하지 않았으며 로컬 재생과 시험 정책 연결까지 검증했습니다. 실제 운영 차단·심판 통과는 아직 미확인입니다. Vercel의 임시 파일을 중앙 차단 저장소로 사용한다고 가정하지 않습니다.

공식 근거:
- https://nvd.nist.gov/vuln/detail/CVE-2021-44228
- https://www.cve.org/CVERecord?id=CVE-2021-44228
- https://attack.mitre.org/techniques/T1190/
