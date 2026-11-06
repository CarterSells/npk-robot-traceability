-- Additive B5 transport. Legacy collector credentials and record storage are preserved.
begin;
create table public.machine_identities (
 org_id uuid not null references public.organizations on delete cascade,
 id uuid not null default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 120),
 kind text not null check(kind in ('collector','gateway','api_client')),
 project_id uuid not null, robot_id text not null,
 capabilities text[] not null check(cardinality(capabilities) between 1 and 2 and capabilities <@ array['events:write','receipts:read']::text[]),
 created_by uuid not null references auth.users, created_at timestamptz not null default now(), revoked_at timestamptz,
 per_minute integer not null check(per_minute between 1 and 600),
 window_at timestamptz, window_count integer not null default 0,
 last_seen_at timestamptz, last_ingested_at timestamptz, last_error text,
 accepted_count bigint not null default 0, duplicate_count bigint not null default 0, rejected_count bigint not null default 0,
 primary key(org_id,id), unique(id), unique(org_id,id,robot_id),
 foreign key(org_id,project_id,robot_id) references public.project_robots on delete restrict
);
alter table public.collector_credentials add column machine_id uuid;
alter table public.collector_credentials add column last_used_at timestamptz;
alter table public.collector_credentials add foreign key(org_id,machine_id,robot_id) references public.machine_identities(org_id,id,robot_id) on delete cascade;
create index collector_machine_tokens on public.collector_credentials(org_id,machine_id);
create table public.machine_events (
 org_id uuid not null, machine_id uuid not null, event_id uuid not null,
 schema_version integer not null check(schema_version=1), event_type text not null check(event_type='run.recorded'),
 source_sequence bigint not null check(source_sequence between 0 and 9007199254740991),
 run_id text not null, robot_id text not null, project_id uuid not null,
 observed_at timestamptz not null, received_at timestamptz not null default clock_timestamp(),
 clock_skew boolean not null, body_hash text not null check(body_hash~'^[a-f0-9]{64}$'),
 workspace_version integer not null,
 primary key(org_id,machine_id,event_id), unique(org_id,machine_id,source_sequence),
 foreign key(org_id,machine_id,robot_id) references public.machine_identities(org_id,id,robot_id) on delete cascade,
 foreign key(org_id,run_id,project_id) references public.run_projects(org_id,run_id,project_id) on delete cascade,
 foreign key(org_id,workspace_version) references public.audit_events(org_id,workspace_version) on delete cascade
);
create index machine_events_run on public.machine_events(org_id,run_id,project_id);
create index machine_events_audit on public.machine_events(org_id,workspace_version);
create index machine_identity_project on public.machine_identities(org_id,project_id,robot_id);
create trigger immutable before update on public.machine_events for each row execute function public.reject_record_update();
alter table public.machine_identities enable row level security;
alter table public.machine_events enable row level security;
revoke all on public.machine_identities,public.machine_events from public,anon,authenticated;
grant all on public.machine_identities,public.machine_events to service_role;
-- Internal members may read event metadata; client project grants never expose it.
grant select on public.machine_events to authenticated;
create policy internal_read on public.machine_events for select to authenticated using(public.is_org_member(org_id));

-- Service-only INVOKER functions; the API supplies the verified human, never the browser.
create function public.machine_admin(p_action text,p_org uuid,p_actor uuid,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare m public.machine_identities; result jsonb; token_id uuid; expiry timestamptz;
begin
 perform 1 from public.organizations where id=p_org for update;
 if not found or not public.org_capability(p_org,p_actor,'credentials') then raise exception 'forbidden'; end if;
 if p_action='list' then
  return jsonb_build_object('identities',coalesce((select jsonb_agg(to_jsonb(q)) from
   (select id,name,kind,project_id,robot_id,capabilities,revoked_at,per_minute,last_seen_at,last_ingested_at,last_error,accepted_count,duplicate_count,rejected_count from public.machine_identities where org_id=p_org order by created_at desc limit 100) q),'[]'),
   'credentials',coalesce((select jsonb_agg(to_jsonb(q)) from
   (select id,machine_id,expires_at,revoked_at,last_used_at from public.collector_credentials where org_id=p_org and machine_id is not null order by expires_at desc limit 500) q),'[]'),
   'scopes',coalesce((select jsonb_agg(to_jsonb(q)) from (select pr.project_id,pr.robot_id,p.name as project_name from public.project_robots pr join public.projects p on p.org_id=pr.org_id and p.id=pr.project_id where pr.org_id=p_org order by pr.project_id,pr.robot_id limit 500) q),'[]'));
 end if;
 if p_action='create' then
  if (select count(*) from public.machine_identities where org_id=p_org)>=100 then raise exception 'machine_limit'; end if;
  if not exists(select 1 from public.workspaces where org_id=p_org and incremental) then raise exception 'cutover_required'; end if;
  insert into public.machine_identities(org_id,name,kind,project_id,robot_id,capabilities,created_by,per_minute)
  values(p_org,p_data->>'name',p_data->>'kind',(p_data->>'project_id')::uuid,p_data->>'robot_id',array(select jsonb_array_elements_text(p_data->'capabilities')),p_actor,(p_data->>'per_minute')::integer) returning * into m;
 elsif p_action in ('rotate','revoke') then
  select * into m from public.machine_identities where org_id=p_org and id=(p_data->>'id')::uuid for update;
  if m.id is null then raise exception 'forbidden'; end if;
 elsif p_action='revoke_token' then
  update public.collector_credentials set revoked_at=clock_timestamp() where org_id=p_org and machine_id is not null and id=(p_data->>'id')::uuid returning machine_id into m.id;
  if not found then raise exception 'forbidden'; end if;
 else raise exception 'invalid_action'; end if;
 if p_action in ('create','rotate') then
  if m.revoked_at is not null or not public.org_capability(p_org,m.created_by,'credentials') then raise exception 'forbidden'; end if;
  if coalesce((p_data->>'expires_days')::integer,0) not between 1 and 90 then raise exception 'invalid_expiry'; end if;
  if p_action='rotate' then
   if coalesce((p_data->>'overlap_minutes')::integer,-1) not between 0 and 60 then raise exception 'invalid_overlap'; end if;
   -- Repeated rotations cannot accumulate indefinitely usable old secrets.
   if (select count(*) from public.collector_credentials where org_id=p_org and machine_id=m.id and revoked_at is null and expires_at>clock_timestamp())>1 then raise exception 'rotation_pending'; end if;
   update public.collector_credentials set expires_at=least(expires_at,clock_timestamp()+make_interval(mins=>(p_data->>'overlap_minutes')::integer)) where org_id=p_org and machine_id=m.id and revoked_at is null;
  end if;
  expiry:=clock_timestamp()+make_interval(days=>(p_data->>'expires_days')::integer);
  insert into public.collector_credentials(org_id,robot_id,created_by,token_hash,expires_at,machine_id)
   values(p_org,m.robot_id,m.created_by,p_data->>'token_hash',expiry,m.id) returning id into token_id;
  result:=jsonb_build_object('id',m.id,'credential_id',token_id,'expires_at',expiry);
 elsif p_action='revoke' then
  update public.machine_identities set revoked_at=clock_timestamp() where org_id=p_org and id=m.id;
  update public.collector_credentials set revoked_at=clock_timestamp() where org_id=p_org and machine_id=m.id;
 end if;
 insert into public.audit_events(org_id,actor_id,action) values(p_org,p_actor,'machine_'||p_action);
 return coalesce(result,'{}');
end $$;

create function public.machine_transport(p_hash text,p_event jsonb,p_body_hash text,p_event_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.collector_credentials; m public.machine_identities; e public.machine_events; result jsonb; b jsonb; run jsonb; t timestamptz:=clock_timestamp(); code text;
begin
 select * into c from public.collector_credentials where token_hash=p_hash and machine_id is not null;
 if c.id is null then raise exception 'forbidden'; end if;
 -- Same lock order as existing append, membership and admin commands.
 perform 1 from public.organizations where id=c.org_id for update;
 select * into m from public.machine_identities where org_id=c.org_id and id=c.machine_id for update;
 select * into c from public.collector_credentials where id=c.id;
 t:=clock_timestamp();
 if c.revoked_at is not null or c.expires_at<=t or m.id is null or m.revoked_at is not null
  or not public.org_capability(m.org_id,m.created_by,'credentials')
  or not exists(select 1 from public.project_robots where org_id=m.org_id and project_id=m.project_id and robot_id=m.robot_id)
  or not (case when p_event is null then 'receipts:read' else 'events:write' end=any(m.capabilities)) then raise exception 'forbidden'; end if;
 update public.collector_credentials set last_used_at=t where id=c.id;
 if m.window_at is null or m.window_at<=t-interval '1 minute' then m.window_at:=t; m.window_count:=0; end if;
 if m.window_count>=m.per_minute then
  update public.machine_identities set last_seen_at=t,last_error='rate_limited',rejected_count=rejected_count+1 where org_id=m.org_id and id=m.id;
  return '{"error_code":"rate_limited"}';
 end if;
 update public.machine_identities set window_at=m.window_at,window_count=m.window_count+1,last_seen_at=t where org_id=m.org_id and id=m.id;
 if p_event is null then
  select * into e from public.machine_events where org_id=m.org_id and machine_id=m.id and event_id=p_event_id;
  if e.event_id is null then return '{"error_code":"not_found"}'; end if;
 else
  if (p_event->>'source_identity')::uuid<>m.id then code:='scope_denied';
  elsif coalesce(p_body_hash,'')!~'^[a-f0-9]{64}$' or p_event->>'schema_version'<>'1' or p_event->>'event_type'<>'run.recorded' then code:='invalid_event';
  end if;
  if code is null then
   select * into e from public.machine_events where org_id=m.org_id and machine_id=m.id and event_id=(p_event->>'event_id')::uuid;
   if e.event_id is not null then
    if e.body_hash<>p_body_hash then code:='idempotency_conflict';
    else update public.machine_identities set duplicate_count=duplicate_count+1,last_error=null where org_id=m.org_id and id=m.id; end if;
   elsif exists(select 1 from public.machine_events where org_id=m.org_id and machine_id=m.id and source_sequence=(p_event->>'source_sequence')::bigint) then code:='sequence_conflict';
   else
    -- A failed record append rolls back only this inner block; health counters persist.
    begin
     b:=p_event->'payload'->'capture';run:=b->'records'->'runs'->0;
     if octet_length(p_event::text)>2097152 or jsonb_array_length(b->'records'->'runs')<>1 or run->>'id'<>p_event->>'run_id' or run->>'robotId'<>m.robot_id or (run->>'at')::timestamptz<>(p_event->>'observed_at')::timestamptz then raise exception 'scope_denied'; end if;
     result:=public.append_records(m.org_id,null,jsonb_build_object('credential_hash',p_hash,'bundle',b,'request_id','event:'||(p_event->>'event_id'),'body_hash',p_body_hash));
     insert into public.run_projects values(m.org_id,run->>'id',m.project_id,m.robot_id,null) on conflict do nothing;
     if not exists(select 1 from public.run_projects where org_id=m.org_id and run_id=run->>'id' and project_id=m.project_id) then raise exception 'scope_denied'; end if;
     insert into public.machine_events(org_id,machine_id,event_id,schema_version,event_type,source_sequence,run_id,robot_id,project_id,observed_at,clock_skew,body_hash,workspace_version)
      values(m.org_id,m.id,(p_event->>'event_id')::uuid,1,'run.recorded',(p_event->>'source_sequence')::bigint,run->>'id',m.robot_id,m.project_id,(p_event->>'observed_at')::timestamptz,(p_event->>'observed_at')::timestamptz>t+interval '5 minutes',p_body_hash,(result->>'version')::integer) returning * into e;
     update public.machine_identities set accepted_count=accepted_count+1,last_ingested_at=t,last_error=null where org_id=m.org_id and id=m.id;
     return jsonb_build_object('event_id',e.event_id,'source_identity',e.machine_id,'source_sequence',e.source_sequence,'received_at',e.received_at,'observed_at',e.observed_at,'clock_skew',e.clock_skew,'body_hash',e.body_hash,'version',e.workspace_version,'duplicate',false);
    exception when integrity_constraint_violation or data_exception or raise_exception then
     code:=case when sqlerrm='scope_denied' then 'scope_denied' when sqlerrm in ('record_conflict','idempotency_conflict') then 'record_conflict' else 'invalid_event' end;
    end;
   end if;
  end if;
  if code is not null then
   update public.machine_identities set rejected_count=rejected_count+1,last_error=code where org_id=m.org_id and id=m.id;
   return jsonb_build_object('error_code',code);
  end if;
 end if;
 return jsonb_build_object('event_id',e.event_id,'source_identity',e.machine_id,'source_sequence',e.source_sequence,'received_at',e.received_at,'observed_at',e.observed_at,'clock_skew',e.clock_skew,'body_hash',e.body_hash,'version',e.workspace_version,'duplicate',true);
end $$;
revoke all on function public.machine_admin(text,uuid,uuid,jsonb),public.machine_transport(text,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.machine_admin(text,uuid,uuid,jsonb),public.machine_transport(text,jsonb,text,uuid) to service_role;
commit;
