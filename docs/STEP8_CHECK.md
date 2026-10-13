# 8단계 구역 확인

## 자원과 API

| 자원 | 주소 | API 권한 |
|---|---|---|
| notes:list | /api/notes | 본인 목록만; 추가 시 소유자는 검증된 사용자로 고정 |
| notes:UUID | /api/notes/:id | 검증된 사용자 = 저장된 소유자일 때만 읽기·수정·삭제 |
| notices:list | /api/notices | 로그인한 사용자 읽기 |
| notices:UUID | /api/notices/:id | 읽기는 로그인 사용자, 수정은 저장된 강사 권한만 |

UUID 슬롯에 export 같은 기능을 넣지 않으며 쿼리는 id만 받습니다. `role`, `owner_id`, `action` 등 쿼리로 기능/권한을 선택할 수 없습니다. API의 X-Resource-Id 응답 헤더로 자원을 구분하며 응답 본문에 소유자나 사용자 연결 정보를 추가하지 않습니다. 기존 브라우저 메뉴와 메모 JSON 형식은 유지했습니다.

## 먼저 실제 학습 DB에서 설정할 것

1. GitHub의 `supabase/step8_resources.sql` 전체를 Supabase **SQL Editor → New query**에 붙여넣고 검토 후 실행합니다. 기존 notes·소유자·로그인 계정·5단계 권한은 변경하지 않습니다.
2. **Table Editor**에서 `notices`, `vault_instructors`, `vault_subject_links` 및 RLS 활성화를 확인합니다. 세 테이블은 anon/authenticated 직접 권한이 없으며 서버 전용 접근만 허용합니다.
3. `notices`에 가상 공지 한 건을 넣습니다. id는 기본 UUID를 사용하고 title/content에는 공개되어도 괜찮은 시험 문장을 넣습니다. `vault_instructors`에는 관리자가 강사로 승인한 계정의 Supabase 사용자 UUID만 등록합니다. 실제 UUID는 관리자 화면에서만 다루고 Git/채팅에는 넣지 않습니다.
4. 실제 ZTNA 엔진이 제공한 repo_url·class_id·project_id·subject_id와 해당 사용자의 검증된 Supabase UUID를 `vault_subject_links`에 연결합니다. subjectId는 해시형 가명 주체이므로 UUID와 같다고 가정하거나 값을 추측하지 않습니다. class/project가 다르면 연결이 맞지 않습니다. 연결 정보가 제공되지 않았다면 운영 연결은 미완료로 남깁니다.

공지 테이블이 아직 없으면 로그인한 공지 요청은 설정 오류가 납니다. 운영 판정기의 연결이 없거나 조회가 실패하면 허용하지 않습니다. 기존 메모 API의 로그인·본인 CRUD는 새 테이블에 의존하지 않습니다.

## 판정기 연결과 현재 한계

요청의 18개 항목과 응답의 5개 항목은 그대로입니다. `request.role`, `request.owner_id`, `request.identity` 같은 새 항목은 만들지 않았습니다. `createResourceAuthorizer`는 검증된 classId/projectId/subjectId를 관리자 저장 매핑으로 DB 사용자에게 연결한 뒤 소유자와 강사 권한을 조회합니다. `createResourceDecider`에는 운영 엔진이 관리하는 권한 조회 함수를 주입할 수도 있습니다.

기본 decide는 같은 Supabase 프로젝트에 한해 서버 환경변수 SUPABASE_URL·SUPABASE_SECRET_KEY로 조회합니다. Vercel 자료 API에 설정된 것만으로 별도 운영 판정기 실행 환경에도 설정이 있다는 뜻은 아닙니다. 운영 엔진의 서버 환경 또는 신뢰된 권한 조회 연결을 운영자가 확인해야 합니다. 실제 키는 브라우저·응답·로그에 보내지 않습니다.

class_fixture/project_fixture의 고정 A/B 및 instructor_fixture는 로컬/심판 연습 전용입니다. 실제 사용자·강사 권한으로 사용하지 않으며 다른 클래스·프로젝트에는 적용하지 않습니다. 기존 `/notes/demo`는 이 연습에서 읽기만 지원합니다. 실제 자원 ID는 UUID만 지원합니다. 판정기에 역할 정보가 없는 제약을 요청 본문의 role로 우회하지 않습니다.

RULE_IDS의 resource_zones는 실제 구역 검사를 뜻합니다. 거부에는 기존 등록부에서 사용 중인 starter_not_ready와 이 규칙 ID를 사용하고, 확인되지 않은 새 이유 코드를 운영 등록부에 있다고 주장하지 않습니다. API는 타인/없는 메모 404, 학생의 공지 수정 403 instructor_required, 기능/권한 쿼리 400으로 짧게 설명합니다. 공지 수정 RPC는 UPDATE 시점에도 강사 테이블을 EXISTS로 대조합니다.

## 브라우저에서 본인 정상 동작과 직접 API 거부 확인

1. 기존 자료실에서 A 계정으로 로그인해 가상 메모를 만들고 읽기·수정·새로고침을 확인합니다. A 메모 UUID 하나를 로컬에서만 확인합니다.
2. 다른 브라우저 창에서 B로 로그인합니다. B 목록에 A 메모가 없어야 하며 B 자신의 가상 메모는 계속 읽고 수정할 수 있어야 합니다.
3. B 창의 **개발자 도구 → Network**에서 B의 메모 요청을 선택하고 **Copy → Copy as fetch**로 복사합니다. B 창 Console에 로컬로 붙여넣어 실행할 때 주소의 자료 ID만 A 메모 UUID로 바꿉니다. GET/PUT/DELETE에서 A 메모 본문 없이 404가 나와야 합니다. 쿼리/본문에 B의 신원을 A로 바꿀 항목을 넣는 시험도 허용되면 안 됩니다. 복사된 요청에는 토큰이 있으므로 채팅·공유 문서·스크린샷에 붙여넣지 않습니다.
4. 같은 B 세션의 인증된 fetch를 /api/notices/공지UUID에 PUT으로 보내면 403 instructor_required여야 합니다. role: instructor를 본문에 추가해도 B는 수정할 수 없어야 합니다. GET 공지 읽기는 가능해야 합니다.
5. 서버에 강사로 등록한 계정의 인증된 PUT은 200이어야 하며 수정한 가상 공지가 다시 읽혀야 합니다. 관리자 Table Editor로 행을 바꾼 것은 API 권한 시험이 아닙니다.
6. /api/notes/export 같은 UUID가 아닌 자원과 ?action=export 등 기능 쿼리는 자료 없이 거부되어야 합니다. 정상 메모 요청의 Network 응답 헤더에는 notes:UUID, 공지는 notices:UUID가 있어야 합니다.

브라우저 주소창에서 /api/notes/UUID를 여는 것은 Bearer 인증을 보내지 않아 401이 될 수 있습니다. 이 결과만으로 로그인한 B의 A 접근 거부를 증명하지 않습니다.

## 로컬 검증과 제출

```bash
npm run test:stage8
npm run decider:test
npm run fixture:7
npm run test:xdr
```

구역/API/기존 로그인 CRUD/기기/추가 확인/SQL 시험 27개와 기존 XDR 시험 14개를 실제 실행해 통과했습니다. A 자기 메모 GET·PUT 허용, B의 A 접근 deny/404, 학생 공지 수정 deny/403, 저장된 강사 수정 allow/200, 권한 회수 시 갱신 불가를 로컬에서 확인했습니다. SQL은 로컬 PostgreSQL(PGlite)에 실제 적용해 검증했으며 사용자 학습 DB에 자동 적용하지 않았습니다.

기존 테스트는 서명 검증을 위해 메모리에서만 가상 키를 쓰며 실제 개인키·계정 토큰을 저장하거나 출력하지 않습니다. 제출 기록에서 실제 DB 적용·운영 엔진 매핑·A/B 및 강사 계정 직접 API 시험은 미실행으로 남깁니다. 실제 적용 및 시험 후에만 운영 완료로 기록해야 합니다.
