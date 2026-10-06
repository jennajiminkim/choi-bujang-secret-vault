-- 제작 3: 검토 후 SQL Editor에서 실행하세요. public.notes만 변경합니다.
-- notes의 기존 RLS 정책은 아래 네 정책으로 교체합니다. 다른 테이블은 변경하지 않습니다.
begin;

-- 적용 전: 명시적 테이블 GRANT와 실제 유효 권한을 각각 표시합니다.
-- role_table_grants는 PUBLIC의 권한을 생략하므로 has_table_privilege도 함께 봅니다.
select 'before' as phase, grantee, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'notes'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;

select 'before' as phase, roles.role_name, rights.privilege,
       has_table_privilege(roles.role_name, 'public.notes', rights.privilege) as allowed
from (values ('anon'::text), ('authenticated'::text)) as roles(role_name)
cross join (values ('SELECT'::text), ('INSERT'), ('UPDATE'), ('DELETE'),
                   ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as rights(privilege)
order by roles.role_name, rights.privilege;

select 'before' as phase, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename = 'notes';

revoke all on table public.notes from PUBLIC, anon, authenticated;
-- 별도로 부여된 열 GRANT도 같은 notes 테이블 안에서 회수합니다.
do $$
declare cols text;
begin
  select string_agg(format('%I', attname), ', ' order by attnum) into cols
  from pg_attribute where attrelid = 'public.notes'::regclass and attnum > 0 and not attisdropped;
  execute format('revoke select (%s), insert (%s), update (%s), references (%s) on table public.notes from PUBLIC, anon, authenticated', cols, cols, cols, cols);
end $$;
grant select, insert, update, delete on table public.notes to authenticated;
alter table public.notes enable row level security;

do $$
declare policy_record record;
begin
  for policy_record in select policyname from pg_policies
    where schemaname = 'public' and tablename = 'notes'
  loop
    execute format('drop policy %I on public.notes', policy_record.policyname);
  end loop;
end $$;

create policy notes_select_own on public.notes for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy notes_insert_own on public.notes for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy notes_update_own on public.notes for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy notes_delete_own on public.notes for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- 적용 후 권한이 기대와 다르면 COMMIT하지 않고 트랜잭션 전체를 취소합니다.
do $$
declare role_name text; privilege text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    foreach privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege(role_name, 'public.notes', privilege)
          <> (role_name = 'authenticated' and privilege in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')) then
        raise exception 'notes의 유효 권한이 기대와 다릅니다. 역할 상속/기존 GRANT를 검토해 주세요.';
      end if;
    end loop;
    if current_setting('server_version_num')::integer >= 170000 then
      if has_table_privilege(role_name, 'public.notes', 'MAINTAIN') then
        raise exception 'notes에 불필요한 MAINTAIN 권한이 남아 있습니다.';
      end if;
    end if;
  end loop;
end $$;

select 'after' as phase, grantee, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'notes'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;

select 'after' as phase, roles.role_name, rights.privilege,
       has_table_privilege(roles.role_name, 'public.notes', rights.privilege) as allowed
from (values ('anon'::text), ('authenticated'::text)) as roles(role_name)
cross join (values ('SELECT'::text), ('INSERT'), ('UPDATE'), ('DELETE'),
                   ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as rights(privilege)
order by roles.role_name, rights.privilege;

select 'after' as phase, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename = 'notes'
order by policyname;
commit;
