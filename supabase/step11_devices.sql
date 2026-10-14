-- Review, then run once in the existing project's SQL Editor before publishing stage 11.
-- No notes, owners, backups, existing grants or audit records are changed.
begin;
create table if not exists public.vault_app_credentials (
 credential_id text primary key, owner_id uuid not null, public_key text not null,
 counter bigint not null check(counter>=0), device_id text not null unique check(device_id ~ '^[a-f0-9]{16}$'),
 transports text[] not null default '{}', approved boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.vault_app_challenges (
 challenge_id uuid primary key default gen_random_uuid(), owner_id uuid not null,
 ceremony text not null check(ceremony in ('registration','authentication')),
 challenge text not null, expires_at timestamptz not null default (now()+interval '2 minutes'),
 used_at timestamptz
);
create table if not exists public.vault_app_grants (
 grant_hash text primary key check(grant_hash ~ '^[a-f0-9]{64}$'), owner_id uuid not null,
 credential_id text not null references public.vault_app_credentials(credential_id),
 expires_at timestamptz not null
);
alter table public.vault_app_credentials enable row level security;
alter table public.vault_app_challenges enable row level security;
alter table public.vault_app_grants enable row level security;
revoke all on public.vault_app_credentials,public.vault_app_challenges,public.vault_app_grants from public,anon,authenticated;
grant select,insert,update,delete on public.vault_app_credentials,public.vault_app_challenges,public.vault_app_grants to service_role;
create or replace function public.vault_consume_device_challenge(p_actor_id uuid,p_challenge_id uuid,p_ceremony text)
returns table(challenge text)
language sql security invoker set search_path=pg_catalog as $$
 update public.vault_app_challenges c set used_at=now()
 where c.challenge_id=p_challenge_id and c.owner_id=p_actor_id and c.ceremony=p_ceremony
 and c.used_at is null and c.expires_at>now() returning c.challenge;
$$;
revoke all on function public.vault_consume_device_challenge(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.vault_consume_device_challenge(uuid,uuid,text) to service_role;
commit;
-- Approval is performed by the operator in Table Editor, never by the student's HTTP request:
-- vault_app_credentials: match the public device_id shown on the requesting app,
-- verify the requester separately, then change only approved to true.
-- Change approved back to false to revoke immediately on the next protected request.
