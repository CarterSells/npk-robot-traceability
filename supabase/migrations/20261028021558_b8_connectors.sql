begin;
create table public.integration_connections(
 org_id uuid not null,id uuid not null default gen_random_uuid(),project_id uuid not null,robot_id text not null,
 provider text not null check(provider='onshape'),document_id text not null check(document_id~'^[a-f0-9]{24}$'),
 created_by uuid not null references auth.users,status text not null default 'pending' check(status in ('pending','connected','disconnected','reconnect_required')),
 write_enabled boolean not null default false,secret jsonb,revision integer not null default 0,
 lease uuid,lease_until timestamptz,next_call_at timestamptz,created_at timestamptz not null default clock_timestamp(),
 primary key(org_id,id),unique(id),foreign key(org_id,project_id,robot_id) references public.project_robots on delete cascade
);
create table public.integration_oauth(
 state_hash text primary key check(state_hash~'^[a-f0-9]{64}$'),binding_hash text not null,
 org_id uuid not null,connection_id uuid not null,actor_id uuid not null references auth.users,session_id uuid not null,
 expires_at timestamptz not null default clock_timestamp()+interval '10 minutes',used_at timestamptz,
 foreign key(org_id,connection_id) references public.integration_connections on delete cascade
);
create table public.integration_jobs(
 org_id uuid not null,id uuid not null,connection_id uuid not null,actor_id uuid not null references auth.users,
 kind text not null check(kind in ('create_version','export_step')),parameters jsonb not null,body_hash text not null,
 status text not null default 'queued' check(status in ('queued','dispatching','active','completed','failed','unknown','rejected')),
 provider_id text,output jsonb,lease uuid,lease_until timestamptz,attempts integer not null default 0,next_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '1 hour',created_at timestamptz not null default clock_timestamp(),
 primary key(org_id,id),foreign key(org_id,connection_id) references public.integration_connections on delete cascade
);
create index integration_jobs_due on public.integration_jobs(next_at) where status in ('queued','active','dispatching');
create table public.integration_notifications(
 org_id uuid not null,connection_id uuid not null,message_id text not null,body_hash text not null,
 received_at timestamptz not null default clock_timestamp(),primary key(org_id,connection_id,message_id),
 foreign key(org_id,connection_id) references public.integration_connections on delete cascade
);
create table public.integration_budget(provider text primary key,period integer not null,calls integer not null default 0,call_limit integer not null default 2000 check(call_limit between 1 and 1000000));
insert into public.integration_budget(provider,period) values('onshape',extract(year from clock_timestamp())::int);
do $$declare t text;begin
 foreach t in array array['integration_connections','integration_oauth','integration_jobs','integration_notifications','integration_budget'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create function public.integration_command(p_action text,p_org uuid,p_actor uuid,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.integration_connections;s public.integration_oauth;j public.integration_jobs;b public.integration_budget;v uuid;now_at timestamptz:=clock_timestamp();
begin
 if p_action='consume_oauth' then
  select * into s from public.integration_oauth where state_hash=p_data->>'state_hash' for update;
  if s.state_hash is null or s.used_at is not null or s.expires_at<=clock_timestamp() or s.binding_hash<>p_data->>'binding_hash'
   or not public.app_session_allowed(s.actor_id,s.session_id) or not public.org_capability(s.org_id,s.actor_id,'integrations') then raise exception 'forbidden';end if;
  update public.integration_oauth set used_at=clock_timestamp() where state_hash=s.state_hash;
  return to_jsonb(s)-'binding_hash'-'state_hash';
 end if;
 if p_action='claim_job' then
  select * into j from public.integration_jobs where status in ('queued','active','dispatching') and next_at<=clock_timestamp() and (lease_until is null or lease_until<clock_timestamp()) order by next_at for update skip locked limit 1;
  if j.id is null then return null;end if;
  if j.status='active' and j.created_at<clock_timestamp()-interval '24 hours' then
   update public.integration_jobs set status='unknown',lease=null,lease_until=null where org_id=j.org_id and id=j.id;return jsonb_build_object('skipped',true);
  end if;
  select * into c from public.integration_connections where org_id=j.org_id and id=j.connection_id;
  if j.status='dispatching' then
   update public.integration_jobs set status='unknown',lease=null,lease_until=null where org_id=j.org_id and id=j.id;return jsonb_build_object('skipped',true);
  end if;
  if c.status<>'connected' or not public.org_capability(j.org_id,j.actor_id,'integrations') or (j.status='queued' and j.expires_at<=clock_timestamp()) then
   update public.integration_jobs set status='rejected' where org_id=j.org_id and id=j.id;return jsonb_build_object('skipped',true);
  end if;
  v:=gen_random_uuid();
  update public.integration_jobs set lease=v,lease_until=clock_timestamp()+interval '2 minutes',attempts=attempts+1 where org_id=j.org_id and id=j.id;
  return to_jsonb(j)||jsonb_build_object('lease',v);
 end if;
 if p_action in ('finish_job','dispatch_job') then
  select * into j from public.integration_jobs where org_id=p_org and id=(p_data->>'id')::uuid for update;
  if j.id is null or j.lease is distinct from (p_data->>'lease')::uuid or j.lease_until<=clock_timestamp() then raise exception 'version_conflict';end if;
  if p_action='dispatch_job' then
   select * into c from public.integration_connections where org_id=j.org_id and id=j.connection_id;
   if j.status<>'queued' or j.expires_at<=clock_timestamp() or c.status<>'connected' or not public.org_capability(j.org_id,j.actor_id,'integrations') then raise exception 'forbidden';end if;
   update public.integration_jobs set status='dispatching' where org_id=j.org_id and id=j.id;return jsonb_build_object('saved',true);
  end if;
  if p_data->>'status' not in ('queued','active','completed','failed','unknown','rejected') or (p_data->>'status'='queued' and j.status<>'queued') then raise exception 'invalid_status';end if;
  update public.integration_jobs set status=p_data->>'status',provider_id=coalesce(p_data->>'provider_id',provider_id),output=p_data->'output',lease=null,lease_until=null,
   next_at=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,least(attempts,7)))::int) where org_id=p_org and id=j.id;
  return jsonb_build_object('saved',true);
 end if;
 if not public.org_capability(p_org,p_actor,'integrations') then raise exception 'forbidden';end if;
 if p_action='list' then
  return jsonb_build_object('connections',coalesce((select jsonb_agg(to_jsonb(x)) from(select id,project_id,robot_id,document_id,status,write_enabled,created_at from public.integration_connections where org_id=p_org order by created_at limit 100)x),'[]'::jsonb),
   'jobs',coalesce((select jsonb_agg(to_jsonb(x)) from(select id,connection_id,kind,status,provider_id,output,created_at from public.integration_jobs where org_id=p_org order by created_at desc limit 50)x),'[]'::jsonb));
 end if;
 if p_action='create' then
  perform 1 from public.organizations where id=p_org for update;
  if (select count(*) from public.integration_connections where org_id=p_org)>=20 then raise exception 'connection_limit';end if;
  insert into public.integration_connections(org_id,id,project_id,robot_id,provider,document_id,created_by,write_enabled)
   values(p_org,(p_data->>'id')::uuid,(p_data->>'project_id')::uuid,p_data->>'robot_id','onshape',p_data->>'document_id',p_actor,coalesce((p_data->>'write_enabled')::boolean,false));
  insert into public.audit_events(org_id,actor_id,action) values(p_org,p_actor,'integration_created');
  return jsonb_build_object('id',p_data->>'id');
 end if;
 select * into c from public.integration_connections where org_id=p_org and id=(p_data->>'connection_id')::uuid for update;
 if c.id is null then raise exception 'forbidden';end if;
 if p_action='begin_oauth' then
  if not public.app_session_allowed(p_actor,(p_data->>'session_id')::uuid) then raise exception 'forbidden';end if;
  insert into public.integration_oauth(state_hash,binding_hash,org_id,connection_id,actor_id,session_id) values(p_data->>'state_hash',p_data->>'binding_hash',p_org,c.id,p_actor,(p_data->>'session_id')::uuid);
  return jsonb_build_object('write_enabled',c.write_enabled,'revision',c.revision);
 elsif p_action='activate' then
  if not public.app_session_allowed(p_actor,(p_data->>'session_id')::uuid) then raise exception 'forbidden';end if;
  if c.revision<>(p_data->>'revision')::int then raise exception 'version_conflict';end if;
  update public.integration_connections set status='connected',secret=p_data->'secret',revision=revision+1,lease=null,lease_until=null where org_id=p_org and id=c.id;
 elsif p_action='disconnect' then
  update public.integration_connections set status='disconnected',secret=null,revision=revision+1,lease=null,lease_until=null where org_id=p_org and id=c.id;
  update public.integration_jobs set status=case when status='dispatching' then 'unknown' else 'rejected' end where org_id=p_org and connection_id=c.id and status in ('queued','dispatching');
 elsif p_action='lease' then
  if c.status<>'connected' or c.secret is null then raise exception 'forbidden';end if;
  if c.lease is not null then
   if c.lease_until<=clock_timestamp() then
    -- A crashed refresh may have rotated a token. Do not race a new refresh.
    update public.integration_connections set status='reconnect_required',secret=null,lease=null,lease_until=null,revision=revision+1 where org_id=p_org and id=c.id;
    return jsonb_build_object('reconnect_required',true);
   end if;
   return jsonb_build_object('busy',true);
  end if;
  v:=gen_random_uuid();update public.integration_connections set lease=v,lease_until=clock_timestamp()+interval '2 minutes' where org_id=p_org and id=c.id;
  return to_jsonb(c)||jsonb_build_object('lease',v);
 elsif p_action in ('reserve_call','release','rotate') then
  if c.status<>'connected' or c.lease is distinct from (p_data->>'lease')::uuid or c.lease_until<=clock_timestamp() then raise exception 'forbidden';end if;
  if p_action='reserve_call' then
   if c.next_call_at>clock_timestamp() then return jsonb_build_object('wait_ms',ceil(extract(epoch from(c.next_call_at-clock_timestamp()))*1000));end if;
   select * into b from public.integration_budget where provider='onshape' for update;
   if b.period<>extract(year from clock_timestamp())::int then b.calls:=0;end if;
   if b.calls>=b.call_limit then raise exception 'api_budget_exhausted';end if;
   update public.integration_budget set period=extract(year from clock_timestamp())::int,calls=b.calls+1 where provider='onshape';
   update public.integration_connections set next_call_at=clock_timestamp()+interval '1 second' where org_id=p_org and id=c.id;
   return jsonb_build_object('reserved',true);
  elsif p_action='rotate' then
   update public.integration_connections set secret=p_data->'secret',revision=revision+1 where org_id=p_org and id=c.id;
  else
   update public.integration_connections set lease=null,lease_until=null where org_id=p_org and id=c.id;
  end if;
 elsif p_action='import' then
  if c.status<>'connected' or c.lease is distinct from (p_data->>'lease')::uuid or c.lease_until<=clock_timestamp() then raise exception 'forbidden';end if;
  return public.append_records(p_org,p_actor,p_data->'capture');
 elsif p_action='enqueue' then
  if c.status<>'connected' then raise exception 'forbidden';end if;
  if p_data->>'kind'='create_version' and not c.write_enabled then raise exception 'forbidden';end if;
  select * into j from public.integration_jobs where org_id=p_org and id=(p_data->>'id')::uuid;
  if j.id is not null then
   if j.body_hash<>p_data->>'body_hash' or j.connection_id<>c.id then raise exception 'idempotency_conflict';end if;
   return jsonb_build_object('id',j.id,'duplicate',true);
  end if;
  if (select count(*) from public.integration_jobs where org_id=p_org and status in ('queued','active','dispatching'))>=1000 then raise exception 'integration_queue_full';end if;
  insert into public.integration_jobs(org_id,id,connection_id,actor_id,kind,parameters,body_hash) values(p_org,(p_data->>'id')::uuid,c.id,p_actor,p_data->>'kind',p_data->'parameters',p_data->>'body_hash');
  insert into public.audit_events(org_id,actor_id,action) values(p_org,p_actor,'integration_enqueued');
  return jsonb_build_object('id',p_data->>'id','duplicate',false);
 elsif p_action='reconcile' then
  select * into j from public.integration_jobs where org_id=p_org and id=(p_data->>'id')::uuid and connection_id=c.id for update;
  if j.id is null or j.status<>'unknown' or c.status<>'connected' then raise exception 'forbidden';end if;
  if p_data->>'status' not in ('active','completed','failed') then raise exception 'invalid_status';end if;
  update public.integration_jobs set provider_id=p_data->>'provider_id',status=p_data->>'status',output=p_data->'output',lease=null,lease_until=null,next_at=clock_timestamp() where org_id=p_org and id=j.id;
  insert into public.audit_events(org_id,actor_id,action) values(p_org,p_actor,'integration_reconciled');
 elsif p_action='notification' then
  if c.status<>'connected' then raise exception 'forbidden';end if;
  if exists(select 1 from public.integration_notifications where org_id=p_org and connection_id=c.id and message_id=p_data->>'message_id' and body_hash<>p_data->>'body_hash') then raise exception 'idempotency_conflict';end if;
  insert into public.integration_notifications(org_id,connection_id,message_id,body_hash) values(p_org,c.id,p_data->>'message_id',p_data->>'body_hash') on conflict do nothing;
 else raise exception 'invalid_action';
 end if;
 if p_action in ('activate','disconnect','enqueue') then insert into public.audit_events(org_id,actor_id,action) values(p_org,p_actor,'integration_'||p_action);end if;
 return jsonb_build_object('saved',true);
end $$;
revoke all on function public.integration_command(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.integration_command(text,uuid,uuid,jsonb) to service_role;
commit;
