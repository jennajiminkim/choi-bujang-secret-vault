-- 제작 1: 검토 후 Supabase SQL Editor에서 실행하세요. API/GRANT/RLS는 변경하지 않습니다.
-- 아래 두 입력값만 실제 A/B 실습 계정 이메일로 바꿉니다.
-- 이메일을 채운 파일을 GitHub에 올리지 마세요. 비밀번호나 키는 넣지 않습니다.
begin;
do $$
declare
  a_email text := 'A_EMAIL_HERE';
  b_email text := 'B_EMAIL_HERE';
  a_id uuid;
  b_id uuid;
  seed_title text;
  seed_id uuid;
  seed_owner uuid;
  seed_count integer;
  b_note_id uuid := '4a4e7c1c-73b8-4d10-94dd-93455b7ac640';
begin
  if a_email = 'A_EMAIL_HERE' or b_email = 'B_EMAIL_HERE' then
    raise exception '맨 위의 A_EMAIL_HERE와 B_EMAIL_HERE를 실제 실습 계정 이메일로 바꿔 주세요.';
  end if;
  if (select count(*) from auth.users where lower(email) = lower(btrim(a_email))) <> 1
      or (select count(*) from auth.users where lower(email) = lower(btrim(b_email))) <> 1 then
    raise exception 'A/B 이메일에 해당하는 Auth 사용자가 각각 한 명 있어야 합니다.';
  end if;
  select id into a_id from auth.users where lower(email) = lower(btrim(a_email));
  select id into b_id from auth.users where lower(email) = lower(btrim(b_email));
  if a_id = b_id then raise exception 'A와 B는 서로 다른 계정이어야 합니다.'; end if;

  -- 초기 메모 세 건만 배정합니다. 다른 메모와 기존 본문은 보존합니다.
  foreach seed_title in array array['과제', '포트폴리오', '아침 리추얼'] loop
    select count(*) into seed_count from public.notes where title = seed_title;
    if seed_count <> 1 then
      raise exception '초기 메모 제목 %가 정확히 한 건이어야 합니다. 중복/누락을 먼저 확인해 주세요.', seed_title;
    end if;
    select id, owner_id into seed_id, seed_owner from public.notes where title = seed_title for update;
    if seed_owner is not null and seed_owner <> a_id then
      raise exception '초기 메모가 다른 계정의 소유입니다. 임의로 소유권을 덮어쓰지 않습니다.';
    end if;
    update public.notes set owner_id = a_id where id = seed_id;
  end loop;

  select owner_id into seed_owner from public.notes where id = b_note_id for update;
  if found and seed_owner is distinct from b_id then
    raise exception 'B 시험 메모 ID가 다른 소유자에게 사용 중입니다.';
  end if;
  insert into public.notes (id, owner_id, title, content)
  values (b_note_id, b_id, 'B 공개 시험 메모', '소유자 접근 제어 확인용 가상 메모입니다.')
  on conflict (id) do nothing;
end $$;

-- 이메일/본문 없이 네 시험 메모의 UUID와 소유자 UUID를 확인합니다.
select id, title, owner_id from public.notes
where title in ('과제', '포트폴리오', '아침 리추얼')
   or id = '4a4e7c1c-73b8-4d10-94dd-93455b7ac640'::uuid
order by title;
commit;
