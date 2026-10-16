# 보너스 xdr-05 · 권한 가로채기 탐지

`read-alerts.mjs`는 시각·출발 주소·계정·규칙 수준·설명 다섯 항목만 출력합니다. 원본·full_log·토큰은 출력하지 않고 허용 항목 안의 암호·토큰 표기도 가립니다. fixture는 수정하지 않습니다.

`patterns.json`은 관리자 그룹 조작, 권한 상승 직후 관리자 명령, 불충분한 권한 사용 신호를 구분합니다. 각 패턴에 이름·조건·근거 한 줄·공식 출처를 적었습니다. T1068은 소프트웨어 취약점 악용에 의한 상승, T1078은 정상 계정 악용의 근거이며, 관리자 그룹 추가 자체는 T1098.007로 보강했습니다. 경보 태그만으로 특정 취약점이 실제 악용됐다고 확정하지 않습니다.

`decide.mjs` 상단에는 JSON과 동일한 PATTERNS 상수가 있습니다. 내보내는 함수는 decide(alert) 하나이며 import·패키지·파일·네트워크·호출 간 상태가 없습니다. description은 길이를 제한하고 결과에 원본·주소·계정을 복사하지 않습니다. 반환은 {action, confidence, reason}입니다.

수준 10 이상·관련 기법 태그와 함께 관리자 그룹 실제 추가 및 원격 접근·즉시 명령·다수 추가(3건 이상)·회수 직후 재가입(2건 이상) 중 근거가 겹치면 0.96 block 후보입니다. 방금 얻은 관리자 권한으로 명령 실행, 다른 계정 권한의 명령 실행, 낯선 주소와 시간 밖 명령, 세션 권한 변경과 낯선 주소가 겹치면 0.94 block 후보입니다. 취소·실패·단순 조회·수업 그룹·평소 주소의 단일 관리자 명령 등 불충분한 경보는 0.6 alert, 일반 이벤트는 0.1 record입니다.

0.85 이상 block, 0.5 이상 alert, 나머지 record이며 수치는 학습 정책입니다. 업무 시각은 timestamp만으로 새로 추정하지 않고 수집기의 근무시간·평소 주소 비교 요약을 사용합니다. MITRE 태그만으로 차단하지 않습니다. 실제 사용자 역할·명령 이력을 수집하는 프로그램이나 모든 권한 상승을 탐지하는 제품을 구현한 것은 아닙니다.

## 실행과 로컬 결과

```bash
node xdr/privilege/read-alerts.mjs
npm run xdr:run -- privilege
node xdr/privilege/respond.mjs --replay
node --test test/privilege.test.mjs
```

경보 26건/읽기 26줄, block 9·alert 8·record 9입니다. 정상 연습 이벤트 9건의 block은 0건입니다. 재생에서 후보 9건만 해당 모의 세션에 규칙을 적용하고 애매한 8건은 알림만 남겼습니다. 신규 시험 6개·기존 XDR 시험 24개·기존 판정기 연습 4항목이 통과했습니다. 독립 환경, 패턴 일치, 잘못된 집계·취소·실패·시각 단독·같은 계정 다른 세션·다른 계정 보존, 만료·과거 경보를 검사했습니다.

## 세션 추가 거부 연결

respond(alerts, options)는 판단을 다시 계산하고 신선한 block 후보에만 TTL 15분의 추가 거부 규칙을 씁니다. 규칙에는 ruleId xdr.privilege.session, expiresAt, 근거 alertIds와 해시로 가린 subjectKey/sessionKey를 넣습니다. 원본 계정·주소·명령·세션 토큰은 로그나 규칙에 저장하지 않습니다. 신선한 사건·경보 ID·검증된 세션 대응이 없으면 규칙을 만들지 않고 미연결·과거 상태를 알립니다. 같은 root는 한 writer가 직렬 처리하며 live와 replay 파일은 분리합니다.

호스트는 resolveSessionForAlert(alert)로 Wazuh의 계정 사건을 검증된 엔진 subjectId와 sessionRef에 대응시켜야 합니다. sessionRef는 토큰 원문이 아닌 호스트의 비밀이 아닌 불투명 참조여야 합니다. Wazuh srcuser를 엔진 subjectId와 직접 비교하거나 IP만으로 계정 전체를 회수하지 않습니다. 경보가 4개 계정을 말하더라도 명시된 한 대상 이외의 계정·세션은 지어내지 않습니다.

withPrivilege(baseDecide, options)는 기존 정책을 먼저 적용하고 호스트의 sessionForRequest(request)로 확인된 세션을 조회해 대상 주체와 세션이 모두 일치할 때만 추가 deny를 반환합니다. denyResponse는 호스트가 엔진에 등록한 추가 규칙·거부 응답을 공급합니다. createZtnaDecider(options)는 기존 판정기와 연결하며 기존 deny·응답 5항목·자료실 규칙을 보존합니다. 추가 검사가 allow를 새로 만들지 않습니다.

현재 판정 요청 18항목에는 세션 참조가 없으므로 요청에 필드를 덧붙이지 않았습니다. 운영 호스트가 별도로 확인한 세션 대응과 엔진 규칙 등록은 미연결입니다. 따라서 실제 인증 제공자의 토큰 폐기·로그아웃 API는 만들거나 호출하지 않았습니다. 지금 구현은 검증된 대상 세션의 후속 요청을 판정기에서 거부하는 어댑터이며, 물리적인 세션 폐기·실운영 회수는 별도 엔진 연결이 필요합니다. 기본 live 모드에는 가짜 세션 매핑이 없습니다.

CLI --replay만 fixture의 가명 계정과 문서용 출발 주소로 모의 세션 참조를 만들며 운영 신원·세션으로 사용하지 않습니다. 다른 주소의 정상·애매한 세션은 함께 차단하지 않습니다. xdr/alerts.log는 메타데이터만 JSONL로 쌓고 실제 규칙·재생 규칙·임시 파일·공유 로그는 Git에서 제외합니다. result.json은 커밋합니다.

공식 근거:
- https://attack.mitre.org/techniques/T1068/
- https://attack.mitre.org/techniques/T1078/
- https://attack.mitre.org/techniques/T1098/007/
