-- SQL Editor: review and execute. No existing notes or audit rows are changed.
begin;
create table if not exists public.vault_backup_targets (
  owner_id uuid not null, note_id uuid not null, primary key(owner_id,note_id)
);
create table if not exists public.vault_note_backups (
  backup_id uuid primary key default gen_random_uuid(), note_id uuid not null,
  owner_id uuid not null, title text not null, content text not null,
  note_created_at timestamptz not null, content_hash text not null,
  backed_up_at timestamptz not null default now(), unique(owner_id,note_id)
);
create table if not exists public.vault_restore_audit (
  event_id uuid primary key default gen_random_uuid(), backup_id uuid not null,
  note_id uuid not null, actor_id uuid not null, operation text not null,
  content_hash text not null, at timestamptz not null default now()
);
alter table public.vault_backup_targets enable row level security;
alter table public.vault_note_backups enable row level security;
alter table public.vault_restore_audit enable row level security;
revoke all on public.vault_backup_targets,public.vault_note_backups,public.vault_restore_audit
  from public,anon,authenticated,service_role;

create or replace function public.vault_note_hash(p_id uuid,p_owner uuid,p_title text,p_content text)
returns text language sql immutable set search_path=pg_catalog as $$
 select encode(sha256(convert_to(jsonb_build_array(p_id,p_owner,p_title,p_content)::text,'UTF8')),'hex');
$$;
create or replace function public.vault_keep_backup()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin raise exception 'immutable_backup_or_audit'; end;
$$;
drop trigger if exists vault_backup_immutable on public.vault_note_backups;
create trigger vault_backup_immutable before update or delete on public.vault_note_backups
for each row execute function public.vault_keep_backup();
drop trigger if exists vault_audit_immutable on public.vault_restore_audit;
create trigger vault_audit_immutable before update or delete on public.vault_restore_audit
for each row execute function public.vault_keep_backup();

create or replace function public.vault_backup_note(p_actor_id uuid,p_note_id uuid)
returns table(backup_id uuid,note_id uuid,content_hash text,backed_up_at timestamptz)
language plpgsql security definer set search_path=pg_catalog as $$
declare n public.notes%rowtype; b public.vault_note_backups%rowtype;
begin
 if not exists(select 1 from public.vault_backup_targets t where t.owner_id=p_actor_id and t.note_id=p_note_id) then return; end if;
 select * into n from public.notes x where x.id=p_note_id and x.owner_id=p_actor_id for share;
 if not found then return; end if;
 insert into public.vault_note_backups(note_id,owner_id,title,content,note_created_at,content_hash)
 values(n.id,n.owner_id,n.title,n.content,n.created_at,public.vault_note_hash(n.id,n.owner_id,n.title,n.content)) returning * into b;
 insert into public.vault_restore_audit(backup_id,note_id,actor_id,operation,content_hash)
 values(b.backup_id,b.note_id,p_actor_id,'backup',b.content_hash);
 return query select b.backup_id,b.note_id,b.content_hash,b.backed_up_at;
end;
$$;
create or replace function public.vault_preview_note_backup(p_actor_id uuid,p_backup_id uuid)
returns table(backup_id uuid,note_id uuid,content_hash text,current_hash text,verified boolean)
language sql security definer set search_path=pg_catalog as $$
 select b.backup_id,b.note_id,b.content_hash,
 case when n.id is null then null else public.vault_note_hash(n.id,n.owner_id,n.title,n.content) end,
 b.content_hash=public.vault_note_hash(b.note_id,b.owner_id,b.title,b.content)
 from public.vault_note_backups b
 join public.vault_backup_targets t on t.owner_id=b.owner_id and t.note_id=b.note_id
 left join public.notes n on n.id=b.note_id
 where b.backup_id=p_backup_id and b.owner_id=p_actor_id and (n.id is null or n.owner_id=p_actor_id);
$$;
create or replace function public.vault_restore_note(p_actor_id uuid,p_backup_id uuid,p_confirm_hash text)
returns table(backup_id uuid,note_id uuid,content_hash text,verified boolean)
language plpgsql security definer set search_path=pg_catalog as $$
declare b public.vault_note_backups%rowtype; restored public.notes%rowtype;
begin
 select x.* into b from public.vault_note_backups x
 join public.vault_backup_targets t on t.owner_id=x.owner_id and t.note_id=x.note_id
 where x.backup_id=p_backup_id and x.owner_id=p_actor_id for share of x;
 if not found then return; end if;
 if p_confirm_hash is null or b.content_hash<>p_confirm_hash or b.content_hash<>public.vault_note_hash(b.note_id,b.owner_id,b.title,b.content)
 then raise exception 'backup_verification_failed' using errcode='22023'; end if;
 insert into public.notes as n(id,owner_id,title,content,created_at)
 values(b.note_id,b.owner_id,b.title,b.content,b.note_created_at)
 on conflict(id) do update set title=excluded.title,content=excluded.content
 where n.owner_id=b.owner_id returning * into restored;
 if not found then return; end if;
 if restored.id<>b.note_id or restored.owner_id<>b.owner_id
 or public.vault_note_hash(restored.id,restored.owner_id,restored.title,restored.content)<>b.content_hash
 then raise exception 'restore_verification_failed'; end if;
 insert into public.vault_restore_audit(backup_id,note_id,actor_id,operation,content_hash)
 values(b.backup_id,b.note_id,p_actor_id,'restore',b.content_hash);
 return query select b.backup_id,b.note_id,b.content_hash,true;
end;
$$;
revoke all on function public.vault_note_hash(uuid,uuid,text,text),public.vault_keep_backup(),
 public.vault_backup_note(uuid,uuid),public.vault_preview_note_backup(uuid,uuid),public.vault_restore_note(uuid,uuid,text)
 from public,anon,authenticated;
grant execute on function public.vault_backup_note(uuid,uuid),public.vault_preview_note_backup(uuid,uuid),
 public.vault_restore_note(uuid,uuid,text) to service_role;
commit;
-- After creation, Table Editor > vault_backup_targets: insert B's Auth UUID
-- into owner_id and the single fictional note UUID into note_id. No other rows.
