# BYTE BACK 방어전 · 5단계 저장점

같은 자료실에 5단계 **「자료 요청을 서버 한곳으로 모읍니다」**를 준비했습니다. Supabase 로그인·로그아웃, 원본 토큰 검증 도우미, 서버의 소유자 검사, 가상 메모와 기존 서버 전용 설정을 유지합니다. 아래 SQL은 검토용이며 실제 Supabase에 자동 적용하지 않습니다.

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

- `aleph.config.json.step`과 배포 `/aleph.json`은 5입니다. 배포 스키마 `aleph.defense.deployment.v1`을 유지합니다.
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

커밋 메시지는 **5단계 저장점**입니다. 저장점 뒤 실행합니다.

```bash
npm run bundle
```

HTTP 자기 점검은 실제 보낸 응답만 기록합니다. 실제 A/B 시험과 실제 권한 회수 적용은 미확인이면 미실행으로 표시합니다. Auth 공개 키 추가점수 미충족도 그대로 기록합니다. 토큰·실제 이메일·메모 본문·서버 키는 제출 묶음에 넣지 않습니다. `bundle-notes.json`, `artifacts/submission.json`, 생성된 번들·`public/aleph.json`은 커밋하지 않습니다.

설계 참고: https://supabase.com/docs/guides/api/securing-your-api
권한 회수 참고: https://www.postgresql.org/docs/current/sql-revoke.html
