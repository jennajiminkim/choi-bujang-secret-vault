-- 5단계 검토용: 실제 앱 A CRUD를 먼저 확인한 뒤 SQL Editor에서 실행하세요.
-- public.notes의 직접 권한만 회수합니다. 자료·소유자·RLS 정책·다른 테이블은 보존합니다.
-- 서버의 service_role 권한은 변경하지 않습니다. 실패하면 전체 트랜잭션이 취소됩니다.
begin;

select 'before' as phase, grantee, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'notes'
  and grantee in ('anon', 'authenticated', 'service_role')
order by grantee, privilege_type;

select 'before' as phase, roles.role_name, rights.privilege,
       has_table_privilege(roles.role_name, 'public.notes', rights.privilege) as allowed
from (values ('anon'::text), ('authenticated'::text), ('service_role'::text)) as roles(role_name)
cross join (values ('SELECT'::text), ('INSERT'), ('UPDATE'), ('DELETE'),
                   ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as rights(privilege)
order by roles.role_name, rights.privilege;

-- RLS 우회 자체는 테이블 GRANT를 대신하지 않습니다. 서버 CRUD 권한을 먼저 확인합니다.
do $$
declare privilege text;
begin
  foreach privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if not has_table_privilege('service_role', 'public.notes', privilege) then
      raise exception '서버 CRUD 권한이 부족합니다. 3단계 DB 설정을 확인한 뒤 다시 검토하세요.';
    end if;
  end loop;
end $$;

revoke all on table public.notes from PUBLIC, anon, authenticated;
-- 테이블 권한과 별도로 부여된 열 권한도 notes 안에서만 회수합니다.
do $$
declare cols text;
begin
  select string_agg(format('%I', attname), ', ' order by attnum) into cols
  from pg_attribute where attrelid = 'public.notes'::regclass and attnum > 0 and not attisdropped;
  execute format('revoke select (%s), insert (%s), update (%s), references (%s) on table public.notes from PUBLIC, anon, authenticated', cols, cols, cols, cols);
end $$;

-- 역할 상속 등으로 권한이 남거나 서버 권한이 줄면 COMMIT하지 않습니다.
do $$
declare role_name text; privilege text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    foreach privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege(role_name, 'public.notes', privilege) then
        raise exception '직접 테이블 권한이 남아 있습니다. 역할 상속/기존 GRANT를 검토하세요.';
      end if;
    end loop;
    foreach privilege in array array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] loop
      if has_any_column_privilege(role_name, 'public.notes', privilege) then
        raise exception '직접 열 권한이 남아 있습니다. 역할 상속/기존 GRANT를 검토하세요.';
      end if;
    end loop;
    if current_setting('server_version_num')::integer >= 170000 then
      if has_table_privilege(role_name, 'public.notes', 'MAINTAIN') then
        raise exception '직접 MAINTAIN 권한이 남아 있습니다.';
      end if;
    end if;
  end loop;
  foreach privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if not has_table_privilege('service_role', 'public.notes', privilege) then
      raise exception '서버 CRUD 권한이 유지되지 않았습니다. 기존 설정을 검토하세요.';
    end if;
  end loop;
end $$;

select 'after' as phase, grantee, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'notes'
  and grantee in ('anon', 'authenticated', 'service_role')
order by grantee, privilege_type;

select 'after' as phase, roles.role_name, rights.privilege,
       has_table_privilege(roles.role_name, 'public.notes', rights.privilege) as allowed
from (values ('anon'::text), ('authenticated'::text), ('service_role'::text)) as roles(role_name)
cross join (values ('SELECT'::text), ('INSERT'), ('UPDATE'), ('DELETE'),
                   ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as rights(privilege)
order by roles.role_name, rights.privilege;
commit;
