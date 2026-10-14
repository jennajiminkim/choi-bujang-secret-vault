-- Run after step12_operations.sql. Keeps every existing check, memo, backup and audit row.
begin;
alter table public.vault_ops_checks drop constraint if exists vault_ops_checks_case_id_check;
alter table public.vault_ops_checks add constraint vault_ops_checks_case_id_check check(case_id in
 ('app_page','own_list','own_read','anonymous_read','foreign_read','unregistered_read','backup_verify','own_write','notice_write','restore_one'));
alter table public.vault_ops_checks drop constraint if exists vault_ops_checks_method_check;
alter table public.vault_ops_checks add constraint vault_ops_checks_method_check check(method in ('GET','PUT','POST'));
alter table public.vault_ops_checks drop constraint if exists vault_ops_checks_route_check;
alter table public.vault_ops_checks add constraint vault_ops_checks_route_check check(route in
 ('/','/api/notes','/api/notes/:id','/api/notices/:id','/api/note-backups?backupId=:id','/api/note-restores'));
alter table public.vault_ops_checks drop constraint if exists vault_ops_checks_source_check;
alter table public.vault_ops_checks add constraint vault_ops_checks_source_check check(source in ('server_http','server_api'));
-- Do not grant SELECT on the private restore audit: return only this verified actor's metadata.
create or replace function public.vault_ops_restore_summary(p_actor_id uuid)
returns table(operation text,at timestamptz)
language sql security definer set search_path=pg_catalog as $$
 select a.operation,a.at from public.vault_restore_audit a
 where a.actor_id=p_actor_id order by a.at desc limit 50;
$$;
create or replace function public.vault_ops_capabilities()
returns integer language sql set search_path=pg_catalog as $$ select 2; $$;
revoke all on function public.vault_ops_restore_summary(uuid),public.vault_ops_capabilities() from public,anon,authenticated;
grant execute on function public.vault_ops_restore_summary(uuid),public.vault_ops_capabilities() to service_role;
commit;
