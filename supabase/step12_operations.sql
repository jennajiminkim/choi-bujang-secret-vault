-- Add only an append-only, private check journal. Existing notes, policies and audits stay intact.
begin;
create table if not exists public.vault_ops_checks (
 check_id uuid primary key,owner_id uuid not null,request_id uuid,
 case_id text not null check(case_id in ('app_page','own_list','own_read','anonymous_read','foreign_read','unregistered_read','backup_verify')),
 method text not null check(method='GET'),route text not null check(route in ('/','/api/notes','/api/notes/:id','/api/note-backups?backupId=:id')),
 expected_statuses integer[] not null,actual_status integer check(actual_status between 100 and 599),
 matched boolean,checked_at timestamptz not null,source text not null check(source='server_http'),
 details jsonb not null default '{}'::jsonb,
 check(jsonb_typeof(details)='object' and details - array['verified','currentMatches','expectedResponseType','errorCode']::text[] = '{}'::jsonb),
 check((actual_status is null and matched is null) or (actual_status is not null and matched is not null))
);
alter table public.vault_ops_checks enable row level security;
revoke all on public.vault_ops_checks from public,anon,authenticated,service_role;
grant select,insert on public.vault_ops_checks to service_role;
create or replace function public.vault_ops_immutable()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin raise exception 'ops_audit_immutable'; end $$;
drop trigger if exists vault_ops_no_change on public.vault_ops_checks;
create trigger vault_ops_no_change before update or delete on public.vault_ops_checks
for each row execute function public.vault_ops_immutable();
commit;
