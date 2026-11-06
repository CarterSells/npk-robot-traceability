-- B6 evidence records only. Recording a request never executes a physical action.
begin;
create table public.execution_jobs (
 org_id uuid not null references public.organizations on delete cascade,id uuid not null,archive_id bigint generated always as identity unique,
 project_id uuid not null,robot_id text not null,created_at timestamptz not null default clock_timestamp(),
 primary key(org_id,id),unique(org_id,id,project_id,robot_id),
 foreign key(org_id,project_id,robot_id) references public.project_robots on delete restrict
);
create table public.execution_attempts (
 org_id uuid not null,id uuid not null,archive_id bigint generated always as identity unique,job_id uuid not null,project_id uuid not null,robot_id text not null,
 snapshot_id text not null,snapshot_revision integer not null,source_identity uuid not null,
 retry_of uuid,payload jsonb not null,created_by uuid not null references auth.users,
 created_at timestamptz not null default clock_timestamp(),primary key(org_id,id),unique(org_id,id,job_id),
 foreign key(org_id,job_id,project_id,robot_id) references public.execution_jobs(org_id,id,project_id,robot_id) on delete cascade,
 foreign key(org_id,snapshot_id,snapshot_revision,robot_id) references public.snapshots(org_id,id,revision,robot_id) on delete cascade,
 foreign key(org_id,retry_of,job_id) references public.execution_attempts(org_id,id,job_id),check(retry_of is null or retry_of<>id)
);
create table public.execution_events (
 org_id uuid not null,attempt_id uuid not null,event_id uuid not null,archive_id bigint generated always as identity unique,source_sequence bigint not null check(source_sequence between 0 and 9007199254740991),
 payload jsonb not null,body_hash text not null check(body_hash~'^[a-f0-9]{64}$'),
 author uuid not null references auth.users,received_at timestamptz not null default clock_timestamp(),
 primary key(org_id,attempt_id,event_id),unique(org_id,attempt_id,source_sequence),
 foreign key(org_id,attempt_id) references public.execution_attempts on delete cascade
);
create index execution_attempt_job on public.execution_attempts(org_id,job_id,project_id,robot_id);
create index execution_attempt_snapshot on public.execution_attempts(org_id,snapshot_id,snapshot_revision,robot_id);
create index execution_attempt_retry on public.execution_attempts(org_id,retry_of,job_id);
create index execution_attempt_page on public.execution_attempts(org_id,created_at,id);
do $$declare t text;begin
 foreach t in array array['execution_jobs','execution_attempts','execution_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy internal_read on public.%I for select to authenticated using(public.is_org_member(org_id))',t);
  execute format('create trigger immutable before update on public.%I for each row execute function public.reject_record_update()',t);
 end loop;
end $$;
create function public.execution_command(p_org uuid,p_actor uuid,p_data jsonb,p_machine uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a public.execution_attempts;e public.execution_events;b jsonb:=p_data->'attempt';v jsonb:=p_data->'event';pid uuid;aid uuid;source_id uuid:=coalesce(p_machine,p_actor);m public.machine_identities;
begin
 perform 1 from public.organizations where id=p_org for update;
 if not found or not public.org_capability(p_org,p_actor,'append_run') then raise exception 'forbidden';end if;
 if p_machine is not null then
  select * into m from public.machine_identities where org_id=p_org and id=p_machine and created_by=p_actor and revoked_at is null;
  if m.id is null or not ('events:write'=any(m.capabilities)) then raise exception 'forbidden';end if;
 end if;
 if p_data->>'action'='create' then
  if b->>'method'<>(case when p_machine is null then 'manual' else 'collector' end) or (b->>'source_identity')::uuid<>source_id then raise exception 'forbidden';end if;
  if p_machine is not null and ((p_data->>'project_id')::uuid<>m.project_id or b->>'robot_id'<>m.robot_id) then raise exception 'forbidden';end if;
  if (b->>'reality'='synthetic') is distinct from (select coalesce(history_synthetic,(bundle->>'synthetic')::boolean) from public.workspaces where org_id=p_org) then raise exception 'record_conflict';end if;
  aid:=(b->>'attempt_id')::uuid;pid:=(p_data->>'project_id')::uuid;
  select * into a from public.execution_attempts where org_id=p_org and id=aid;
  if a.id is not null then
   if a.payload<>b or a.project_id<>pid then raise exception 'idempotency_conflict';end if;
   return jsonb_build_object('attempt_id',aid,'duplicate',true);
  end if;
  insert into public.execution_jobs(org_id,id,project_id,robot_id) values(p_org,(b->>'job_id')::uuid,pid,b->>'robot_id') on conflict do nothing;
  insert into public.execution_attempts(org_id,id,job_id,project_id,robot_id,snapshot_id,snapshot_revision,source_identity,retry_of,payload,created_by)
   values(p_org,aid,(b->>'job_id')::uuid,pid,b->>'robot_id',b->>'snapshot_id',(b->>'snapshot_revision')::integer,source_id,(b->>'retry_of')::uuid,b,p_actor);
  insert into public.audit_events(org_id,actor_id,action) values(p_org,p_actor,'execution_attempt_recorded');
  return jsonb_build_object('attempt_id',aid,'duplicate',false);
 elsif p_data->>'action'='append' then
  aid:=(p_data->>'attempt_id')::uuid;
  select * into a from public.execution_attempts where org_id=p_org and id=aid;
  if a.id is null or a.source_identity<>source_id or (v->>'source_identity')::uuid<>source_id then raise exception 'forbidden';end if;
  if p_machine is not null and (a.project_id<>m.project_id or a.robot_id<>m.robot_id) then raise exception 'forbidden';end if;
  select * into e from public.execution_events where org_id=p_org and attempt_id=aid and event_id=(v->>'event_id')::uuid;
  if e.event_id is not null then
   if e.body_hash<>p_data->>'body_hash' then raise exception 'idempotency_conflict';end if;
   return jsonb_build_object('event_id',e.event_id,'received_at',e.received_at,'duplicate',true);
  end if;
  if exists(select 1 from public.execution_events where org_id=p_org and attempt_id=aid and source_sequence=(v->>'source_sequence')::bigint) then raise exception 'idempotency_conflict';end if;
  if (select count(*) from public.execution_events where org_id=p_org and attempt_id=aid)>=1000 then raise exception 'attempt_event_limit';end if;
  insert into public.execution_events(org_id,attempt_id,event_id,source_sequence,payload,body_hash,author)
   values(p_org,aid,(v->>'event_id')::uuid,(v->>'source_sequence')::bigint,v,p_data->>'body_hash',p_actor) returning * into e;
  insert into public.audit_events(org_id,actor_id,action) values(p_org,p_actor,'execution_evidence_recorded');
  return jsonb_build_object('event_id',e.event_id,'received_at',e.received_at,'duplicate',false);
 end if;
 raise exception 'invalid_action';
end $$;
revoke all on function public.execution_command(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.execution_command(uuid,uuid,jsonb,uuid) to service_role;
grant usage on sequence public.execution_jobs_archive_id_seq,public.execution_attempts_archive_id_seq,public.execution_events_archive_id_seq to service_role;

create table public.execution_receipts (
 org_id uuid not null,machine_id uuid not null,event_id uuid not null,source_sequence bigint not null,
 attempt_id uuid not null,body_hash text not null check(body_hash~'^[a-f0-9]{64}$'),receipt jsonb not null,
 primary key(org_id,machine_id,event_id),unique(org_id,machine_id,source_sequence),
 foreign key(org_id,machine_id) references public.machine_identities on delete cascade,
 foreign key(org_id,attempt_id,event_id) references public.execution_events(org_id,attempt_id,event_id) on delete cascade
);
create index execution_receipt_event on public.execution_receipts(org_id,attempt_id,event_id);
alter table public.execution_receipts enable row level security;
revoke all on public.execution_receipts from public,anon,authenticated;
grant all on public.execution_receipts to service_role;
create trigger immutable before update on public.execution_receipts for each row execute function public.reject_record_update();

-- Preserve the applied B5 implementation; wrap its entry point for new evidence.
alter function public.machine_transport(text,jsonb,text,uuid) rename to machine_capture_transport;
create function public.machine_transport(p_hash text,p_event jsonb,p_body_hash text,p_event_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.collector_credentials;m public.machine_identities;r public.execution_receipts;result jsonb;t timestamptz;code text;
begin
 select * into c from public.collector_credentials where token_hash=p_hash and machine_id is not null;
 if c.id is null then raise exception 'forbidden';end if;
 perform 1 from public.organizations where id=c.org_id for update;
 select * into m from public.machine_identities where org_id=c.org_id and id=c.machine_id for update;
 select * into c from public.collector_credentials where id=c.id;t:=clock_timestamp();
 if c.revoked_at is not null or c.expires_at<=t or m.id is null or m.revoked_at is not null
  or not public.org_capability(m.org_id,m.created_by,'credentials')
  or not (case when p_event is null then 'receipts:read' else 'events:write' end=any(m.capabilities)) then raise exception 'forbidden';end if;
 -- Single namespace across capture and lifecycle events, including under concurrent requests.
 select * into r from public.execution_receipts where org_id=c.org_id and machine_id=c.machine_id and event_id=coalesce((p_event->>'event_id')::uuid,p_event_id);
 if p_event is not null and p_event->>'event_type'='run.recorded' then
  if r.event_id is not null or exists(select 1 from public.execution_receipts where org_id=c.org_id and machine_id=c.machine_id and source_sequence=(p_event->>'source_sequence')::bigint) then raise exception 'idempotency_conflict';end if;
  return public.machine_capture_transport(p_hash,p_event,p_body_hash,p_event_id);
 elsif p_event is null and r.event_id is null then
  return public.machine_capture_transport(p_hash,null,null,p_event_id);
 end if;
 update public.collector_credentials set last_used_at=t where id=c.id;
 if m.window_at is null or m.window_at<=t-interval '1 minute' then m.window_at:=t;m.window_count:=0;end if;
 if m.window_count>=m.per_minute then
  update public.machine_identities set last_seen_at=t,last_error='rate_limited',rejected_count=rejected_count+1 where org_id=m.org_id and id=m.id;
  return '{"error_code":"rate_limited"}';
 end if;
 update public.machine_identities set window_at=m.window_at,window_count=m.window_count+1,last_seen_at=t where org_id=m.org_id and id=m.id;
 if p_event is null then return r.receipt||'{"duplicate":true}';end if;
 if p_event->>'event_type'<>'execution.recorded' or p_event->>'schema_version'<>'1' or coalesce(p_body_hash,'')!~'^[a-f0-9]{64}$' then code:='invalid_event';
 elsif (p_event->>'source_identity')::uuid<>m.id then code:='scope_denied';
 elsif r.event_id is not null then
  if r.body_hash<>p_body_hash then code:='idempotency_conflict';else
   update public.machine_identities set duplicate_count=duplicate_count+1,last_error=null where org_id=m.org_id and id=m.id;
   return r.receipt||'{"duplicate":true}';
  end if;
 elsif exists(select 1 from public.machine_events where org_id=m.org_id and machine_id=m.id and (event_id=(p_event->>'event_id')::uuid or source_sequence=(p_event->>'source_sequence')::bigint))
  or exists(select 1 from public.execution_receipts where org_id=m.org_id and machine_id=m.id and source_sequence=(p_event->>'source_sequence')::bigint) then code:='sequence_conflict';
 else
  begin
   if octet_length(p_event::text)>16384 or p_event->>'run_id'<>p_event->'payload'->'attempt'->>'attempt_id' then raise exception 'invalid_event';end if;
   perform public.execution_command(m.org_id,m.created_by,jsonb_build_object('action','create','project_id',m.project_id,'attempt',p_event->'payload'->'attempt'),m.id);
   result:=public.execution_command(m.org_id,m.created_by,jsonb_build_object('action','append','attempt_id',p_event->>'run_id','event',p_event->'payload'->'evidence','body_hash',p_body_hash),m.id);
   result:=result||jsonb_build_object('source_identity',m.id,'source_sequence',(p_event->>'source_sequence')::bigint,'observed_at',p_event->>'observed_at','clock_skew',(p_event->>'observed_at')::timestamptz>t+interval '5 minutes','body_hash',p_body_hash,'version',1);
   insert into public.execution_receipts values(m.org_id,m.id,(p_event->>'event_id')::uuid,(p_event->>'source_sequence')::bigint,(p_event->>'run_id')::uuid,p_body_hash,result);
   update public.machine_identities set accepted_count=accepted_count+1,last_ingested_at=t,last_error=null where org_id=m.org_id and id=m.id;
   return result;
  exception when integrity_constraint_violation or data_exception or raise_exception then
   code:=case when sqlerrm='forbidden' then 'scope_denied' when sqlerrm in ('idempotency_conflict','record_conflict') then 'record_conflict' when sqlerrm='attempt_event_limit' then 'attempt_event_limit' else 'invalid_event' end;
  end;
 end if;
 update public.machine_identities set rejected_count=rejected_count+1,last_error=code where org_id=m.org_id and id=m.id;
 return jsonb_build_object('error_code',code);
end $$;
revoke all on function public.machine_transport(text,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.machine_transport(text,jsonb,text,uuid) to service_role;

create function public.execution_archive(p_org uuid,p_actor uuid,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare t text:=p_data->>'collection';limits jsonb;rows jsonb;watermark bigint;version integer;
begin
 perform 1 from public.organizations where id=p_org for update;
 if not found or not public.org_capability(p_org,p_actor,'read_internal') then raise exception 'forbidden';end if;
 if t is null then
  select w.version into version from public.workspaces w where org_id=p_org;
  return jsonb_build_object('history_version',version,'limits',jsonb_build_object(
   'execution_jobs',(select coalesce(max(archive_id),0) from public.execution_jobs where org_id=p_org),
   'execution_attempts',(select coalesce(max(archive_id),0) from public.execution_attempts where org_id=p_org),
   'execution_events',(select coalesce(max(archive_id),0) from public.execution_events where org_id=p_org)));
 end if;
 if t not in ('execution_jobs','execution_attempts','execution_events') then raise exception 'invalid_collection';end if;
 watermark:=(p_data->>'watermark')::bigint;
 if watermark is null or watermark<0 then raise exception 'invalid_watermark';end if;
 execute format('select coalesce(jsonb_agg(to_jsonb(q)),''[]'') from (select archive_id::text as key,0 as revision,to_jsonb(e)-''org_id'' as payload,archive_id as submitted_version from public.%I e where org_id=$1 and archive_id>$2 and archive_id<=$3 order by archive_id limit 100) q',t)
 into rows using p_org,coalesce(nullif(p_data->>'after','')::bigint,0),watermark;
 return jsonb_build_object('rows',rows,'watermark',watermark,'next',case when jsonb_array_length(rows)=100 then rows->99 else null end);
end $$;
revoke all on function public.execution_archive(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.execution_archive(uuid,uuid,jsonb) to service_role;
commit;
