# 9단계 탐지 연습 사건 계약

`npm run detect:test`는 학생이 작성한 `src/detect.mjs`의 `detect(events)`에 가상 조회 사건을 전달합니다. 각 사건은 다음 세 값만 가집니다.

```js
{ at: '2026-10-01T00:00:00.000Z', method: 'GET', identity: { sub: 'learner_fixture' } }
```

같은 `identity.sub`의 `GET` 사건이 어느 10분 구간에서든 **120건을 넘을 때만** `{ action: 'propose_revocation', reasonCode: 'burst_read', subject: '해당 sub' }`를 돌려줍니다. 그 밖에는 `{ action: 'observe' }`입니다. 정확히 120건은 회수 제안 대상이 아닙니다. 다른 사용자의 사건을 합산하거나 10분 밖의 사건을 같은 묶음으로 세지 않습니다.

이 파일의 사건 모양은 **로컬 연습용**입니다. 브라우저가 보낸 사용자 번호를 신원으로 취급하지 않습니다. 운영 반 엔진이 검증한 사건을 전달하고 회수 제안을 집행하는 경로는 별도로 연결·시험해야 합니다. 이 명령의 통과를 실제 접속 차단이나 심판 판정으로 표시하지 않습니다.

## 9단계 구현의 사건 호환 처리 (2026-10-13)

위 3항목 형식은 기존 로컬 연습 계약으로 유지합니다. 사용자에게서 제공받은 9단계 통과 사례 코드에는 `deviceId` 등 기기 별칭, `network`/`signals.network`/`context.network`, `decision`/`result.decision`이 추가로 사용됩니다. 이는 성공 사례에서 관찰한 지원 형식이며 운영 심판의 공식 계약으로 독립 확인한 것은 아닙니다. 현재 `readEvent`의 별칭 목록은 해당 사례를 참고합니다.

추가 정보가 있는 사건은 같은 가명 사용자·기기의 다른 네트워크(`unusual`, `new`, `first_seen`) GET만 10분 미만 구간에서 집계합니다. 판정 allow 또는 step_up인 121건 이상일 때 `{action: 'propose_revocation', reasonCode: 'burst_read', subject, device}`를 반환합니다. 기기는 16자리 16진수 하나입니다. 정상·미확인 네트워크, 기기·판정 누락, deny 사건은 합산하지 않습니다. 전부 정확한 기존 연습 형식일 때만 기기 없는 subject 제안으로 호환 처리하며 혼합 입력에는 적용하지 않습니다.

이 함수는 엔진에서 검증된 사건만 전달받아야 합니다. 형식만 맞춘 클라이언트 사건을 엔진 검증 사건으로 승격하지 않으며, 실제 회수 API·권한 변경·경과 시간 측정은 구현하지 않습니다.
