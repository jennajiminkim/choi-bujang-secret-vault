# B의 시험 메모 사전 백업과 한 건 복원

2026-10-14 사용자 보고로 B의 시험 메모 한 건 사전 백업·재검증·복원 및 새로고침 후 원래 내용을 확인했습니다. 같은 날 사용자는 복원 이후 B의 인증으로 A 메모를 GET /api/notes/:id에 요청하여 HTTP 404·메모를 찾을 수 없습니다 응답도 확인했습니다. 아래는 재현 절차이며, 그 밖의 운영 A/B 요청 전체 재시험과 다른 행의 직접 대조는 별도로 남아 있습니다. 지금 백업한 뒤에만 시험용 변경을 하세요. GitHub에는 코드만 저장하고 메모 사본은 Supabase의 비공개 테이블에 둡니다.

## 1. 테이블 만들기

Supabase의 기존 프로젝트 → SQL Editor → New query에서 `supabase/step10_note_backups.sql` 전체를 붙여 넣고 Run을 누릅니다. 기존 notes와 감사 테이블의 행을 지우거나 수정하는 SQL은 없습니다. 새 테이블 vault_backup_targets, vault_note_backups, vault_restore_audit와 서버 전용 RPC가 생성됩니다. 백업과 복구 감사 기록은 UPDATE/DELETE가 거부되며 일반 계정·브라우저가 직접 테이블을 읽을 수 없습니다. 사본은 한 대상당 하나이며 덮어쓰기 요청은 409입니다.

## 2. B의 한 건만 승인

Table Editor의 notes에서 B가 방금 만든 가상 메모를 찾습니다. 그 행의 id와 owner_id를 같은 프로젝트의 vault_backup_targets → Insert row에 각각 note_id와 owner_id로 넣습니다. B의 실제 메모 행에서 복사하며 실명·토큰·본문은 넣지 않습니다. 승인 행은 이 한 건만 넣으세요. 대상 테이블은 메모 복사본이 아니라 서버의 백업/복원 범위를 정합니다. 다른 계정·메모는 승인하지 않습니다.

## 3. B로 로그인한 자료실에서 백업

B의 창에서 개발자 도구 → Console을 열고 아래 함수를 한 번 정의합니다. 11단계에서는 로그인과 등록 기기 확인을 완료한 앱의 메모리 세션을 내부에서 사용하며, 토큰을 저장소에서 읽거나 출력하지 않습니다. 이전 10단계 화면의 콘솔 함수는 당시 기록으로 구분합니다. 로그인한 같은 자료실 도메인에서 실행하세요. 콘솔 명령의 ID를 답변이나 GitHub에 붙여 넣지 마세요.

```js
async function 복구시험(path, method='GET', body) {
  if (!window.자료실요청) throw new Error('11단계 앱의 로그인과 등록 기기 확인을 완료하세요.');
  const 결과 = await window.자료실요청(path, method, body);
  console.log(결과);
  return 결과;
}
```

B메모ID만 실제 시험 메모 ID로 바꾸고 실행합니다.

```js
const 사전백업 = await 복구시험('/api/note-backups', 'POST', {id: 'B메모ID'});
```

201과 backupId, id, contentHash가 나와야 합니다. 본문과 소유자 정보는 출력하지 않습니다. 404는 승인 대상과 로그인 계정·메모 소유자가 일치하지 않는 경우입니다. 409는 기존 사본이 있거나 검증 실패입니다. 사본이 이미 있으면 다시 백업하여 덮어쓰지 않습니다. 502/503이면 SQL 적용 또는 기존 서버 환경 설정을 확인하세요. 서버 전용 키를 콘솔에 넣지 않습니다.

## 4. 사전 사본 다시 읽어 확인

같은 콘솔에서 실행합니다.

```js
const 복원계획 = await 복구시험('/api/note-backups?backupId=' + encodeURIComponent(사전백업.data.backupId), 'GET');
```

200, verified:true이고 id와 contentHash가 사전백업과 같아야 합니다. 변경 전에는 currentHash도 contentHash와 같아야 합니다. 이 확인에 실패하면 메모 변경이나 복원은 중단합니다. SQL의 해시는 ID·소유자·제목·본문을 함께 묶은 SHA-256이며 검증된 로그인 사용자와 저장된 소유자를 RPC에서 대조합니다.

## 5. 검증 후 시험 변경과 복원

위 확인이 끝나면 B의 그 시험 메모 한 건만 화면에서 수정하고 저장합니다. 메모를 삭제하지 말고 내용만 바꾸는 첫 시험을 권장합니다. 위 GET을 다시 실행하면 currentHash와 contentHash가 달라져 복원할 대상 한 건과 변경 여부를 알 수 있습니다. 범위가 맞는 것을 직접 확인한 뒤에만 다음 POST를 실행합니다.

```js
const 복원결과 = await 복구시험('/api/note-restores', 'POST', {
  backupId: 사전백업.data.backupId,
  confirmHash: 사전백업.data.contentHash
});
```

200, verified:true, 같은 id·contentHash가 나와야 합니다. B의 화면을 새로고침해 원래 시험 메모가 돌아왔는지 확인합니다. 위 GET 재실행의 currentHash도 contentHash와 같아야 합니다. SQL은 한 트랜잭션에서 ID·소유자·해시를 확인하고 대상만 복원하며 소유자가 다른 행은 덮어쓰지 않습니다. 삭제된 시험 메모의 같은 ID 복원도 로컬 시험했지만 운영에서는 미실행입니다. 백업 시각·생성 시각이 보존되며 복구 감사 행만 추가합니다.

## 경로와 권한

| 서비스 | 메서드·경로 | 용도 |
| --- | --- | --- |
| note_backups | POST /api/note-backups | 승인된 본인 시험 메모 사본 생성 |
| note_backups | GET /api/note-backups?backupId=UUID | 사본 재검증·변경 계획 메타데이터 |
| note_restores | POST /api/note-restores | 확인 해시와 소유자가 맞는 한 건 복원 |

경로로 기능을 구분하고 쿼리는 자료 ID만 선택합니다. notes/:id와 같은 깊이에 기능 경로를 추가하지 않습니다. 기존 판정기와 허용 경로 목록은 변경하지 않았으므로 이 준비 작업만으로 엔진 경유 복구가 허용되었다고 주장하지 않습니다. 10단계에서는 restoreRoute에 POST 전용 경로 /api/note-restores를 등록합니다. 정책 복원은 별도의 격리 시험이며 기존 판정기의 접속 허용 범위를 늘리지 않습니다.

## 정상·금지 재시험

1. B가 백업한 시험 메모 재검증 → 동일 ID·소유자·해시 대조는 서버에서 수행, 화면에는 ID·해시·verified만 표시.
2. 승인하지 않은 다른 본인 메모 백업 → 404, 변경 없음.
3. A로 로그인한 별도 창에서 B의 backupId로 GET·POST 복원 → 404, B 메모 변경 없음. A의 세션으로 함수도 그 창에서 별도 정의합니다.
4. 잘못된 confirmHash로 B의 복원 요청 → 409, 변경 없음.
5. A·B 각자의 기존 메모 읽기·수정 정상, B의 A 메모 직접 요청 404, 학생의 공지 쓰기 403 유지.
6. 로컬 `npm run test:recovery`, `npm run test:stage8`, `npm run test:stage9`, `npm run decider:test`, `npm run fixture:7`, `npm run detect:test` 확인.

사용자가 완료한 B 사전 백업·복원과 B의 인증으로 A 메모 GET 요청 404 확인은 사용자 보고로 기록합니다. 나머지 운영 A/B 요청·회수·운영 정책 복원은 실제 수행 전까지 미실행으로 남깁니다. 자료 내용·토큰·개인키는 Git/로그/제출 JSON에 넣지 않습니다.
