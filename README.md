# BYTE BACK 방어전 · 3단계 저장점

같은 자료실에 3단계 **「진짜 로그인을 붙입니다」**를 추가했습니다. 앞 단계의 정적 메모 제거, 서버 전용 환경변수, RLS, 배포 식별 파일, 보안 헤더를 유지합니다.

## 현재 구현

- 공식 `@supabase/supabase-js` SDK로 이메일·비밀번호 로그인과 로그아웃을 처리합니다. 로그인 실패 원인을 화면에 표시합니다.
- 자료 API는 기존 `src/verify-login.mjs`의 `createLoginVerifier`로 토큰을 검증합니다. 이 도우미는 수정하지 않습니다. 브라우저의 `userId`, `role`, `owner_id`를 인증에 쓰지 않습니다.
- 무로그인과 인증 실패 요청은 메모 없이 HTTP 401 JSON 오류를 반환합니다. 자료 응답은 `Cache-Control: no-store`입니다.
- 로그인한 계정은 자기 메모 목록을 보고 메모를 추가·수정·삭제합니다. 추가 시 검증된 사용자 ID를 `owner_id`에 저장합니다.
- `/data.json`에는 메모 0건만 남습니다. 빌드 때 `/aleph.json`을 생성하며 스키마는 v1, `step`은 3입니다. 첫 화면의 `X-Content-Type-Options: nosniff`를 유지합니다.

## 사용자가 Supabase에서 설정할 것

1. **SQL Editor**에서 [`supabase/step3_notes.sql`](supabase/step3_notes.sql)의 전체 내용을 실행합니다. 기존 `notes`의 숫자 ID를 UUID로 바꾸며 제목·본문·소유자·생성 시각과 기존 네 메모는 보존합니다. 재실행해도 UUID를 다시 바꾸지 않습니다. 트랜잭션이 실패하면 전체 이전을 취소합니다.
2. **Authentication → Users → Add user**에서 실습 A 계정을 준비합니다. 비밀번호는 Supabase와 로그인 화면에서만 직접 입력합니다. B 계정은 4단계 실습용으로 준비할 수 있습니다. 이메일 인증이 필요한 계정은 인증을 완료해야 합니다.
3. **Vercel → Settings → Environment Variables**에서 기존 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`를 유지합니다. 서버 URL은 이번에 제공한 프로젝트 주소와 같아야 합니다. 서버 키의 값은 Git·브라우저·로그에 복사하지 않습니다.
4. `public/auth-config.json`에는 사용자가 제공한 **공개용** Project URL과 `sb_publishable_` 키만 둡니다. `NEXT_PUBLIC_SUPABASE_URL`이라는 이름의 새 환경변수를 Vercel에 추가할 필요는 없습니다.
5. GitHub 새 커밋의 Vercel 배포가 완료되면 화면에서 A 로그인 → 메모 추가 → 수정 → 삭제 → 로그아웃을 확인합니다.

기존 메모는 `owner_id`가 NULL이므로 A의 개인 목록에는 나타나지 않습니다. A로 새 메모를 만들면 목록에 표시됩니다. 기존 네 메모를 특정 사용자에게 임의로 넘기지 않습니다.

## 실제 API 계약

| 메서드 | 경로 | 요청·응답 |
|---|---|---|
| GET | `/api/notes` | 검증된 계정의 `{id,title,body}` 메모 배열 |
| POST | `/api/notes` | `{id?,title,body}`; id는 UUID, 생략하면 서버 생성; HTTP 201 `{id}` |
| GET | `/api/notes/:id` | `{id,title,body}`; 없거나 삭제된 메모는 404 JSON |
| PUT | `/api/notes/:id` | `{title,body}`; 성공하면 `{id,title,body}` |
| DELETE | `/api/notes/:id` | 성공하면 `{id}`; 없으면 404 JSON |

`vercel.json`은 개별 메모 경로를 같은 서버 함수의 `id` 파라미터로 연결합니다. 모든 자료 경로는 인증을 먼저 검사합니다. 제목은 1~200자, 본문은 10,000자 이내입니다. DB의 기존 `content` 칸을 API의 `body`로 매핑합니다. UUID 중복은 409 JSON 오류입니다.

## 단계 설정과 남은 허점

- `aleph.config.json.step`: 3
- 로그인 발급자: `https://eqkxsftptrmgacddkswd.supabase.co/auth/v1`
- 공개키 주소: 위 발급자의 `/.well-known/jwks.json`, audience: `authenticated`
- 실제 GET·POST·PUT·DELETE 경로는 `allowedRoutes`에 기록합니다.
- `judgeIssuer`는 운영 측이 제공한 주소를 그대로 유지합니다. 심판이 서명한 토큰도 원본 도우미가 검증합니다.
- 목록은 자기 계정으로 제한하지만 **개별 GET·PUT·DELETE는 아직 소유자를 검사하지 않습니다.** 로그인한 B가 A의 UUID를 알면 조회·수정·삭제할 수 있습니다. 이 허점은 4단계에서 막습니다. 3단계 완성으로 타인 자료 접근까지 방어했다고 표현하지 않습니다.
- 최신 파일에서 메모를 제거해도 과거 Git 커밋과 옛 배포에 남은 노출은 자동으로 없어지지 않습니다.

## 실행과 확인

의존성 설치와 로컬 빌드:

```bash
npm ci
npm run build -- --local
npm run test:stage3
```

로컬 빌드와 테스트는 실제 Supabase 로그인·DB 이전·Vercel 성공 또는 심판 판정을 증명하지 않습니다. 테스트는 실행 때만 만든 임시 키와 메모를 사용합니다. 비밀번호와 서버 키를 요구하지 않습니다.

배포 점검:

```bash
curl -i https://choi-bujang-secret-vault-tawny.vercel.app/api/notes
curl -i https://choi-bujang-secret-vault-tawny.vercel.app/data.json
curl -i https://choi-bujang-secret-vault-tawny.vercel.app/aleph.json
curl -I https://choi-bujang-secret-vault-tawny.vercel.app/
```

정상 결과: A 로그인 후 자신의 새 메모를 추가·수정·삭제할 수 있습니다. 로그아웃하면 메모 화면과 편집 입력을 지웁니다. 삭제한 ID의 GET은 404입니다.

거부 결과: 시크릿 창에서 로그인 없이 메모가 보이지 않으며 `/api/notes`는 401 JSON 오류를 반환합니다. 잘못된 인증 토큰도 거부합니다.

최신 정적 파일과 Git에서 메모 본문 및 비밀값 유무를 점검합니다. 초기 학습용 메모가 포함된 `supabase/step2_notes.sql`은 정적 공개 파일 검사에서 제외합니다.

```bash
rg -n '실습용 가상 (과제|포트폴리오|리추얼|행정) 기록' public scripts api src data.json
git diff -- src/verify-login.mjs
```

첫 명령은 일치 없음, 두 번째 명령은 변경 없음이 정상입니다.

## 저장점과 제출

저장점 커밋 메시지는 **3단계 저장점**입니다. 마지막 변경 파일과 단계 설정을 포함하고 서버 키·계정 비밀번호·JWT·개인정보는 포함하지 않습니다.

`bundle-notes.json`에 이번 단계 설명을 적고 저장점 커밋 이후 다음을 실행합니다.

```bash
npm run bundle
```

이 명령은 현재 배포에 실제 요청한 자기 점검 결과와 제출 묶음을 만듭니다. 응답 본문·토큰·메모 내용은 기록하지 않습니다. 실제 A 계정 CRUD를 실행하지 않았으면 **미실행**으로 기록합니다. `bundle-notes.json`과 `artifacts/submission.json`은 커밋하지 않습니다.

- 저장소: https://github.com/jennajiminkim/choi-bujang-secret-vault
- 배포: https://choi-bujang-secret-vault-tawny.vercel.app
