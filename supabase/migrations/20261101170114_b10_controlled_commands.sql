-- B10 simulation-only commands. Existing ingestion identities gain no new rights.
begin;
create table public.command_grants (
 org_id uuid not null,machine_id uuid not null,request_enabled boolean not null default false,
 dispatch_enabled boolean not null default false,granted_by uuid not null references auth.users,
 primary key(org_id,machine_id),foreign key(org_id,machine_id) references public.machine_identities on delete cascade
);
create table public.command_requests (
 org_id uuid not null,id uuid not null,correlation_id uuid not null,gateway_id uuid not null,
 project_id uuid not null,robot_id text not null,snapshot_id text not null,snapshot_revision integer not null,
 requested_by uuid references auth.users,requested_machine uuid,requested_credential uuid references public.collector_credentials,
 spec jsonb not null,expires_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),
 primary key(org_id,id),unique(id),check((requested_by is null)<>(requested_machine is null)),
 foreign key(org_id,gateway_id,robot_id) references public.machine_identities(org_id,id,robot_id) on delete cascade,
 foreign key(org_id,requested_machine) references public.machine_identities on delete cascade,
 foreign key(org_id,project_id,robot_id) references public.project_robots on delete restrict,
 foreign key(org_id,snapshot_id,snapshot_revision,robot_id) references public.snapshots(org_id,id,revision,robot_id) on delete cascade,
 check(spec->>'kind'='simulation.check' and spec->>'reality'='simulation')
);
create table public.command_states (
 org_id uuid not null,id uuid not null,state text not null default 'requested'
 check(state in ('requested','approved','dispatched','acknowledged','executing','completed','rejected','expired','unknown')),
 approved_by uuid references auth.users,approved_at timestamptz,cancel_requested_at timestamptz,
 outcome text check(outcome in ('succeeded','failed','cancelled')),stop_confirmed boolean not null default false,
 updated_at timestamptz not null default clock_timestamp(),primary key(org_id,id),
 foreign key(org_id,id) references public.command_requests on delete cascade
);
create table public.command_events (
 org_id uuid not null,command_id uuid not null,event_id uuid not null default gen_random_uuid(),
 ordinal bigint generated always as identity unique,actor_id uuid references auth.users,machine_id uuid,
 payload jsonb not null,received_at timestamptz not null default clock_timestamp(),primary key(org_id,command_id,event_id),
 foreign key(org_id,command_id) references public.command_requests on delete cascade,
 foreign key(org_id,machine_id) references public.machine_identities on delete cascade
);
create index command_gateway_page on public.command_requests(org_id,gateway_id,id);
create index command_requester on public.command_requests(org_id,requested_machine,requested_by);
create index command_event_page on public.command_events(org_id,command_id,ordinal);
do $$declare t text;begin
 foreach t in array array['command_grants','command_requests','command_states','command_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create trigger immutable before update on public.command_requests for each row execute function public.reject_record_update();
create trigger immutable before update on public.command_events for each row execute function public.reject_record_update();

-- Current permission truth, never cached token claims. The caller holds the org lock.
create function public.command_machine_allowed(p_org uuid,p_machine uuid,p_dispatch boolean) returns boolean
language sql security invoker set search_path='' as $$
 select exists(select 1 from public.machine_identities m join public.command_grants g on g.org_id=m.org_id and g.machine_id=m.id
 where m.org_id=p_org and m.id=p_machine and m.revoked_at is null
 and public.org_capability(p_org,m.created_by,'credentials') and public.org_capability(p_org,g.granted_by,'approve_job')
 and (case when p_dispatch then m.kind='gateway' and g.dispatch_enabled else m.kind='api_client' and g.request_enabled end)
 and exists(select 1 from public.collector_credentials c where c.org_id=m.org_id and c.machine_id=m.id and c.revoked_at is null and c.expires_at>clock_timestamp())
 and exists(select 1 from public.project_robots pr where pr.org_id=m.org_id and pr.project_id=m.project_id and pr.robot_id=m.robot_id));
$$;
create function public.command_authorized(p_org uuid,p_id uuid) returns boolean
language sql security invoker set search_path='' as $$
 select exists(select 1 from public.command_requests r join public.command_states s using(org_id,id)
 where r.org_id=p_org and r.id=p_id and public.command_machine_allowed(r.org_id,r.gateway_id,true)
 and public.org_capability(r.org_id,s.approved_by,'approve_job')
 and (case when r.requested_by is not null then public.org_capability(r.org_id,r.requested_by,'request_job')
 else public.command_machine_allowed(r.org_id,r.requested_machine,false) and exists(select 1 from public.collector_credentials c where c.id=r.requested_credential and c.revoked_at is null and c.expires_at>clock_timestamp()) end));
$$;

create function public.command_control(p_org uuid,p_actor uuid,p_hash text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare tenant uuid:=p_org;action text:=p_data->>'action';c public.collector_credentials;m public.machine_identities;
 target public.machine_identities;r public.command_requests;s public.command_states;e public.command_events;
 cid uuid;v jsonb;rows jsonb;t timestamptz;new_state text;allowed boolean;
begin
 if p_hash is not null then
  if p_actor is not null or p_org is not null then raise exception 'forbidden';end if;
  select * into c from public.collector_credentials where token_hash=p_hash and machine_id is not null;
  if c.id is null then raise exception 'forbidden';end if;tenant:=c.org_id;
 end if;
 perform 1 from public.organizations where id=tenant for update;
 if not found then raise exception 'forbidden';end if;
 t:=clock_timestamp();
 if p_hash is not null then
  select * into c from public.collector_credentials where id=c.id;
  select * into m from public.machine_identities where org_id=tenant and id=c.machine_id;
  if c.revoked_at is not null or c.expires_at<=t or m.id is null or m.revoked_at is not null
   or not public.command_machine_allowed(tenant,m.id,action in ('dispatch','report') or m.kind='gateway') then raise exception 'forbidden';end if;
  if m.window_at is null or m.window_at<=t-interval '1 minute' then m.window_at:=t;m.window_count:=0;end if;
  if m.window_count>=m.per_minute then return '{"error_code":"rate_limited"}';end if;
  update public.machine_identities set window_at=m.window_at,window_count=m.window_count+1,last_seen_at=t where org_id=tenant and id=m.id;
  update public.collector_credentials set last_used_at=t where id=c.id;
 elsif not public.org_capability(tenant,p_actor,'read_internal') then raise exception 'forbidden';end if;

 if action='grant' then
  if m.id is not null or not public.org_capability(tenant,p_actor,'approve_job') then raise exception 'forbidden';end if;
  select * into target from public.machine_identities where org_id=tenant and id=(p_data->>'machine_id')::uuid and revoked_at is null;
  if target.id is null or ((p_data->>'request_enabled')::boolean and target.kind<>'api_client') or ((p_data->>'dispatch_enabled')::boolean and target.kind<>'gateway') then raise exception 'forbidden';end if;
  insert into public.command_grants values(tenant,target.id,(p_data->>'request_enabled')::boolean,(p_data->>'dispatch_enabled')::boolean,p_actor)
   on conflict(org_id,machine_id) do update set request_enabled=excluded.request_enabled,dispatch_enabled=excluded.dispatch_enabled,granted_by=excluded.granted_by;
  insert into public.audit_events(org_id,actor_id,action) values(tenant,p_actor,'command_grant_changed');
  return '{"saved":true}';
 end if;
 if action='list' then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (
   select cr.id,cr.spec,cs.state,cs.approved_by,cs.cancel_requested_at,cs.outcome,cs.stop_confirmed,cs.updated_at,
    case when cr.expires_at<=t and cs.state in ('requested','approved') then 'expired'
     when cr.expires_at<=t and cs.state in ('dispatched','acknowledged','executing') then 'unknown' else cs.state end as effective_state
   from public.command_requests cr join public.command_states cs using(org_id,id)
   where cr.org_id=tenant and (m.id is null or cr.gateway_id=m.id or cr.requested_machine=m.id)
    and (p_data->>'after' is null or cr.id>(p_data->>'after')::uuid) order by cr.id limit 25
  ) q;
  return jsonb_build_object('rows',rows,'next',case when jsonb_array_length(rows)=25 then rows->24->>'id' else null end);
 end if;
 cid:=(p_data->>'id')::uuid;
 if action='request' then
  if (m.id is null and not public.org_capability(tenant,p_actor,'request_job')) or (m.id is not null and m.kind<>'api_client') then raise exception 'forbidden';end if;
  select * into target from public.machine_identities where org_id=tenant and id=(p_data->>'gateway_id')::uuid;
  if not public.command_machine_allowed(tenant,target.id,true) or target.id is null
   or (m.id is not null and (m.project_id<>target.project_id or m.robot_id<>target.robot_id)) then raise exception 'forbidden';end if;
  select * into r from public.command_requests where org_id=tenant and id=cid;
  if r.id is not null then
   if r.spec<>p_data or r.requested_by is distinct from p_actor or r.requested_machine is distinct from m.id then raise exception 'idempotency_conflict';end if;
   return jsonb_build_object('id',cid,'duplicate',true);
  end if;
  if p_data->>'kind' is distinct from 'simulation.check' or p_data->>'reality' is distinct from 'simulation'
   or jsonb_typeof(p_data->'parameters'->'checks') is distinct from 'number'
   or (p_data->'parameters'->>'checks')::numeric not between 1 and 10
   or (p_data->'parameters'->>'checks')::numeric<>trunc((p_data->'parameters'->>'checks')::numeric)
   or p_data->'parameters'<>jsonb_build_object('checks',p_data->'parameters'->'checks')
   or (p_data->>'expires_at')::timestamptz<=t or (p_data->>'expires_at')::timestamptz>t+interval '1 hour' then raise exception 'invalid_command';end if;
  if (select count(*) from public.command_states where org_id=tenant and state in ('requested','approved','dispatched','acknowledged','executing','unknown'))>=1000 then raise exception 'command_queue_full';end if;
  insert into public.command_requests(org_id,id,correlation_id,gateway_id,project_id,robot_id,snapshot_id,snapshot_revision,requested_by,requested_machine,requested_credential,spec,expires_at)
   values(tenant,cid,(p_data->>'correlation_id')::uuid,target.id,target.project_id,target.robot_id,p_data->>'snapshot_id',(p_data->>'snapshot_revision')::integer,p_actor,m.id,c.id,p_data,(p_data->>'expires_at')::timestamptz);
  insert into public.command_states(org_id,id) values(tenant,cid);
  insert into public.command_events(org_id,command_id,actor_id,machine_id,payload) values(tenant,cid,p_actor,m.id,jsonb_build_object('action','requested','approval_required',true));
  return jsonb_build_object('id',cid,'duplicate',false);
 end if;
 select * into r from public.command_requests where org_id=tenant and id=cid;
 select * into s from public.command_states where org_id=tenant and id=cid;
 if r.id is null or (m.id is not null and m.id<>r.gateway_id and m.id is distinct from r.requested_machine) then raise exception 'forbidden';end if;
 if action in ('dispatch','report') and (m.id is null or m.id<>r.gateway_id) then raise exception 'forbidden';end if;
 if action in ('approve','cancel','resolve') and (m.id is not null or not public.org_capability(tenant,p_actor,case when action in ('approve','resolve') then 'approve_job' else 'request_job' end)) then raise exception 'forbidden';end if;
 if action='report' then
  select * into e from public.command_events where org_id=tenant and command_id=cid and event_id=(p_data->>'event_id')::uuid;
  if e.event_id is not null then
   if e.payload<>p_data or e.machine_id<>m.id then raise exception 'idempotency_conflict';end if;
   return jsonb_build_object('duplicate',true,'state',s.state,'outcome',s.outcome,'stop_confirmed',s.stop_confirmed);
  end if;
 end if;
 -- Expiration after possible dispatch is uncertainty, never proof of a stop.
 if r.expires_at<=t and s.state in ('requested','approved','dispatched','acknowledged','executing') then
  s.state:=case when s.state in ('requested','approved') then 'expired' else 'unknown' end;
  s.updated_at:=t;
  update public.command_states set state=s.state,updated_at=t where org_id=tenant and id=cid;
  insert into public.command_events(org_id,command_id,payload) values(tenant,cid,jsonb_build_object('action','deadline','state',s.state));
 end if;
 if action='get' then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (select event_id,ordinal,actor_id,machine_id,payload,received_at from public.command_events where org_id=tenant and command_id=cid order by ordinal limit 100) q;
  return jsonb_build_object('request',to_jsonb(r),'status',to_jsonb(s),'events',rows);
 elsif action='approve' then
  if s.state='approved' then return jsonb_build_object('state',s.state);end if;
  if s.state<>'requested' or s.cancel_requested_at is not null then return jsonb_build_object('state',s.state,'denied',true);end if;
  update public.command_states set approved_by=p_actor,approved_at=t,state='approved',updated_at=t where org_id=tenant and id=cid;
  if not public.command_authorized(tenant,cid) then raise exception 'forbidden';end if;
  new_state:='approved';
 elsif action='resolve' then
  if s.state<>'unknown' or length(trim(coalesce(p_data->>'evidence',''))) not between 1 and 500
   or coalesce(p_data->>'outcome','') not in ('succeeded','failed','cancelled','not-started') then raise exception 'invalid_command_transition';end if;
  new_state:=case when p_data->>'outcome'='not-started' then 'rejected' else 'completed' end;
  update public.command_states set outcome=case when new_state='completed' then p_data->>'outcome' else null end,
   stop_confirmed=p_data->>'outcome'='cancelled' where org_id=tenant and id=cid;
  v:=p_data||jsonb_build_object('state',new_state,'method','manual simulation reconciliation');
 elsif action='cancel' then
  if s.cancel_requested_at is not null or s.state in ('completed','rejected','expired') then return jsonb_build_object('state',s.state,'cancel_requested',s.cancel_requested_at is not null,'stop_confirmed',s.stop_confirmed);end if;
  new_state:=case when s.state in ('requested','approved') then 'rejected' else s.state end;
  update public.command_states set cancel_requested_at=t where org_id=tenant and id=cid;
 elsif action='dispatch' then
  allowed:=public.command_authorized(tenant,cid);
  if s.state<>'approved' then
   return jsonb_build_object('state',s.state,'first_dispatch',false,'request',case when s.state in ('dispatched','acknowledged','executing','unknown') then to_jsonb(r) else null end,'cancel_requested',s.cancel_requested_at is not null);
  end if;
  if not allowed or s.cancel_requested_at is not null then new_state:='rejected';else new_state:='dispatched';end if;
 elsif action='report' then
  if (select count(*) from public.command_events where org_id=tenant and command_id=cid)>=90 then raise exception 'command_event_limit';end if;
  new_state:=p_data->>'state';
  if new_state is null or not (
   (new_state='acknowledged' and s.state='dispatched') or
   (new_state='executing' and s.state='acknowledged') or
   (new_state='completed' and s.state in ('executing','unknown')) or
   (new_state='rejected' and s.state in ('dispatched','acknowledged')) or
   (new_state='unknown' and s.state in ('dispatched','acknowledged','executing','unknown'))
  ) then raise exception 'invalid_command_transition';end if;
  if new_state='executing' and (not public.command_authorized(tenant,cid) or s.cancel_requested_at is not null or r.expires_at<=t) then
   new_state:='rejected';v:=jsonb_build_object('action','execution_denied','state','rejected');
  else
   if (new_state='completed' and coalesce(p_data->>'outcome','') not in ('succeeded','failed','cancelled'))
    or (new_state<>'completed' and p_data->>'outcome' is not null)
    or (p_data->>'stop_confirmed')::boolean is distinct from (coalesce(p_data->>'outcome','')='cancelled')
    or length(coalesce(p_data->>'reason','')) not between 1 and 240 then raise exception 'invalid_command';end if;
   update public.command_states set outcome=p_data->>'outcome',stop_confirmed=(p_data->>'stop_confirmed')::boolean where org_id=tenant and id=cid;
  end if;
  insert into public.command_events(org_id,command_id,event_id,machine_id,payload) values(tenant,cid,(p_data->>'event_id')::uuid,m.id,p_data);
 else raise exception 'invalid_action';end if;
 update public.command_states set state=new_state,updated_at=t where org_id=tenant and id=cid;
 if action<>'report' or v is not null then
  insert into public.command_events(org_id,command_id,actor_id,machine_id,payload) values(tenant,cid,p_actor,m.id,coalesce(v,jsonb_build_object('action',action,'state',new_state)));
 end if;
 select * into s from public.command_states where org_id=tenant and id=cid;
 return jsonb_build_object('state',new_state,'first_dispatch',action='dispatch' and new_state='dispatched','request',case when action='dispatch' and new_state='dispatched' then to_jsonb(r) else null end,'cancel_requested',s.cancel_requested_at is not null,'outcome',s.outcome,'stop_confirmed',s.stop_confirmed);
end $$;
revoke all on function public.command_machine_allowed(uuid,uuid,boolean),public.command_authorized(uuid,uuid),public.command_control(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.command_machine_allowed(uuid,uuid,boolean),public.command_authorized(uuid,uuid),public.command_control(uuid,uuid,text,jsonb) to service_role;
commit;
