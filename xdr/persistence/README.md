# 보너스 xdr-04 · 몰래 심어진 프로그램 탐지

`read-alerts.mjs`는 Wazuh 경보에서 시각·출발 주소·계정·규칙 수준·설명만 읽어 JSONL로 출력합니다. 원본, 실행 경로, full_log, 토큰은 출력하지 않고 다섯 항목에 포함된 비밀값 표기도 가립니다. 원본 fixture는 변경하지 않습니다.

`patterns.json`은 T1543 서비스 생성·변경, T1053 예약 작업, T1547.001 시작 폴더에 대해 이름·조건·근거 한 줄·출처를 기록합니다. 시작 폴더 자체는 T1543이 아닌 T1547.001로 근거를 보강했습니다. fixture의 T1543 태그를 임의로 수정하지 않고 실제 Startup 경로·추가·목록 이탈 요약을 함께 확인합니다.

`decide.mjs` 상단의 PATTERNS는 JSON과 같습니다. export는 decide(alert) 하나이며 import·외부 패키지·파일·네트워크·호출 간 상태가 없습니다. description과 path는 제한된 길이만 검사하며 입력을 실행하거나 reason에 복사하지 않습니다. 반환은 {action, confidence, reason}입니다.

- T1543 계열: 새 서비스·실행 파일 변경, 서명 없음 또는 평소 목록 이탈, 임시 폴더 실행 파일이 겹치고 수준 10 이상이면 0.95 block 후보입니다. 경로가 없어도 서명 없는 서비스 등록 집계 3건 이상을 확인하면 후보입니다.
- T1053 계열: 낯선·임의 이름의 작업 또는 시작 프로그램과 같은 파일을 가리키는 작업, 임시 실행 파일, 수준 10 이상이면 0.94 block 후보입니다.
- 실제 Startup 경로의 목록 밖 실행 파일 추가, 관련 기법 태그와 수준 10 이상이면 0.93 block 후보입니다.
- 서명 미확인·설명만 변경·실행 근거 없는 변경·단순 임시 파일 생성은 0.6 alert입니다. 서명 미확인을 서명 없음으로 간주하지 않습니다. 일반 이벤트는 0.1 record입니다.

0.85 이상 block, 0.5 이상 alert, 나머지 record입니다. 수치·반복 기준은 학습용 정책이며 MITRE가 정한 확률이나 보편적인 격리 기준이 아닙니다. 서명이 있다는 사실도 단독 안전 보증이 아닙니다.

이 모듈은 실제 파일 서명을 검증하거나 기준 목록을 수집하는 에이전트가 아닙니다. 신뢰된 수집기의 목록 비교·서명 검사·집계 요약을 읽습니다. 없는 기준 목록을 정상값으로 채우지 않고 충분한 요약이 없으면 자동 격리하지 않습니다. 운영에서는 승인된 목록과 Wazuh/FIM 수집 검증이 필요합니다.

## 실행과 확인

```bash
node xdr/persistence/read-alerts.mjs
npm run xdr:run -- persistence
node xdr/persistence/respond.mjs --replay
node --test test/persistence.test.mjs
```

로컬 fixture 24건/읽기 24줄, block 8·alert 8·record 8입니다. 정상 연습 이벤트(수준 3 이하, 태그 유무와 무관) 8건의 block은 0건입니다. 재생에서 후보 8건만 규칙을 적용하고 애매한 8건은 알림만 기록했습니다. 신규 시험 5개·기존 XDR 시험 19개·기존 판정기 연습 4항목이 통과했습니다. 심판 비공개 정답이나 실제 운영 격리 결과로 표시하지 않습니다.

## 추가 격리 어댑터

respond()는 block 후보의 판단을 다시 계산한 뒤, 유효한 경보 번호·출발 IP·신선한 시각이 있는 경우에만 TTL 15분의 추가 거부 규칙을 씁니다. 규칙 ID는 xdr.persistence.source_ip이며 expiresAt과 alertIds를 포함합니다. 이미 만료된 경보를 오늘 시각으로 바꾸어 현재 격리를 만들지 않습니다. replay와 live는 분리하고 같은 root의 writer는 직렬 실행합니다.

withPersistence(baseDecide, options)는 기존 정책을 먼저 적용하고 추가 거부만 수행합니다. createZtnaDecider(options)는 기존 src/decider.mjs를 연결합니다. 기존 deny를 보존하고 일반 요청은 기존 정책 결과를 유지합니다. 호스트는 sourceIpForRequest로 엔진이 확인한 전송 주소를 공급하고 denyResponse로 엔진에 등록된 추가 거부 응답을 공급해야 합니다. 사용자 번호나 브라우저 헤더만으로 격리 대상을 정하지 않습니다.

현재 경보에는 신뢰된 고유 기기 ID가 없고 agent.name은 모든 경보가 같습니다. 따라서 이름만 보고 PC 전체나 사용자 전체를 격리하지 않습니다. 이 어댑터가 저장하는 대상은 출발 IP입니다. 실제 PC 단위 격리에는 운영 엔진의 검증된 기기↔IP 대응과 규칙 등록이 필요하며, NAT·공유 주소를 기기 한 대로 간주하면 안 됩니다. 현재는 로컬 재생과 시험 정책의 거부/통과까지 확인했고 운영 엔진 연결은 미실행입니다. 기존 RULE_IDS와 자료 API는 변경하지 않았습니다.

알림은 기존 xdr/alerts.log에 JSON 한 줄씩 추가합니다. 원본·계정·실행 경로·토큰은 저장하지 않습니다. 런타임 live/replay 규칙·임시 파일·공유 로그는 Git에서 제외하고 result.json만 저장합니다. 다른 XDR 모듈의 규칙 파일은 변경하지 않습니다.

공식 근거:
- https://attack.mitre.org/techniques/T1543/
- https://attack.mitre.org/techniques/T1053/
- https://attack.mitre.org/techniques/T1547/001/
