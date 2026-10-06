-- 읽기 전용: RLS/GRANT 적용 전과 후에 각각 실행하고 결과를 비교합니다.
-- 명시적 GRANT와 PUBLIC/역할 상속까지 반영한 실제 권한을 한 결과표에 표시합니다.
select roles.role_name, rights.privilege,
       exists (
         select 1 from information_schema.role_table_grants grants
         where grants.table_schema = 'public' and grants.table_name = 'notes'
           and grants.grantee = roles.role_name and grants.privilege_type = rights.privilege
       ) as explicit_grant,
       has_table_privilege(roles.role_name, 'public.notes', rights.privilege) as effective_grant
from (values ('anon'::text), ('authenticated'::text)) as roles(role_name)
cross join (values ('SELECT'::text), ('INSERT'), ('UPDATE'), ('DELETE'),
                   ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as rights(privilege)
order by roles.role_name, rights.privilege;
