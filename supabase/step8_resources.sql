-- Review and run in the existing project's SQL Editor. No existing notes/owners/Auth rows are changed.
begin;
create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 200),
  content text not null check (length(content) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.vault_instructors (
  user_id uuid primary key
);
alter table public.notices enable row level security;
alter table public.vault_instructors enable row level security;
revoke all on table public.notices, public.vault_instructors from public, anon, authenticated;
grant select, insert, update, delete on public.notices to service_role;
grant select on public.vault_instructors to service_role;

-- Permission and write are checked in the same SQL statement, not only in the API beforehand.
create or replace function public.vault_update_notice(p_actor_id uuid, p_notice_id uuid, p_title text, p_content text)
returns setof public.notices
language sql security invoker set search_path = public, pg_temp as $$
  update public.notices n set title = p_title, content = p_content, updated_at = now()
  where n.id = p_notice_id
    and exists (select 1 from public.vault_instructors i where i.user_id = p_actor_id)
  returning n.*;
$$;
revoke all on function public.vault_update_notice(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.vault_update_notice(uuid, uuid, text, text) to service_role;
commit;

-- Table Editor: notices (fictional notice), vault_instructors (operator-approved instructor UUID).
-- Empty vault_instructors means no one may edit notices. No mapping table is needed.
-- Existing notes, owner assignments, Auth rows and other tables are preserved.
