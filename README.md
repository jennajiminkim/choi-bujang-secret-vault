# BYTE BACK 방어전 · 2단계 저장점

이 저장소는 2단계 **「자료를 코드 밖으로 옮깁니다」** 상태입니다. 가상 메모 네 건은 정적 `data.json`에서 제거하고, Vercel 서버 함수 `/api/notes`가 학습용 Supabase 테이블에서 읽도록 바꿉니다. 실제 개인정보·비밀번호·토큰·서버 전용 키는 코드나 Git에 넣지 않습니다.

## 현재 작동하는 기능

- `/` 화면은 `/api/notes`를 호출해 가상 메모 카드를 표시합니다.
- `/data.json`은 메모 0건만 포함합니다.
- `api/notes.js`는 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`를 서버 환경변수에서만 읽습니다.
- Supabase `notes` 테이블은 `owner_id uuid` 칸을 가지며 RLS가 활성화되고 `anon`, `authenticated`에는 직접 테이블 권한을 주지 않습니다.
- 빌드 시 `public/aleph.json`은 계속 생성합니다.

## 2단계 설정

1. Supabase SQL Editor에서 `supabase/step2_notes.sql`을 실행합니다.
2. Table Editor에서 `notes.owner_id`가 `uuid`인지 확인하고 RLS가 켜져 있는지 확인합니다.
3. Vercel 프로젝트의 Environment Variables에 `SUPABASE_URL`과 `SUPABASE_SECRET_KEY`를 추가합니다. 값 자체는 코드, Git, 로그, 화면에 복사하지 않습니다.
4. 새 배포 뒤 `/`에서 네 카드가 보이는지 확인합니다.
5. `/data.json`을 직접 열어 `notes`가 빈 배열인지 확인합니다.

로컬 정적 빌드는 `npm run build -- --local`로 확인할 수 있습니다. 이 명령은 Supabase 서버 함수 동작이나 Vercel 배포 성공을 증명하지 않습니다.

## 남아 있는 약점

2단계에서는 비밀키를 브라우저 번들과 공개 저장소에서 제거했지만, `/api/notes` 자체는 아직 로그인 없이 누구나 호출할 수 있는 공개 주소입니다. 따라서 이 단계에서는 실제 자료가 아니라 가상 메모만 유지합니다. 접근 통제는 다음 단계에서 추가해야 합니다.

또한 최신 파일에서 메모를 제거해도 **이전에 공개된 Git 커밋과 이미 생성된 옛 배포 이력까지 자동으로 지워지는 것은 아닙니다.** 과거에 공개된 값은 노출 이력이 남아 있는 것으로 취급해야 하며, 최신 버전만 정리한 것을 과거 노출 해소라고 표현하지 않습니다.

## 최신 파일 확인 절차

아래 확인은 **현재 배포 파일과 GitHub 최신 버전**을 대상으로 합니다.

```bash
# 현재 작업 트리의 정적 파일에서 가상 메모 문장 검색
grep -R -n -E '실습용 가상 (과제|포트폴리오|리추얼|행정) 기록' data.json public scripts api || true

# GitHub 최신 추적 파일에서 같은 문장 검색
git grep -n -E '실습용 가상 (과제|포트폴리오|리추얼|행정) 기록' -- ':!supabase/step2_notes.sql' || true
```

정상 결과는 정적 `data.json`, `public`, 브라우저 코드에 가상 메모 본문이 나타나지 않는 것입니다. `supabase/step2_notes.sql`에는 학습용 DB로 옮길 초기 가상 데이터가 의도적으로 존재하므로 최신 **정적 공개 파일 검사에서는 제외**합니다.

배포 확인:

```bash
curl -i https://choi-bujang-secret-vault-tawny.vercel.app/data.json
curl -i https://choi-bujang-secret-vault-tawny.vercel.app/api/notes
curl -i https://choi-bujang-secret-vault-tawny.vercel.app/aleph.json
```

- `/data.json`: `notes`가 0건이어야 합니다.
- `/api/notes`: 현재 2단계에서는 비로그인 호출도 성공할 수 있습니다. 이것이 남은 약점입니다.
- `/aleph.json`: 최신 빌드에서 계속 열려야 합니다.

## 저장소 및 배포

- 저장소: https://github.com/jennajiminkim/choi-bujang-secret-vault
- 배포: https://choi-bujang-secret-vault-tawny.vercel.app

`aleph.config.json`의 `step`은 2이고, 로그인 발급자·허용 경로·원본 API 주소는 아직 다음 단계용이라 설정하지 않습니다. `judgeIssuer`는 운영 측이 제공한 값을 그대로 유지합니다.

## 주의

`npm run bundle`은 학생 자기 점검용 제출 묶음을 만듭니다. 로컬 명령이나 자체 점검을 심판 판정으로 표현하지 않습니다. `bundle-notes.json`과 `artifacts/submission.json`은 커밋하지 않습니다.
