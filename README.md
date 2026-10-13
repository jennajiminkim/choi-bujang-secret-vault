# 8단계 저장점 — 메모·공지·강사 자료 구역 규칙

## 최신 수업 안내 반영

3차 심판에 관한 사용자 제공 설명에 맞춰 공지와 강사 자료를 명시적인 구역으로 정의했습니다. `src/resources.mjs`가 자원 구역을 구분하고 `src/decider.mjs`가 아래 규칙을 적용합니다. 메모 ID 검사 범위는 그대로입니다. 판정기는 `demo`, `note_fixture`, `note-42` 같은 일반 ID도 받아들이며 UUID로 좁히지 않습니다. 실제 DB 메모·공지 UUID 형식과 소유자는 최종 API가 검사합니다.

| 구역·경로 | 판정기 동작 | 규칙·사유 |
| --- | --- | --- |
| GET·PUT `/notes/:id`, `/api/notes/:id` | 정상 조건 허용 | `zone_notes_self` · `approved` |
| 메모 목록 `/notes`, `/api/notes` | 거부 | `zone_notes_no_bulk` |
| GET `/announcements/:id`, `/api/announcements/:id` | 정상 조건 허용 | `zone_announcements` · `approved` |
| 기존 공지 GET `/notices/:id`, `/api/notices/:id` | 같은 공지 구역의 주소로 허용 | `zone_announcements` |
| 공지 구역 POST·PUT·PATCH·DELETE | 명시적 쓰기 거부 | `zone_announcements` · `announcement_write_denied` |
| 공지 목록·맞지 않는 읽기 경로 | 구역 규칙 거부 | `zone_announcements` · `announcement_read_denied` |
| 강사 자료 `/materials`, `/api/materials` 및 개별 경로 | 모든 동작 거부 | `zone_instructor_materials` · `instructor_material_denied` |
| `/instructors`, `/api/instructors` | 같은 강사 구역으로 모든 동작 거부 | `zone_instructor_materials` |
| 그 밖의 경로·메모 POST·PATCH·DELETE·기능·쿼리 요청 | 기존 기본 거부 | `starter.deny` |

등록 기기·엔진 확인 사용자·정확한 메서드/경로/route·빈 쿼리 조건을 유지합니다. 미등록은 `device_not_registered`, 복합 이상 사건은 `step_up_required`로 추가 확인합니다. 검증된 가상 재확인은 허용 대상 읽기/수정을 다시 판단하며 공지 쓰기나 강사 자료 거부를 해제하지 않습니다. 위치·역할을 클라이언트 헤더에서 믿지 않습니다. 소유자를 최초 요청자로 기억하거나 주체 ID를 DB UUID와 비교하지 않습니다.

이번 3차 심판의 이유 코드 형식 안내는 `docs/DECIDER_REQUEST.md`에 적용 범위를 명시해 보충했습니다. 요청 18항목·응답 5항목은 유지하며 모든 ruleIds는 RULE_IDS에 등록된 실제 규칙입니다.

## 허용 경로와 실제 API

`UNV_NOTES_ROUTE_UNKNOWN` 화면은 심판이 목록 GET 경로를 배포 정보에서 찾지 못했다고 안내했습니다. 사용자의 승인을 받아 `GET /api/notes`를 **API 목록 발견용 배포 정보에만 복원**했습니다. 판정기는 계속 `/notes`·`/api/notes` 목록 요청을 `zone_notes_no_bulk`로 거부합니다. 기존 API는 인증된 사용자의 본인 목록만 제공하며 이 변경은 API 접근 권한이나 소유자 검사를 바꾸지 않습니다.

`aleph.config.json.allowedRoutes`는 이 발견용 항목과 정상 판정 대상인 기존 4개 경로를 기록합니다.

- GET `/api/notes` (심판의 목록 API 발견용; 판정기는 거부)
- GET `/api/notes/:id`
- PUT `/api/notes/:id`
- GET `/api/announcements/:id`
- GET `/api/notices/:id` (기존 공지 주소)

POST `/api/notes`, DELETE `/api/notes/:id`, 공지 목록·쓰기 경로는 제출 경로 목록에서 계속 제외합니다. 브라우저의 기존 본인 목록·CRUD 서버 함수는 계속 제공하며 화면과 기존 주소를 바꾸지 않습니다. 실제 메모 API는 JWT 사용자와 DB의 owner_id를 같은 문장에서 대조합니다. 기존 공지 API는 저장된 강사 권한을 다시 확인합니다. 새 `/api/announcements/:id` 주소는 Vercel rewrite로 같은 기존 공지 API에 연결하므로 공지 데이터를 복사하거나 DB를 변경하지 않습니다. 강사 자료는 판정기에서 거부하는 논리 구역이며 새 자료 API나 DB를 만들지 않았습니다.

공개 배포 JSON의 publicAppUrl은 기존 고정 주소입니다. 이전 개별 배포 주소의 로그인벽 문제를 고친 `86ec8eda39d6`의 기능을 유지합니다. 자기 점검에서 공개 주소·배포 경로 일치와 새 공지 주소의 실제 익명 거부를 확인합니다.

## 확인과 제출

1. `npm run test:stage8` — 일반 메모 ID 정상 GET·PUT, 공지 GET 허용/쓰기 사유 거부, 강사 자료 사유 거부, 응답 형식·규칙 등록·발견용 목록 GET의 판정 거부·allowedRoutes 일치 및 기존 API의 본인 CRUD·타인 거부를 시험합니다.
2. `npm run decider:test`와 `npm run fixture:7` — 이전 네 항목, 정상 allow/복합 이상 step_up을 유지합니다. `npm run test:xdr`와 `npm run build -- --local`도 확인합니다. 모두 로컬 시험이며 심판 결과와 구분합니다.
3. 배포 `/aleph.json`에서 최신 커밋·고정 공개 주소·위 5개 경로를 확인합니다. 목록 GET이 배포 정보에 있어도 판정기는 계속 deny여야 합니다. 본인 정상 화면의 목록과 수정이 유지되어야 합니다. DB에 새 키·연결표·강사 권한을 넣을 필요가 없습니다.
4. 기존 사용자 직접 시험에서는 B의 A 메모 GET이 404, 학생의 가상 공지 PUT이 403, A의 메모 수정이 새로고침 뒤 유지됨을 확인했습니다. 이 기록에는 토큰·실제 ID·본문을 넣지 않았습니다. 이번 배포의 실제 계정 시험과 승인된 강사의 수정은 별도 확인 사항입니다.
5. `npm run bundle`로 새 제출 JSON을 생성하고 최신 파일로 재제출합니다. 실제 재로그인·강사 운영 시험처럼 실행하지 않은 항목은 미실행으로 남기며 새 심판 점수를 미리 확정하지 않습니다.

---

# BYTE BACK 방어전 · 7단계 저장점

## 8단계 변경 되돌림: 7단계 복구

작동을 확인한 7단계 저장점 `d248d22`를 기준으로 승인받은 8단계 변경 21개 파일만 복구했습니다. 공지 API·자원 구역 모듈·8단계 시험과 설정을 제거하고 기기 등록·복합 이상 추가 확인·기존 메모 API로 돌아갑니다. 기존 커밋 이력은 새 복구 커밋의 부모로 보존합니다. DB 연결·SQL 실행·테이블 삭제·권한 변경은 하지 않았으므로 Supabase의 메모·공지·강사 표·계정은 유지됩니다.

기능 파일은 기준 커밋과 같습니다. README에는 복구 기록을 추가했고, 기존 배포 식별 시험의 고정 5단계 기대값만 현재 설정값으로 보완했습니다. 로컬 API·기기·추가 확인·배포 시험 22개와 XDR 시험 14개, 판정기 연습 네 항목 및 로컬 빌드가 통과했습니다. 로컬 정상은 allow, 미등록은 deny/device_not_registered, 복합 이상은 step_up입니다. 실제 계정의 브라우저 확인 및 새로운 심판 판정은 별도 확인 사항입니다.

```bash
npm run decider:test
npm run fixture:7
```

기존 자료실 주소에서 로그인·본인 메모 읽기·수정·새로고침을 확인하세요. 무로그인 API 요청과 다른 사용자의 메모는 기존 API 인증·소유자 검사로 거부됩니다. 공지 API는 복구 배포에서 제공하지 않지만 DB에 추가한 가상 공지는 Table Editor에 남습니다. 이번 복구 커밋 메시지는 **8단계 변경 되돌림: 7단계 복구**입니다. 아래 내용은 원래 7단계 저장점의 기록입니다.

같은 자료실에 7단계 **「평소와 다른 접속은 다시 확인합니다」**를 추가했습니다. 6단계 기기 규칙·자료 읽기 범위를 유지하고, 출처가 확인된 가상 복합 이상 사건에 추가 본인 확인을 요구합니다. 기존 화면·주소·로그인·DB 설정과 두 XDR 보너스는 보존합니다. 아래 5·6단계 및 보너스 절은 각 저장점 당시 기록이며 현재 판정기의 추가 규칙은 다음 절에 설명합니다.

## 7단계 입력 검사와 복합 이상 규칙

`src/access-signals.mjs`는 엔진의 18개 요청 항목과 signals·recentEvents·stepUp의 형식을 검사합니다. `signals.source === judge_fixture`는 가상 신호이며 실제 위치 증거가 아닙니다. `source: none, region/network: unknown`은 신호 미제공으로 구분하고 임의의 정상값으로 채우지 않습니다. 이때 기존 등록 기기 규칙만 적용합니다. 신호 누락·불명확한 출처·계약 밖 헤더·잘못된 타입은 invalid이며 자료 읽기를 추가 확인으로 보냅니다. source 문자열만으로 브라우저 요청을 인증하는 것이 아니므로 판정기는 인증된 운영 엔진에서만 호출해야 합니다.

`src/decider.mjs`의 `step_up_required`는 검증된 가상 사건에서 다음 세 조건이 **모두** 맞으면 `step_up / step_up_required`를 반환합니다.

1. 시각 0~5시 또는 23시의 가상 심야 접속
2. `network: unusual`
3. 최근 300초 이내 `risk_signal`의 count 20 이상

시각 범위·20건은 이 과제의 연습 기준이며 실제 사용자 평소 시간대를 학습했다고 주장하지 않습니다. 현재 fixture는 많은 행동을 risk_signal 집계로 전달하며 개별 메모 본문이나 읽기 로그를 만들지 않습니다. 지역은 차단 조건으로 쓰지 않습니다. 지역 하나나 세 조건 중 하나만으로 영구 차단 규칙을 만들지 않습니다. 미등록 기기는 기존 규칙으로 우선 deny합니다. 다른 서비스·쓰기·불일치 경로의 기본 거부도 유지합니다.

## 가상 재확인과 실제 재로그인 계약

요청 계약에는 엔진의 `stepUp: {verified, authAgeSeconds}` 요약이 있습니다. 가상 source가 judge_fixture이며 형식 검사를 통과한 verified true, 경과 시간 0~900초는 **가상 재확인 시험에서만** 복합 사건을 allow로 전환합니다. 누락·문자열 true·음수·900초 초과는 해제하지 않습니다. 토큰 원문은 받거나 기록하지 않습니다.

그러나 저장소에는 같은 주체의 새 로그인을 실제 확인 요청에 묶는 challenge·인증시각 전달·운영 엔진의 차단/해제 연결이 없습니다. `api/notes.js`와 로그인 검증기는 이 재인증 흐름을 제공하지 않습니다. 따라서 **실제 재로그인 전 자료 차단과 새 로그인 뒤 해제는 미실행**입니다. 브라우저의 로그아웃·로그인만으로 재인증 계약을 검증했다고 기록하지 않습니다.

로컬 step_up 응답은 계약의 다섯 판단 항목만 포함하며 메모 자료를 포함하지 않습니다. 이는 운영 엔진이 실제 응답 본문을 차단했다는 증거는 아닙니다. 실제 엔진 계약이 제공되면 같은 주체·확인 요청·새 로그인 시각의 연결을 검증하고 새 요청을 다시 판정해야 합니다. 제공되지 않은 계약·서명 키·설치 명령을 만들지 않았습니다.

## 7단계 실행과 직접 확인 순서

```bash
npm run fixture:7
npm run decider:test
node --test test/stage6.test.mjs test/stage7.test.mjs
npm run test:xdr
```

실행 결과:

```text
정상 사건: allow
복합 이상 사건: step_up
통과 · 등록 기기의 정상 요청
통과 · 미등록 기기의 가상 요청
통과 · 복합 이상 접속
통과 · 다시 확인한 복합 이상 접속
```

기기·입력 출처·조합·경계값·가상 재확인·배포 식별 시험 9개, 기존 XDR 시험 14개가 통과했습니다. 연습 시험은 심판의 실제 공격 결과가 아닙니다.

직접 확인은 다음 순서입니다.

1. 최신 GitHub 내용을 Pull한 뒤 `npm run fixture:7`을 실행하고 normal은 allow, 복합 이상은 step_up인지 확인합니다. `npm run decider:test`에서 위 네 항목이 모두 통과해야 합니다.
2. 최신 Vercel 배포가 **7단계 저장점**에서 성공했는지, 기존 주소 `/aleph.json`의 step이 7이고 commit이 최신 저장점인지 확인합니다. 기존 화면에 로그인해 본인 메모 읽기가 유지되는지도 확인합니다.
3. 수업 엔진이 실제 추가 확인 시험을 제공할 때만 복합 사건에서 추가 확인 화면이 나오고 완료 전 자료 본문이 없는지 확인합니다. 이어 같은 계정의 새 로그인을 엔진이 검증한 뒤 새 요청이 허용되는지 확인합니다. 제공되지 않았다면 이 두 항목은 미실행으로 남깁니다. 일반 자료실 화면만으로 해당 시험을 대신하지 않습니다.
4. 제출 JSON의 step 7, policyRules의 device_registered·step_up_required, 실제 재로그인 항목의 미실행 기록을 확인하고 제출합니다. 키·토큰·실제 메모 본문은 제출하지 않습니다.

빌드·배포 식별·제출 자기 점검은 5~7단계를 지원합니다. 제출 기록은 실제 HTTP 점검과 로컬 가상 판정, 실제 연결 미실행을 구분합니다. 원래 7단계 저장점 메시지는 **7단계 저장점**입니다.

## 6단계 판정 규칙과 확인 순서

- 엔진이 확인한 사용자 정보는 `request.subjectId`, 등록 여부는 요청 최상위의 `request.deviceRegistered`입니다. Supabase ID와 직접 비교하거나 브라우저의 자기신고 값을 믿지 않습니다.
- `deviceRegistered === true`이며 service가 notes, method가 GET이고 경로와 route가 맞는 자료 읽기만 `allow / approved / device_registered`입니다. 엔진 경로 `/notes`, `/notes/:id`와 기존 앱 경로 `/api/notes`, `/api/notes/:id`를 확인합니다.
- 미등록·누락·문자열·숫자 등 정확한 true가 아닌 값은 `deny / device_not_registered / device_registered`입니다. 다른 서비스·쓰기·불일치 경로는 기존 `starter.deny / starter_not_ready`로 거부합니다. RULE_IDS에는 실제 사용되는 두 규칙만 있습니다.
- 이 함수는 신원·기기·경로를 검증한 운영 엔진에서 부르는 부품입니다. 브라우저 API에 판정 입력을 새로 받도록 변경하지 않았습니다. 현재 Supabase 로그인 및 CRUD 화면과 별개의 엔진 판정이며, 화면이 열린다는 사실만으로 기기 등록 판정의 적용을 증명하지 않습니다.
- 새 인증서·CA·서명 키·개인키 파일은 만들지 않았고 따로 설치할 접속 프로그램이 없습니다. 운영 엔진은 실제 릴레이에서 미등록 기기를 먼저 막으며, false 판정 요청의 공격 시험은 심판이 수행합니다.

로컬 시험을 실제 실행했습니다.

```bash
npm run decider:test
```

```text
통과 · 등록 기기의 정상 요청
통과 · 미등록 기기의 가상 요청
이 명령은 가상 요청으로 연습하며 심판 통과 증거가 아닙니다.
```

별도 출력으로 true → allow/approved, false·누락 → deny/device_not_registered를 확인했습니다. `node --test test/stage6.test.mjs`의 경계값·읽기 범위·배포 식별 정보 시험 3개와 `npm run test:xdr`의 기존 시험 14개도 통과했습니다. 시험용 가상 요청에서 실제 토큰이나 기기 키를 만들지 않습니다.

직접 확인은 다음 순서입니다.

1. Vercel의 최신 배포가 **6단계 저장점** 커밋에서 성공했는지 확인합니다. 기존 프로젝트·환경변수·주소를 유지합니다.
2. 기존 등록 기기에서 기존 자료실 주소를 열고 로그인·본인 메모 목록·읽기가 계속 동작하는지 확인합니다. 운영 수업 화면이 등록 기기의 접속 경로를 제공한다면 그 경로에서도 자료 읽기를 확인합니다. 미등록 기기 공격은 심판에 맡깁니다.
3. GitHub `src/decider.mjs`에서 `device_registered`와 `deviceRegistered !== true` 거부 조건을 확인합니다. 로컬에서는 최신 내용을 Pull한 뒤 위 판정기 시험을 실행합니다.
4. 배포 주소 `/aleph.json`에서 step 6과 최신 커밋을, `/data.json`에서 메모 0건을 확인합니다. `/api/notes`를 로그아웃 상태로 직접 열면 401 또는 403 JSON 거부여야 합니다.
5. 제출 JSON의 step 6·최신 commit·policyRules를 확인하고 제출합니다. 비밀번호·토큰·서버 전용 키·기기 개인키를 채팅이나 첨부 자료에 넣지 않습니다.

빌드와 배포 식별 정보·HTTP 자기 점검은 5~6단계에 대응하도록 갱신했습니다. 제출 자기 점검은 HTTP 요청의 실제 결과와 로컬 기기 판정 결과를 구분합니다. 실제 등록 기기 접속 및 미등록 기기 심판 공격은 자동으로 완료했다고 기록하지 않습니다. 보너스 절의 기본 판정기 상태는 각 저장점 당시 기록이며 현재 판정기는 이 6단계 규칙입니다.

## 브라우저와 서버의 현재 경로

- 브라우저 `src/browser-app.mjs`에 Supabase 메모 직접 호출은 **없음**입니다. 해당 파일은 이번 단계에서 변경하지 않았습니다.
- 모든 메모 읽기·추가·수정·삭제는 Vercel `/api/notes` 서버 함수를 호출합니다. 직접 Supabase 호출은 기존 공식 SDK의 Auth 로그인·세션·로그아웃뿐입니다.
- 서버 `api/notes.js`는 기존 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`를 사용합니다. 서버 전용 키를 브라우저에 전달하지 않습니다.
- `src/verify-login.mjs`, `src/notes-api.mjs`, 서버 함수 진입점은 그대로입니다. 검증한 ID로 목록과 개별 조회·수정·삭제를 제한하고, 새 메모 소유자는 검증한 ID로 저장합니다.
- 무로그인·잘못된 토큰은 401 JSON, 상대·미소유·없는 메모는 404 JSON입니다. 소유자 변경은 403, PUT 본문은 `{title,body}`입니다.

| 메서드 | 경로 | 응답·허용 범위 |
|---|---|---|
| GET | `/api/notes` | 본인 메모 `{id,title,body}` 배열 |
| POST | `/api/notes` | `{id?,title,body}`; UUID 생략 시 생성; 201 `{id}` |
| GET | `/api/notes/:id` | 본인 메모 `{id,title,body}` |
| PUT | `/api/notes/:id` | 본인 메모 `{title,body}` 수정 |
| DELETE | `/api/notes/:id` | 본인 것만 삭제; `{id}`; 삭제 후 GET 404 |

## SQL 적용 전: 실제 화면의 A CRUD 확인

1. 배포 https://choi-bujang-secret-vault-tawny.vercel.app/ 에서 기존 A 계정으로 로그인합니다.
2. 가상 시험 메모를 추가하고 새로고침하여 읽습니다. 수정 후 새로고침하고, 삭제 후 목록에서 사라졌는지 확인합니다.
3. B 창에서는 자기 메모만 보여야 합니다. B가 A UUID로 개별 GET·PUT·DELETE를 요청하면 404여야 합니다. 로그아웃 창 `/api/notes`는 401 JSON이어야 합니다.
4. 개발자 도구 Network에서 메모 요청은 `/api/notes` 또는 `/api/notes/:id`여야 합니다. `/auth/v1/...`은 정상 로그인 요청이며 메모 Data API가 아닙니다. 토큰·비밀번호·실제 메모 본문을 채팅이나 제출 파일에 복사하지 않습니다.

실제 A/B 계정 시험과 4단계 SQL 적용 여부는 현재 확인되지 않았습니다. 3단계의 A CRUD 확인은 5단계 시험을 대신하지 않습니다. 로컬 테스트는 SQL 회수 뒤 기존 서버 함수가 계속 동작하는지 확인하지만 실제 Supabase 시험을 대신하지 않습니다.

## 검토 후 학습 DB에서 직접 실행할 SQL

다른 테이블·자료·소유자·RLS 정책·Auth 계정은 변경하지 않습니다. 전체 Data API 비활성화나 스키마 전체 권한 회수도 하지 않습니다.

1. Supabase **SQL Editor → New query**에서 [`supabase/step5_audit.sql`](supabase/step5_audit.sql)을 실행하고 권한표를 보관합니다. 읽기 전용입니다.
2. A의 실제 앱 CRUD가 정상임을 먼저 확인한 뒤 [`supabase/step5_revoke.sql`](supabase/step5_revoke.sql)을 검토하고 실행합니다. 이메일이나 키를 채울 곳은 없습니다.
3. 같은 audit SQL을 다시 실행하여 적용 전후를 비교합니다.
4. A/B 본인 CRUD, B의 A 접근 거부, 무로그인을 화면에서 다시 확인합니다.

회수 SQL은 `REVOKE ALL ON TABLE public.notes FROM PUBLIC, anon, authenticated`를 실행하고, 별도로 부여된 열 권한도 같은 notes 테이블에서만 회수합니다. `authenticated`에 CRUD를 다시 GRANT하지 않습니다. 4단계 소유자 RLS 정책은 보존하며, 직접 역할은 소유자 토큰이 있어도 테이블 권한이 없어 접근하지 못합니다.

`information_schema.role_table_grants`의 명시적 GRANT와 `has_table_privilege`의 실제 유효 권한을 적용 전후 모두 표시합니다. audit는 열 권한도 확인합니다. 역할 상속으로 직접 권한이 남거나, 기존 서버 CRUD 권한이 부족하거나 회수 뒤 줄면 트랜잭션을 중단합니다. 서비스 역할에는 새 권한을 부여하지 않고 기존 권한을 유지합니다.

| 역할 | 적용 후 SELECT·INSERT·UPDATE·DELETE | 열 직접 권한 |
|---|---|---|
| anon | 모두 false | 모두 false |
| authenticated | 모두 false | 모두 false |
| service_role | 기존 네 권한 true 유지 | 기존 설정 유지 |

`explicit_grant`는 명시적 테이블 권한, `effective_grant`는 PUBLIC·역할 상속을 포함한 실제 권한입니다. `any_column_grant`는 테이블 또는 별도 열 권한을 통해 한 열이라도 접근할 수 있는지입니다. 두 클라이언트 역할은 TRUNCATE·REFERENCES·TRIGGER 등도 false여야 합니다.

**5단계 회수 후 4단계 `step4_3_rls.sql`을 다시 실행하면 authenticated CRUD GRANT가 다시 열립니다. 최종 권한을 유지하려면 5단계 SQL을 마지막으로 적용합니다.**

4단계 초기 소유자 배정이 아직 필요하면 `step4_1_owners.sql`의 A/B 이메일을 로컬에서 채워 먼저 검토·실행합니다. 기존 세 가상 메모를 A에 연결하고 B 시험 메모를 한 건 추가하며, 네 번째 초기 메모와 사용자 자료는 보존합니다. 실제 이메일을 채운 파일은 GitHub에 올리지 않습니다.

## 설정·추가점수 확인

- `aleph.config.json.step`은 7이며 새 배포 `/aleph.json`에도 7을 기록합니다. 실제 최신 배포 반영은 위 순서로 확인합니다. 배포 스키마 `aleph.defense.deployment.v1`을 유지합니다.
- `originalApiUrl`은 쿼리 없는 `https://eqkxsftptrmgacddkswd.supabase.co/rest/v1/notes`입니다.
- `/aleph.json`에 위 다섯 `allowedRoutes`와 `originalApiUrl`도 빌드 시 자동 기록합니다.
- 운영 측 `judgeIssuer`, 로그인 발급자 정보, 실제 앱 주소는 유지합니다.
- `vercel.json`의 첫 화면 `X-Content-Type-Options: nosniff` 헤더를 유지합니다. 공개 `data.json`은 메모 0건입니다.
- **공개 키 없음 추가점수 조건은 미충족입니다.** 요청대로 Auth 호출을 유지했으므로 로그인용 publishable 키는 기존 `public/auth-config.json`에 남습니다. 서버 전용 키와는 다릅니다. 키 문자열을 숨기거나 서버 설정 조회를 통해 다시 브라우저에 보내는 것으로 이 조건을 충족했다고 주장하지 않습니다.

직접 원본 자료 자기 점검은 공개 publishable 키만 `apikey`에 넣고 사용자 토큰·서버 키 없이 GET을 보냅니다. 기대 결과는 401/403 JSON 권한 오류이며 메모가 없어야 합니다. anon 거부만으로 authenticated 권한 회수까지 증명되지 않으므로 실제 audit 표도 확인합니다.

## 다시 실행하고 제출하기

```bash
npm ci
npm run build -- --local
npm run test:stage5
```

`test:stage5`는 원래 로그인·소유자 API 테스트와 로컬 PGlite PostgreSQL SQL 테스트입니다. 4단계 GRANT/RLS를 거쳐 5단계 실제 회수 SQL을 적용하고 anon/authenticated 직접 CRUD 거부, 별도 열 권한 제거, 기존 서버 함수로 A/B CRUD 허용·타인/소유자 변경 거부, 자료·RLS·다른 테이블 보존, 재실행, 상속 권한이 남을 때 중단을 검사합니다. 시험 서명 키와 가상 계정은 프로세스 안에서만 사용합니다.

이번 복구 커밋 메시지는 **8단계 변경 되돌림: 7단계 복구**입니다. 저장점 뒤 실행합니다.

```bash
npm run bundle
```

HTTP 자기 점검은 실제 보낸 응답만 기록합니다. 실제 A/B 시험과 실제 권한 회수 적용은 미확인이면 미실행으로 표시합니다. Auth 공개 키 추가점수 미충족도 그대로 기록합니다. 토큰·실제 이메일·메모 본문·서버 키는 제출 묶음에 넣지 않습니다. `bundle-notes.json`, `artifacts/submission.json`, 생성된 번들·`public/aleph.json`은 커밋하지 않습니다.

설계 참고: https://supabase.com/docs/guides/api/securing-your-api
권한 회수 참고: https://www.postgresql.org/docs/current/sql-revoke.html

## 보너스 xdr-01 저장점 · 무차별 로그인 공격

5단계 앱·DB·설정과 기존 ZTNA 규칙은 보존합니다. `xdr/brute-force/`에 비밀값을 가리는 경보 읽기, MITRE T1110 패턴 목록, 독립 판단 모듈, 만료 15분의 추가 IP 거부 규칙·알림 연결 어댑터를 만들었습니다. 상세 설정과 한계는 [`xdr/brute-force/README.md`](xdr/brute-force/README.md)에 있습니다.

```bash
npm run xdr:run -- brute-force
npm run xdr:respond
npm run test:xdr
```

로컬 확인: 경보 28건/읽기 28줄, **block 10·alert 9·record 9**, 정상 연습 이벤트 9건의 block **0건**, 테스트 **8개 통과**입니다. `xdr:run`은 result.json만 갱신하고 `xdr:respond`는 별도 시험 시계로 차단·알림을 재생합니다. 시험 규칙은 실제 규칙과 분리하고 로그 및 런타임 규칙 파일은 커밋하지 않습니다.

기존 판정기는 모든 요청을 거부하는 시작점 그대로입니다. 추가 차단 어댑터의 정상 통과는 로컬 시험 정책으로 검증했습니다. 현재 엔진 계약에는 출발 IP가 없으므로, 신뢰된 서버 주소 전달·거부 사유 등록·엔진 진입점 연결은 아직 미완료이며 실제 운영 차단이나 심판 통과로 보고하지 않습니다. 저장점 메시지는 **보너스 xdr-01 저장점**입니다.

## 보너스 xdr-02 저장점 · 웹 주입 공격

`xdr/web-injection/`에 비밀값을 가리는 읽기, MITRE T1190 기반 패턴 목록, 독립 판단, 만료되는 추가 IP 거부 규칙·알림 연결을 추가했습니다. SQL·스크립트·경로 이탈·명령 주입 형태를 확인하고 단일 표기와 수업 단어는 자동 차단하지 않습니다. [`상세 실행 안내`](xdr/web-injection/README.md)에 조건·근거와 연결 한계를 기록했습니다.

```bash
npm run xdr:run -- web-injection
npm run xdr:respond:web
npm run test:xdr
```

로컬 확인: **경보 26건/읽기 26줄, block 8·alert 9·record 9, 정상 연습 이벤트 9건의 차단 0건**입니다. 시험 재생에서는 후보 8건만 거부 규칙을 만들고 애매한 9건은 알림만 기록했습니다. 두 보너스를 함께 검사한 테스트는 **14개 통과**입니다. 앞 절의 8개는 xdr-01 저장점 당시 기록입니다.

첫 번째 보너스 파일과 기존 판정기·5단계 설정은 유지했습니다. 결과 JSON은 커밋하고 공유 로그와 live/replay 거부 규칙은 제외합니다. 기존 계약의 신뢰된 IP 전달·사유 코드 등록·운영 진입점 연결은 여전히 미완료입니다. 현재 결과는 로컬 시험이며 심판 통과나 실제 운영 연결 증거가 아닙니다. 저장점 메시지는 **보너스 xdr-02 저장점**입니다.
