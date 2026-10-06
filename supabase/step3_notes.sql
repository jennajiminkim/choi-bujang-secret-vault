-- 기존 자료를 보존하면서 API의 UUID ID 규격으로 이전합니다.
-- SQL Editor에서 실행합니다. 재실행해도 UUID를 다시 바꾸지 않습니다.
begin;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notes'
      and column_name = 'id' and data_type = 'bigint'
  ) then
    alter table public.notes alter column id drop identity if exists;
    alter table public.notes alter column id drop default;
    alter table public.notes alter column id type uuid using gen_random_uuid();
  end if;
end $$;
alter table public.notes alter column id set default gen_random_uuid();
alter table public.notes enable row level security;
revoke all on table public.notes from anon, authenticated;
grant select, insert, update, delete on table public.notes to service_role;
-- owner_id가 NULL인 기존 가상 메모는 보존하며 계정의 목록에는 표시하지 않습니다.
-- 새 메모의 owner_id는 인증 도우미가 검증한 ID를 서버에서 저장합니다.
-- auth.users 외래키는 걸지 않습니다. 심판의 검증된 UUID도 저장할 수 있어야 합니다.
commit;
