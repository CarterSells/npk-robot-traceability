-- Apply to a dedicated Supabase staging project first. No customer fixtures.
begin;
create table public.organizations (
  id uuid primary key default gen_random_uuid(), name text not null check (length(name) between 1 and 120),
  created_at timestamptz not null default now()
);
create table public.memberships (
  org_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references auth.users, role text not null check (role in ('owner','member','viewer')),
  primary key(org_id,user_id)
);
create table public.workspaces (
  org_id uuid primary key references public.organizations on delete cascade,
  version integer not null default 0 check(version >= 0),
  bundle jsonb not null default '{"format":"unify-local","version":1,"synthetic":false,"records":{"robots":[],"snapshots":[],"runs":[]},"corrections":[]}',
  updated_at timestamptz not null default now()
);
create table public.robots (
  org_id uuid not null references public.organizations on delete cascade, id text not null,
  payload jsonb not null, submitted_version integer not null check(submitted_version>0), primary key(org_id,id)
);
create table public.snapshots (
  org_id uuid not null, id text not null, revision integer not null check(revision>0), robot_id text not null,
  payload jsonb not null, submitted_version integer not null check(submitted_version>0), primary key(org_id,id,revision), unique(org_id,id,revision,robot_id),
  foreign key(org_id,robot_id) references public.robots on delete cascade
);
create table public.runs (
  org_id uuid not null, id text not null, robot_id text not null, snapshot_id text not null, snapshot_revision integer not null,
  payload jsonb not null, submitted_version integer not null check(submitted_version>0), primary key(org_id,id),
  foreign key(org_id,snapshot_id,snapshot_revision,robot_id) references public.snapshots(org_id,id,revision,robot_id) on delete cascade
);
create table public.corrections (
  org_id uuid not null, snapshot_id text not null, revision integer not null, prior_revision integer not null,
  payload jsonb not null, submitted_version integer not null check(submitted_version>0), primary key(org_id,snapshot_id,revision), check(revision=prior_revision+1),
  foreign key(org_id,snapshot_id,revision) references public.snapshots on delete cascade,
  foreign key(org_id,snapshot_id,prior_revision) references public.snapshots on delete cascade
);
-- Component definitions and evidence remain part of their exact immutable snapshot.
create view public.components with (security_invoker=true) as
  select org_id,id as snapshot_id,revision,payload->'values'->'hardware' as hardware,payload->'custom' as custom from public.snapshots;
create view public.evidence_references with (security_invoker=true) as
  select org_id,id as snapshot_id,revision,payload->'provenance' as provenance,payload->'custom' as custom from public.snapshots;
create table public.mappings (
  org_id uuid not null references public.organizations on delete cascade, id text not null, payload jsonb not null, submitted_version integer not null check(submitted_version>0), primary key(org_id,id)
);
create table public.investigations (
  org_id uuid not null, id uuid not null default gen_random_uuid(), run_id text not null,
  state text not null check(state in ('investigating','hypothesis','confirmed-by-engineer','unresolved')),
  evidence_note text, primary key(org_id,id), foreign key(org_id,run_id) references public.runs on delete cascade,
  check(state <> 'confirmed-by-engineer' or coalesce(length(trim(evidence_note)),0) > 0)
);
create table public.invitations (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations on delete cascade,
  email text not null, role text not null check(role in ('member','viewer')), token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null default now()+interval '7 days', used_at timestamptz, revoked_at timestamptz
);
create table public.collector_credentials (
  id uuid primary key default gen_random_uuid(), org_id uuid not null, robot_id text not null,
  created_by uuid not null references auth.users, token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null default now()+interval '90 days', revoked_at timestamptz,
  foreign key(org_id,robot_id) references public.robots on delete cascade
);
create table public.ingestion_receipts (
  org_id uuid not null references public.organizations on delete cascade, principal text not null, request_id text not null,
  body_hash text not null, version integer not null, primary key(org_id,principal,request_id)
);
create table public.audit_events (
  id bigint generated always as identity primary key, org_id uuid not null references public.organizations on delete cascade,
  actor_id uuid references auth.users, credential_id uuid, action text not null, recorded_at timestamptz not null default now(),
  workspace_version integer, unique(org_id,workspace_version)
);
-- Each immutable row links to the exact authenticated submission event.
do $$ declare t text; begin
  foreach t in array array['robots','snapshots','runs','corrections','mappings'] loop
    execute format('alter table public.%I add foreign key(org_id,submitted_version) references public.audit_events(org_id,workspace_version) deferrable initially deferred',t);
  end loop;
end $$;

create function public.is_org_member(target uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.memberships where org_id=target and user_id=auth.uid());
$$;
revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
do $$ declare t text; begin
  foreach t in array array['organizations','memberships','workspaces','robots','snapshots','runs','corrections','mappings','investigations','invitations','collector_credentials','ingestion_receipts','audit_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    if t not in ('invitations','collector_credentials','ingestion_receipts') then
      execute format('grant select on public.%I to authenticated',t);
      execute format('create policy member_read on public.%I for select to authenticated using (public.is_org_member(%I))',t,case when t='organizations' then 'id' else 'org_id' end);
    end if;
  end loop;
end $$;
grant select on public.components,public.evidence_references to authenticated;
revoke all on public.components,public.evidence_references from anon;
grant usage,select on sequence public.audit_events_id_seq to service_role;

create function public.reject_record_update() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'immutable_record'; end $$;
do $$ declare t text; begin
  foreach t in array array['robots','snapshots','runs','corrections','mappings','audit_events'] loop
    execute format('create trigger immutable before update on public.%I for each row execute function public.reject_record_update()',t);
  end loop;
end $$;

-- Only the trusted API can execute commands, after validating the Supabase user
-- and the entire versioned record contract. Never expose the service key.
create function public.beta_command(p_action text, p_org uuid, p_actor uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r text; w public.workspaces; c public.collector_credentials; inv public.invitations;
  item jsonb; old jsonb; b jsonb; v integer; v_principal text; receipt public.ingestion_receipts; result jsonb; target uuid;
begin
  if p_action='accept_invite' then
    select * into inv from public.invitations where token_hash=p_data->>'token_hash';
    if inv.id is null then raise exception 'forbidden'; end if;
    perform 1 from public.organizations where id=inv.org_id for update;
    if not found then raise exception 'forbidden'; end if;
    select * into inv from public.invitations where token_hash=p_data->>'token_hash' for update;
    if inv.id is null or inv.revoked_at is not null or inv.used_at is not null or inv.expires_at<=now()
      or not exists(select 1 from auth.users where id=p_actor and lower(email)=lower(inv.email) and email_confirmed_at is not null)
      then raise exception 'forbidden'; end if;
    insert into public.memberships values(inv.org_id,p_actor,inv.role) on conflict do nothing;
    update public.invitations set used_at=now() where id=inv.id;
    insert into public.audit_events(org_id,actor_id,action) values(inv.org_id,p_actor,'accept_invite');
    return jsonb_build_object('org_id',inv.org_id);
  end if;
  -- Serializes saves, revocation, membership changes, and deletion per organization.
  perform 1 from public.organizations where id=p_org for update;
  if not found then raise exception 'forbidden'; end if;
  select role into r from public.memberships where org_id=p_org and user_id=p_actor;
  if p_action='credential_lookup' or (p_action='save' and p_actor is null) then
    select * into c from public.collector_credentials where org_id=p_org and token_hash=p_data->>'credential_hash';
    if c.id is null or c.revoked_at is not null or c.expires_at<=now() or not exists(
      select 1 from public.memberships where org_id=p_org and user_id=c.created_by and role in ('owner','member')) then raise exception 'forbidden'; end if;
    r:='member';
    if p_action='credential_lookup' then return jsonb_build_object('robot_id',c.robot_id); end if;
  end if;
  if r is null then raise exception 'forbidden'; end if;
  if p_action='save' then
    if r='viewer' then raise exception 'forbidden'; end if;
    select * into w from public.workspaces where org_id=p_org for update;
    v_principal:=coalesce(p_actor::text,c.id::text);
    if length(p_data->>'request_id') not between 1 and 120 or (p_data->>'body_hash') !~ '^[a-f0-9]{64}$' then raise exception 'invalid_request'; end if;
    select * into receipt from public.ingestion_receipts where org_id=p_org and principal=v_principal and request_id=p_data->>'request_id';
    if found then
      if receipt.body_hash<>p_data->>'body_hash' then raise exception 'idempotency_conflict'; end if;
      return jsonb_build_object('version',receipt.version,'duplicate',true);
    end if;
    if w.version<>(p_data->>'expected_version')::integer then raise exception 'version_conflict'; end if;
    v:=w.version+1;
    b:=p_data->'bundle';
    if octet_length(b::text)>2097152 or b->>'format'<>'unify-local' or (b->>'version')::integer not in (1,2) then raise exception 'invalid_bundle'; end if;
    if jsonb_array_length(w.bundle->'records'->'robots')>0 and w.bundle->'synthetic'<>b->'synthetic' then raise exception 'record_conflict'; end if;
    -- Existing payloads must survive byte-semantically unchanged. JSONB ignores key order.
    for item in select value from jsonb_array_elements(w.bundle->'records'->'robots') loop
      if not (b->'records'->'robots' @> jsonb_build_array(item)) then raise exception 'record_conflict'; end if;
    end loop;
    for item in select value from jsonb_array_elements(w.bundle->'records'->'snapshots') loop
      if not (b->'records'->'snapshots' @> jsonb_build_array(item)) then raise exception 'record_conflict'; end if;
    end loop;
    for item in select value from jsonb_array_elements(w.bundle->'records'->'runs') loop
      if not (b->'records'->'runs' @> jsonb_build_array(item)) then raise exception 'record_conflict'; end if;
    end loop;
    if not (coalesce(b->'corrections','[]') @> (w.bundle->'corrections')) or not(coalesce(b->'mappings','[]') @> coalesce(w.bundle->'mappings','[]')) then raise exception 'record_conflict'; end if;
    for item in select value from jsonb_array_elements(b->'records'->'robots') loop
      select payload into old from public.robots where org_id=p_org and id=item->>'id';
      if found then if old<>item then raise exception 'record_conflict'; end if;
      else
        if c.id is not null and item->>'id'<>c.robot_id then raise exception 'forbidden'; end if;
        insert into public.robots values(p_org,item->>'id',item,v);
      end if;
    end loop;
    for item in select value from jsonb_array_elements(b->'records'->'snapshots') loop
      select payload into old from public.snapshots where org_id=p_org and id=item->>'id' and revision=(item->>'revision')::integer;
      if found then if old<>item then raise exception 'record_conflict'; end if;
      else
        if c.id is not null and (item->>'robotId'<>c.robot_id or (item->>'revision')::integer<>1) then raise exception 'forbidden'; end if;
        insert into public.snapshots values(p_org,item->>'id',(item->>'revision')::integer,item->>'robotId',item,v);
      end if;
    end loop;
    for item in select value from jsonb_array_elements(b->'records'->'runs') loop
      select payload into old from public.runs where org_id=p_org and id=item->>'id';
      if found then if old<>item then raise exception 'record_conflict'; end if;
      else
        if c.id is not null and item->>'robotId'<>c.robot_id then raise exception 'forbidden'; end if;
        insert into public.runs values(p_org,item->>'id',item->>'robotId',item->>'snapshotId',(item->>'snapshotRevision')::integer,item,v);
      end if;
    end loop;
    for item in select value from jsonb_array_elements(b->'corrections') loop
      select payload into old from public.corrections where org_id=p_org and snapshot_id=item->>'snapshotId' and revision=(item->>'revision')::integer;
      if found then if old<>item then raise exception 'record_conflict'; end if;
      else
        if c.id is not null then raise exception 'forbidden'; end if;
        insert into public.corrections values(p_org,item->>'snapshotId',(item->>'revision')::integer,(item->>'priorRevision')::integer,item,v);
      end if;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(b->'mappings','[]')) loop
      select payload into old from public.mappings where org_id=p_org and id=item->>'id';
      if found then if old<>item then raise exception 'record_conflict'; end if;
      else insert into public.mappings values(p_org,item->>'id',item,v); end if;
    end loop;
    update public.workspaces set bundle=b,version=v,updated_at=now() where org_id=p_org;
    insert into public.ingestion_receipts values(p_org,v_principal,p_data->>'request_id',p_data->>'body_hash',v);
    insert into public.audit_events(org_id,actor_id,credential_id,action,workspace_version) values(p_org,p_actor,c.id,'save',v);
    return jsonb_build_object('version',v,'duplicate',false);
  end if;
  if r<>'owner' then raise exception 'forbidden'; end if;
  case p_action
    when 'invite' then
      insert into public.invitations(org_id,email,role,token_hash) values(p_org,lower(p_data->>'email'),p_data->>'role',p_data->>'token_hash') returning jsonb_build_object('id',id,'expires_at',expires_at) into result;
    when 'revoke_invite' then update public.invitations set revoked_at=now() where org_id=p_org and id=(p_data->>'id')::uuid;
    when 'credential' then
      insert into public.collector_credentials(org_id,robot_id,created_by,token_hash) values(p_org,p_data->>'robot_id',p_actor,p_data->>'token_hash') returning jsonb_build_object('id',id,'expires_at',expires_at) into result;
    when 'revoke_credential' then update public.collector_credentials set revoked_at=now() where org_id=p_org and id=(p_data->>'id')::uuid;
    when 'access' then
      select jsonb_build_object('invitations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'email',email,'role',role,'expires_at',expires_at,'used_at',used_at,'revoked_at',revoked_at)) from public.invitations where org_id=p_org),'[]'),
        'credentials',coalesce((select jsonb_agg(jsonb_build_object('id',id,'robot_id',robot_id,'expires_at',expires_at,'revoked_at',revoked_at)) from public.collector_credentials where org_id=p_org),'[]')) into result;
      return result;
    when 'member' then
      target:=(p_data->>'user_id')::uuid;
      if exists(select 1 from public.memberships where org_id=p_org and user_id=target and role='owner') and
        (select count(*) from public.memberships where org_id=p_org and role='owner')<=1 then raise exception 'last_owner'; end if;
      if p_data->>'role'='remove' then delete from public.memberships where org_id=p_org and user_id=target;
      else update public.memberships set role=p_data->>'role' where org_id=p_org and user_id=target; end if;
    when 'delete_org' then
      if p_data->>'confirmation'<>p_org::text then raise exception 'confirmation_required'; end if;
      delete from public.organizations where id=p_org;
      return '{"deleted":true}';
    else raise exception 'invalid_action';
  end case;
  insert into public.audit_events(org_id,actor_id,action) values(p_org,p_actor,p_action);
  return coalesce(result,'{}');
end $$;
revoke all on function public.beta_command(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.beta_command(text,uuid,uuid,jsonb) to service_role;
commit;
