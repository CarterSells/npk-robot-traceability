begin;
create table public.approved_google_identities (
 user_id uuid not null references auth.users on delete cascade,
 identity_id uuid primary key references auth.identities(id) on delete cascade,
 approved_at timestamptz not null default now()
);
create table public.approved_app_sessions (
 session_id uuid primary key references auth.sessions(id) on delete cascade,
 user_id uuid not null references auth.users on delete cascade,
 approved_at timestamptz not null default now(),revoked_at timestamptz
);
create index approved_sessions_user on public.approved_app_sessions(user_id);
alter table public.approved_google_identities enable row level security;
alter table public.approved_app_sessions enable row level security;
revoke all on public.approved_google_identities,public.approved_app_sessions from public,anon,authenticated;
grant all on public.approved_google_identities,public.approved_app_sessions to service_role;
-- Preserve existing email-only sessions. Existing linked Google sessions must sign in again.
insert into public.approved_app_sessions(session_id,user_id)
select s.id,s.user_id from auth.sessions s where not exists(select 1 from auth.identities i where i.user_id=s.user_id and i.provider='google');

create function public.app_session_allowed(p_user uuid,p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.approved_app_sessions a join auth.sessions s on s.id=a.session_id and s.user_id=a.user_id where a.user_id=p_user and a.session_id=p_session and a.revoked_at is null and (s.not_after is null or s.not_after>now()));
$$;
create function public.approve_app_session(p_user uuid,p_session uuid,p_google uuid default null,p_link boolean default false) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.sessions where id=p_session and user_id=p_user and (not_after is null or not_after>now())) then raise exception 'forbidden'; end if;
 if p_google is not null then
  if not exists(select 1 from auth.identities where id=p_google and user_id=p_user and provider='google') then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.approved_google_identities where identity_id=p_google and user_id=p_user) then
   if not p_link and exists(select 1 from auth.identities where user_id=p_user and provider<>'google') then raise exception 'linking_required'; end if;
   insert into public.approved_google_identities(user_id,identity_id) values(p_user,p_google);
  end if;
 end if;
 insert into public.approved_app_sessions(session_id,user_id) values(p_session,p_user) on conflict(session_id) do nothing;
 return public.app_session_allowed(p_user,p_session);
end $$;
create function public.revoke_app_session(p_user uuid,p_session uuid,p_all boolean default false) returns void
language sql security definer set search_path='' as $$
 update public.approved_app_sessions set revoked_at=now() where user_id=p_user and (p_all or session_id=p_session);
$$;
revoke all on function public.app_session_allowed(uuid,uuid),public.approve_app_session(uuid,uuid,uuid,boolean),public.revoke_app_session(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.app_session_allowed(uuid,uuid),public.approve_app_session(uuid,uuid,uuid,boolean),public.revoke_app_session(uuid,uuid,boolean) to service_role;

-- Direct PostgREST cannot bypass application identity approval using an auto-linked JWT.
create or replace function public.is_org_member(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.app_session_allowed(auth.uid(),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')::uuid)
 and exists(select 1 from public.memberships where org_id=target and user_id=auth.uid());
$$;
revoke all on function public.is_org_member(uuid) from public,anon;
grant execute on function public.is_org_member(uuid) to authenticated;
commit;
