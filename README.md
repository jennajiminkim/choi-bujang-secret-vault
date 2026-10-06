# BYTE BACK 방어전 · 4단계 저장점

같은 자료실에 4단계 **「로그인해도 내 자료만 보이게 합니다」**를 구현했습니다. 3단계 로그인·로그아웃, 원본 토큰 검증 도우미, UUID 메모 API, 정적 메모 제거, 보안 헤더를 유지합니다.

## 현재 구현

- 목록과 개별 조회·수정·삭제는 모두 검증된 사용자 ID와 DB의 `owner_id`가 같은 메모에만 접근합니다.
- 새 메모의 소유자는 서버가 검증한 ID로 저장합니다. 클라이언트의 `userId`, `role`, URL·본문의 `owner_id`로 권한을 넓히지 않습니다.
- 개별 읽기·수정·삭제는 ID와 소유자를 **같은 DB 문장**에서 검사합니다. 별도 사전 확인과 변경 사이의 시간차를 만들지 않습니다.
- 수정은 기존 소유자를 조건으로 제한하고 새 소유자도 검증된 사용자 ID로 고정합니다. 수정 본문의 `owner_id`는 403으로 거부하고, 허용하는 본문은 `{title,body}`입니다.
- 상대 메모·소유자 없는 메모·없는 메모는 404 JSON 오류로 기본 거부합니다. 무로그인·잘못된 인증은 자료 없이 401 JSON 오류입니다. 서버·DB 오류는 자료 없이 실패합니다.

## Supabase에서 직접 검토하고 실행할 SQL

**이 SQL 파일들은 제안본입니다. 실제 Supabase에 자동으로 실행하지 않습니다.** 실제 이메일·비밀번호·JWT·서버 전용 키는 GitHub나 제출 JSON에 넣지 않습니다.

1. **Authentication → Users**에서 서로 다른 실습 A/B 계정을 준비합니다. 3단계에 사용한 A 계정은 그대로 사용합니다.
2. [`supabase/step4_1_owners.sql`](supabase/step4_1_owners.sql)을 열고 맨 위 `a_email`, `b_email`의 `A_EMAIL_HERE`, `B_EMAIL_HERE`만 실제 실습 계정 이메일로 바꿉니다. 이메일을 채운 파일은 GitHub에 올리지 않습니다. **SQL Editor**에서 검토 후 실행합니다.
3. [`supabase/step4_2_audit.sql`](supabase/step4_2_audit.sql)을 먼저 실행하고 적용 전 권한표를 보관합니다. 이 파일은 읽기 전용입니다.
4. [`supabase/step4_3_rls.sql`](supabase/step4_3_rls.sql)을 검토하고 실행합니다. `notes`의 기존 정책 목록을 조회한 뒤 그 테이블의 정책만 네 소유자 정책으로 교체합니다. 다른 테이블의 자료·정책·권한은 변경하지 않습니다.
5. 같은 `step4_2_audit.sql`을 다시 실행해 적용 후 권한표와 비교합니다. `step4_3_rls.sql` 자체에도 적용 전후 `role_table_grants`, `has_table_privilege`, `pg_policies` 조회가 포함됩니다.

소유자 배정 SQL은 이메일로 `auth.users`의 UUID를 찾습니다. 기존 초기 메모 중 `과제`, `포트폴리오`, `아침 리추얼` 세 건에 A의 ID를 연결하고 B의 공개 가능한 시험 메모를 한 건 추가합니다. 기존 네 번째 메모와 사용자 추가 메모는 보존합니다. 따라서 초기 자료를 삭제해 전체 건수를 네 건으로 맞추지 않습니다. 기존 네 번째 메모는 소유자가 없으면 앱에 표시되지 않습니다.

계정 누락·같은 A/B 계정·초기 제목 중복/누락·이미 다른 계정의 소유인 메모가 있으면 트랜잭션 전체를 중단합니다. 재실행해도 B 시험 메모가 중복되지 않습니다.

### 권한표의 기대 결과

| 역할 | SELECT | INSERT | UPDATE | DELETE | TRUNCATE·REFERENCES·TRIGGER |
|---|---|---|---|---|---|
| anon | false | false | false | false | 모두 false |
| authenticated | true | true | true | true | 모두 false |

`explicit_grant`는 `information_schema.role_table_grants`에 나타난 명시적 권한이고, `effective_grant`는 `has_table_privilege`로 확인한 실제 권한입니다. `PUBLIC`에서 물려받은 권한이 첫 조회에 생략될 수 있으므로 두 값을 같이 봅니다.

RLS SQL은 먼저 `REVOKE ALL ON TABLE public.notes FROM PUBLIC, anon, authenticated`로 회수합니다. 별도 열 권한도 회수하고 `authenticated`에는 네 CRUD 권한만 부여합니다. 기대와 다른 유효 권한이나 PostgreSQL 17 이상의 불필요한 MAINTAIN 권한이 남으면 전체 변경을 취소합니다.

- SELECT·DELETE: 기존 행의 `USING ((select auth.uid()) = owner_id)`.
- INSERT: 새 행의 `WITH CHECK ((select auth.uid()) = owner_id)`.
- UPDATE: 기존 행의 `USING`과 새 행의 `WITH CHECK`를 모두 적용합니다.

앱 서버는 기존 서버 전용 키로 DB를 호출합니다. `service_role`은 RLS를 우회하므로 앱 API에서 소유자를 별도로 검사합니다. 실제 Supabase 사용자 토큰으로 DB에 직접 접근할 때는 `authenticated`용 RLS가 적용됩니다. 심판의 검증된 UUID도 앱 API를 사용할 수 있도록 `owner_id`에 `auth.users` 외래키는 추가하지 않습니다.

## 실제 API 계약과 단계 설정

| 메서드 | 경로 | 허용 범위·응답 |
|---|---|---|
| GET | `/api/notes` | 본인 메모의 `{id,title,body}` 배열 |
| POST | `/api/notes` | `{id?,title,body}`; UUID 생략 시 생성; HTTP 201 `{id}`; 소유자는 검증된 ID |
| GET | `/api/notes/:id` | 본인 메모 `{id,title,body}`; 타인·미소유·없음은 404 |
| PUT | `/api/notes/:id` | 본인 메모 `{title,body}`만 수정; 타인은 404, 소유자 변경은 403 |
| DELETE | `/api/notes/:id` | 본인 것만 삭제하고 `{id}` 반환; 타인·없음은 404 |

- `aleph.config.json.step`과 배포 식별 파일의 단계는 4입니다. 배포 스키마는 `aleph.defense.deployment.v1`을 유지합니다.
- `allowedRoutes`는 위 다섯 실제 메서드·경로와 일치합니다.
- 발급자는 `https://eqkxsftptrmgacddkswd.supabase.co/auth/v1`, audience는 `authenticated`, JWKS는 발급자의 `/.well-known/jwks.json`입니다.
- 운영 측 `judgeIssuer`, 공개 앱 주소, 기존 키 설정, 원본 `src/verify-login.mjs`는 유지합니다.
- 공개 `data.json`은 메모 0건, `/aleph.json`은 빌드 때 생성, 첫 화면은 `X-Content-Type-Options: nosniff`입니다.
- 제목 1~200자·본문 10,000자 제한, UUID 중복 409, DB `content`와 API `body` 매핑, `Cache-Control: no-store`를 유지합니다.

## 다시 실행하고 확인하기

```bash
npm ci
npm run build -- --local
npm run test:stage4
```

`test:stage4`는 임시 서명 키를 사용한 앱 API 시험과, PGlite의 로컬 PostgreSQL에서 실제 SQL GRANT·RLS를 실행하는 시험입니다. A/B 본인 CRUD 허용, 상대 CRUD 거부, 소유자 위조·변경 거부, NULL 소유자 기본 거부, SQL 재실행, 다른 테이블 보존을 확인합니다. 로컬 Auth 스키마는 시험용으로 단순화되어 있어 실제 Supabase 계정 시험이나 심판 결과를 대신하지 않습니다.

### 실제 배포에서 확인

1. SQL 적용 후 A로 로그인합니다. 초기 세 메모가 보이고 추가·수정·삭제가 되는지 확인합니다.
2. A 창을 로그아웃하고 B로 로그인하거나 별도 시크릿 창에서 B로 로그인합니다. A의 메모는 목록에 없어야 하며 B 자신의 메모만 보여야 합니다.
3. A/B가 각각 새 시험 메모를 만들고 수정·삭제한 뒤 새로고침해 결과가 유지되는지 확인합니다. 5단계 뒤에도 다시 시험합니다.
4. 개발자 도구 Network의 목록 응답에서 A의 가상 메모 UUID를 확인할 수 있습니다. B가 그 UUID로 개별 GET·PUT·DELETE를 요청하면 404가 와야 합니다. 로그인 토큰은 브라우저에서만 사용하며 코드·로그·제출·채팅에 복사하지 않습니다. 로컬 테스트와 심판도 이 세 경로를 직접 시험합니다.
5. 로그아웃 상태의 `/api/notes`는 HTML 대신 401 JSON 오류여야 합니다.

```bash
curl -i https://choi-bujang-secret-vault-tawny.vercel.app/api/notes
curl -i https://choi-bujang-secret-vault-tawny.vercel.app/data.json
curl -i https://choi-bujang-secret-vault-tawny.vercel.app/aleph.json
curl -I https://choi-bujang-secret-vault-tawny.vercel.app/
```

직접 Data API 자기 점검은 Project URL의 `/rest/v1/notes`에 공개용 publishable 키만 `apikey`로 보내며 사용자 토큰·서버 키는 보내지 않습니다. 로그인 없는 역할은 `anon`이며 401/403 JSON 권한 오류가 정상입니다. 실제 `authenticated` 직접 Data API 재현은 점수 확인에 포함하지 않습니다. SQL의 `authenticated` 정책은 로컬에서 시험하되 실제 적용 여부는 사용자의 권한표로 확인합니다.

## 저장점과 제출

커밋 메시지는 **4단계 저장점**입니다. 저장점 커밋 후 설명을 `bundle-notes.json`에 적고 다음을 실행합니다.

```bash
npm run bundle
```

자기 점검은 실제 보낸 HTTP 요청의 상태와 JSON 오류 유무만 기록합니다. 토큰·메모 본문·실제 이메일은 기록하지 않습니다. 4단계 실제 A/B 시험과 실제 DB 권한 SQL 적용 여부는 확인되지 않았다면 미실행으로 남깁니다. `bundle-notes.json`, `artifacts/submission.json`, 생성된 브라우저 번들과 `public/aleph.json`은 커밋하지 않습니다.

최신 파일에서 메모나 키를 제거해도 옛 Git 커밋·옛 배포의 노출 이력은 자동으로 지워지지 않습니다.

- 저장소: https://github.com/jennajiminkim/choi-bujang-secret-vault
- 배포: https://choi-bujang-secret-vault-tawny.vercel.app
- 설계 참고: https://supabase.com/docs/guides/database/postgres/row-level-security
- 권한 조회 참고: https://www.postgresql.org/docs/current/infoschema-role-table-grants.html
