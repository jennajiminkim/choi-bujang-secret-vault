-- 읽기 전용: 권한 회수 전과 후에 각각 실행하고 결과를 보관하세요.
-- SQL Editor에서 실행합니다. PUBLIC에서 물려받은 권한도 effective_grant에 반영됩니다.
select roles.role_name, rights.privilege,
       exists (
         select 1 from information_schema.role_table_grants grants
         where grants.table_schema = 'public' and grants.table_name = 'notes'
           and grants.grantee = roles.role_name and grants.privilege_type = rights.privilege
       ) as explicit_grant,
       has_table_privilege(roles.role_name, 'public.notes', rights.privilege) as effective_grant,
       case when rights.privilege in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
         then has_any_column_privilege(roles.role_name, 'public.notes', rights.privilege)
         else false end as any_column_grant
from (values ('anon'::text), ('authenticated'::text), ('service_role'::text)) as roles(role_name)
cross join (values ('SELECT'::text), ('INSERT'), ('UPDATE'), ('DELETE'),
                   ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as rights(privilege)
order by roles.role_name, rights.privilege;
