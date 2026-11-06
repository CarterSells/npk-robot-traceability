begin;
create table public.report_publications(
 org_id uuid not null,project_id uuid not null,client_id uuid not null,report_id uuid not null,revision integer not null check(revision>0),
 previous_revision integer,publication_id bigint generated always as identity unique,event_id uuid not null default gen_random_uuid() unique,
 selection jsonb not null,cutoffs jsonb not null,payload jsonb not null,published_by uuid not null references auth.users,
 generated_at timestamptz not null default clock_timestamp(),primary key(org_id,report_id,revision),
 unique(org_id,report_id,revision,project_id),foreign key(org_id,project_id,client_id) references public.projects(org_id,id,client_id) on delete cascade,
 foreign key(org_id,report_id,previous_revision,project_id) references public.report_publications(org_id,report_id,revision,project_id),
 check(previous_revision is not distinct from case when revision=1 then null else revision-1 end)
);
create index reports_project_page on public.report_publications(org_id,project_id,publication_id);
create table public.report_credentials(
 org_id uuid not null,id uuid not null default gen_random_uuid(),project_id uuid not null,recipient uuid not null references auth.users,
 token_hash text not null unique check(token_hash~'^[a-f0-9]{64}$'),issued_by uuid not null references auth.users,
 expires_at timestamptz not null,revoked_at timestamptz,window_at timestamptz,window_count integer not null default 0,
 primary key(org_id,id),foreign key(org_id,project_id) references public.projects on delete cascade
);
create table public.report_endpoints(
 org_id uuid not null,id uuid not null default gen_random_uuid(),project_id uuid not null,recipient uuid not null references auth.users,
 url text not null check(length(url)<=1000),secret jsonb not null,secret_revision integer not null default 1,
 created_by uuid not null references auth.users,revoked_at timestamptz,created_at timestamptz not null default clock_timestamp(),
 primary key(org_id,id),foreign key(org_id,project_id) references public.projects on delete cascade
);
create table public.report_deliveries(
 org_id uuid not null,id uuid not null default gen_random_uuid(),endpoint_id uuid not null,report_id uuid not null,revision integer not null,
 state text not null default 'pending' check(state in ('pending','inflight','delivered','dead','revoked')),
 attempts integer not null default 0,lease uuid,lease_until timestamptz,next_at timestamptz not null default clock_timestamp(),
 last_status integer,last_attempt_at timestamptz,delivered_at timestamptz,primary key(org_id,id),unique(id),
 unique(org_id,endpoint_id,report_id,revision),foreign key(org_id,endpoint_id) references public.report_endpoints on delete cascade,
 foreign key(org_id,report_id,revision) references public.report_publications on delete cascade
);
create index report_delivery_due on public.report_deliveries(next_at) where state in ('pending','inflight');
create index report_delivery_publication on public.report_deliveries(org_id,report_id,revision);
create index report_credential_project on public.report_credentials(org_id,project_id);
create index report_endpoint_project on public.report_endpoints(org_id,project_id);
create table public.report_delivery_attempts(
 org_id uuid not null,delivery_id uuid not null,id bigint generated always as identity primary key,
 action text not null,status_code integer,actor_id uuid references auth.users,recorded_at timestamptz not null default clock_timestamp(),
 foreign key(org_id,delivery_id) references public.report_deliveries(org_id,id) on delete cascade
);
create index report_delivery_attempt_page on public.report_delivery_attempts(org_id,delivery_id,id);
do $$declare t text;begin
 foreach t in array array['report_publications','report_credentials','report_endpoints','report_deliveries','report_delivery_attempts'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant usage on sequence public.report_publications_publication_id_seq,public.report_delivery_attempts_id_seq to service_role;
grant select(org_id,project_id,client_id,report_id,revision,publication_id,payload,generated_at) on public.report_publications to authenticated;
create policy published_project_read on public.report_publications for select to authenticated using(public.can_read_project(org_id,project_id));
create trigger immutable before update on public.report_publications for each row execute function public.reject_record_update();
create trigger immutable before update on public.report_delivery_attempts for each row execute function public.reject_record_update();

create function public.report_recipient_allowed(p_org uuid,p_project uuid,p_recipient uuid,p_issuer uuid) returns boolean
language sql security invoker set search_path='' as $$
 select public.org_capability(p_org,p_issuer,'credentials') and exists(select 1 from public.client_project_grants where org_id=p_org and project_id=p_project and user_id=p_recipient);
$$;

create function public.report_publish(p_org uuid,p_actor uuid,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare sel jsonb:=p_data->'selection';content jsonb:=p_data->'content';cuts jsonb:=p_data->'cutoffs';prior public.report_publications;
 pr public.projects;attempt public.execution_attempts;aid text;cut bigint;n integer;payload jsonb;publication public.report_publications;
begin
 perform 1 from public.organizations where id=p_org for update;
 if not found or not public.org_capability(p_org,p_actor,'publish') then raise exception 'forbidden';end if;
 select * into pr from public.projects where org_id=p_org and id=(sel->>'project_id')::uuid;
 if pr.id is null or pr.client_id is null then raise exception 'forbidden';end if;
 select * into prior from public.report_publications where org_id=p_org and report_id=(sel->>'report_id')::uuid order by revision desc limit 1;
 if prior.selection=sel and prior.cutoffs=cuts and prior.project_id=pr.id and (prior.payload-'report_id'-'revision'-'previous_revision'-'project_id'-'client_id'-'generated_at')=content then
  return jsonb_build_object('report',prior.payload,'duplicate',true);
 end if;
 if coalesce(prior.revision,0)<>coalesce((sel->>'expected_revision')::integer,-1) or (prior.project_id is not null and prior.project_id<>pr.id) then raise exception 'version_conflict';end if;
 if jsonb_array_length(sel->'attempt_ids') not between 1 and 25 or jsonb_array_length(content->'runs')<>jsonb_array_length(sel->'attempt_ids') then raise exception 'invalid_report';end if;
 for aid in select jsonb_array_elements_text(sel->'attempt_ids') loop
  select * into attempt from public.execution_attempts where org_id=p_org and id=aid::uuid and project_id=pr.id;
  if attempt.id is null or attempt.created_at<(sel->'period'->>'start')::timestamptz or attempt.created_at>=(sel->'period'->>'end')::timestamptz then raise exception 'forbidden';end if;
  select coalesce(max(archive_id),0) into cut from public.execution_events where org_id=p_org and attempt_id=attempt.id;
  if cut is distinct from (cuts->>aid)::bigint then raise exception 'version_conflict';end if;
 end loop;
 n:=coalesce(prior.revision,0)+1;
 if n>1 and length(trim(coalesce(content->>'correction_reason',''))) not between 1 and 500 then raise exception 'invalid_report';end if;
 payload:=content||jsonb_build_object('report_id',sel->>'report_id','revision',n,'previous_revision',prior.revision,'project_id',pr.id,'client_id',pr.client_id,'generated_at',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 if octet_length(payload::text)>131072 then raise exception 'invalid_report';end if;
 insert into public.report_publications(org_id,project_id,client_id,report_id,revision,previous_revision,selection,cutoffs,payload,published_by)
  values(p_org,pr.id,pr.client_id,(sel->>'report_id')::uuid,n,prior.revision,sel,cuts,payload,p_actor) returning * into publication;
 -- Same transaction as publication. A queue row alone does not execute delivery.
 insert into public.report_deliveries(org_id,endpoint_id,report_id,revision)
  select p_org,id,publication.report_id,n from public.report_endpoints where org_id=p_org and project_id=pr.id and revoked_at is null
  and public.report_recipient_allowed(org_id,project_id,recipient,created_by);
 insert into public.audit_events(org_id,actor_id,action) values(p_org,p_actor,'report_published');
 return jsonb_build_object('report',payload,'duplicate',false);
end $$;

create function public.report_admin(p_org uuid,p_actor uuid,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare action text:=p_data->>'action';endpoint public.report_endpoints;delivery public.report_deliveries;v uuid;
begin
 perform 1 from public.organizations where id=p_org for update;
 if not found or not public.org_capability(p_org,p_actor,'credentials') then raise exception 'forbidden';end if;
 if action='list' then
  return jsonb_build_object('credentials',coalesce((select jsonb_agg(to_jsonb(q)) from (select id,project_id,recipient,expires_at,revoked_at from public.report_credentials where org_id=p_org order by id limit 100) q),'[]'),
   'endpoints',coalesce((select jsonb_agg(to_jsonb(q)) from (select id,project_id,recipient,url,secret_revision,revoked_at from public.report_endpoints where org_id=p_org order by id limit 10) q),'[]'),
   'deliveries',coalesce((select jsonb_agg(to_jsonb(q)) from (select id,endpoint_id,report_id,revision,state,attempts,last_status,last_attempt_at,delivered_at from public.report_deliveries where org_id=p_org order by last_attempt_at desc nulls first,id limit 100) q),'[]'));
 elsif action in ('credential','endpoint') then
  if not public.report_recipient_allowed(p_org,(p_data->>'project_id')::uuid,(p_data->>'recipient')::uuid,p_actor) then raise exception 'forbidden';end if;
  if action='credential' then
   if (select count(*) from public.report_credentials where org_id=p_org)>=100 or coalesce((p_data->>'days')::integer,0) not between 1 and 90 then raise exception 'report_limit';end if;
   insert into public.report_credentials(org_id,project_id,recipient,token_hash,issued_by,expires_at)
    values(p_org,(p_data->>'project_id')::uuid,(p_data->>'recipient')::uuid,p_data->>'token_hash',p_actor,clock_timestamp()+make_interval(days=>(p_data->>'days')::integer)) returning id into v;
  else
   if (select count(*) from public.report_endpoints where org_id=p_org)>=10 then raise exception 'report_limit';end if;
   insert into public.report_endpoints(org_id,id,project_id,recipient,url,secret,created_by)
    values(p_org,(p_data->>'id')::uuid,(p_data->>'project_id')::uuid,(p_data->>'recipient')::uuid,p_data->>'url',p_data->'secret',p_actor) returning id into v;
  end if;
 elsif action='revoke_credential' then
  update public.report_credentials set revoked_at=clock_timestamp() where org_id=p_org and id=(p_data->>'id')::uuid returning id into v;
  if v is null then raise exception 'forbidden';end if;
 elsif action in ('revoke_endpoint','rotate','rotation_read') then
  select * into endpoint from public.report_endpoints where org_id=p_org and id=(p_data->>'id')::uuid;
  if endpoint.id is null then raise exception 'forbidden';end if;v:=endpoint.id;
  if action='revoke_endpoint' then
   update public.report_endpoints set revoked_at=clock_timestamp() where org_id=p_org and id=v;
  else
   if endpoint.revoked_at is not null or not public.report_recipient_allowed(p_org,endpoint.project_id,endpoint.recipient,endpoint.created_by) then raise exception 'forbidden';end if;
   if action='rotation_read' then return jsonb_build_object('secret',endpoint.secret,'revision',endpoint.secret_revision);end if;
   if endpoint.secret_revision<>(p_data->>'expected_revision')::integer then raise exception 'version_conflict';end if;
   update public.report_endpoints set secret=p_data->'secret',secret_revision=secret_revision+1 where org_id=p_org and id=v;
  end if;
 elsif action='replay' then
  select * into delivery from public.report_deliveries where org_id=p_org and id=(p_data->>'id')::uuid for update;
  select * into endpoint from public.report_endpoints where org_id=p_org and id=delivery.endpoint_id;
  if delivery.id is null or delivery.state<>'dead' or endpoint.revoked_at is not null or not public.report_recipient_allowed(p_org,endpoint.project_id,endpoint.recipient,endpoint.created_by) then raise exception 'forbidden';end if;
  update public.report_deliveries set state='pending',attempts=0,next_at=clock_timestamp(),lease=null,lease_until=null where org_id=p_org and id=delivery.id;
  insert into public.report_delivery_attempts(org_id,delivery_id,action,actor_id) values(p_org,delivery.id,'manual_replay',p_actor);v:=delivery.id;
 else raise exception 'invalid_action';end if;
 insert into public.audit_events(org_id,actor_id,action) values(p_org,p_actor,'report_'||action);
 return jsonb_build_object('id',v,'saved',true);
end $$;

create function public.report_api(p_hash text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.report_credentials;rows jsonb;t timestamptz;
begin
 select * into c from public.report_credentials where token_hash=p_hash;
 if c.id is null then raise exception 'forbidden';end if;
 perform 1 from public.organizations where id=c.org_id for update;
 select * into c from public.report_credentials where id=c.id;t:=clock_timestamp();
 if c.revoked_at is not null or c.expires_at<=t or not public.report_recipient_allowed(c.org_id,c.project_id,c.recipient,c.issued_by) then raise exception 'forbidden';end if;
 if c.window_at is null or c.window_at<=t-interval '1 minute' then c.window_at:=t;c.window_count:=0;end if;
 if c.window_count>=60 then return '{"error_code":"rate_limited"}';end if;
 update public.report_credentials set window_at=c.window_at,window_count=c.window_count+1 where org_id=c.org_id and id=c.id;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (
  select publication_id,payload from public.report_publications where org_id=c.org_id and project_id=c.project_id
   and (p_data->>'report_id' is null or (report_id=(p_data->>'report_id')::uuid and revision=(p_data->>'revision')::integer))
   and publication_id>coalesce((p_data->>'after')::bigint,0) order by publication_id limit 25
 ) q;
 return jsonb_build_object('rows',rows,'next',case when jsonb_array_length(rows)=25 then rows->24->>'publication_id' else null end);
end $$;

create function public.report_worker(p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare d public.report_deliveries;e public.report_endpoints;p public.report_publications;v uuid;
begin
 if p_action='claim' then
  select * into d from public.report_deliveries where state in ('pending','inflight') and next_at<=clock_timestamp() and (lease_until is null or lease_until<clock_timestamp()) order by next_at,id for update skip locked limit 1;
  if d.id is null then return null;end if;
  if d.attempts>=8 then
   update public.report_deliveries set state='dead',lease=null,lease_until=null where org_id=d.org_id and id=d.id;
   return '{"skipped":true}';
  end if;
  v:=gen_random_uuid();
  update public.report_deliveries set state='inflight',lease=v,lease_until=clock_timestamp()+interval '1 minute',attempts=attempts+1,last_attempt_at=clock_timestamp() where org_id=d.org_id and id=d.id;
  return jsonb_build_object('id',d.id,'lease',v);
 end if;
 select * into d from public.report_deliveries where id=(p_data->>'id')::uuid for update;
 if d.id is null or d.state<>'inflight' or d.lease is distinct from (p_data->>'lease')::uuid or d.lease_until<=clock_timestamp() then raise exception 'version_conflict';end if;
 if p_action='dispatch' then
  select * into e from public.report_endpoints where org_id=d.org_id and id=d.endpoint_id;
  if e.revoked_at is not null or not public.report_recipient_allowed(e.org_id,e.project_id,e.recipient,e.created_by) then
   update public.report_deliveries set state='revoked',lease=null,lease_until=null where org_id=d.org_id and id=d.id;
   insert into public.report_delivery_attempts(org_id,delivery_id,action) values(d.org_id,d.id,'authorization_revoked');return null;
  end if;
  select * into p from public.report_publications where org_id=d.org_id and report_id=d.report_id and revision=d.revision;
  if p.project_id<>e.project_id then raise exception 'forbidden';end if;
  insert into public.report_delivery_attempts(org_id,delivery_id,action) values(d.org_id,d.id,'dispatch');
  return jsonb_build_object('org_id',d.org_id,'endpoint_id',e.id,'url',e.url,'secret',e.secret,'event_id',p.event_id,'event_type',case when p.revision=1 then 'report.published' else 'report.corrected' end,'report',p.payload);
 elsif p_action='finish' then
  update public.report_deliveries set state=case when (p_data->>'delivered')::boolean then 'delivered' when attempts>=8 then 'dead' else 'pending' end,
   delivered_at=case when (p_data->>'delivered')::boolean then clock_timestamp() else null end,
   last_status=(p_data->>'status_code')::integer,next_at=clock_timestamp()+make_interval(secs=>least(3600,5*power(2,attempts)::integer)),lease=null,lease_until=null
   where org_id=d.org_id and id=d.id;
  insert into public.report_delivery_attempts(org_id,delivery_id,action,status_code) values(d.org_id,d.id,case when (p_data->>'delivered')::boolean then 'delivered' else 'retry_or_dead' end,(p_data->>'status_code')::integer);
  return '{"saved":true}';
 end if;
 raise exception 'invalid_action';
end $$;
revoke all on function public.report_recipient_allowed(uuid,uuid,uuid,uuid),public.report_publish(uuid,uuid,jsonb),public.report_admin(uuid,uuid,jsonb),public.report_api(text,jsonb),public.report_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.report_recipient_allowed(uuid,uuid,uuid,uuid),public.report_publish(uuid,uuid,jsonb),public.report_admin(uuid,uuid,jsonb),public.report_api(text,jsonb),public.report_worker(text,jsonb) to service_role;
commit;
