-- Original Prompt 8. Additive, opt-in measurements; no backfill of historical use.
begin;
create table public.pilot_plans (
 org_id uuid primary key references public.organizations on delete cascade,
 start_date date not null, synthetic boolean not null, payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=10000),
 created_by uuid references auth.users on delete set null, created_at timestamptz not null default now()
);
create table public.pilot_reviews (
 org_id uuid not null references public.pilot_plans on delete cascade,
 week integer not null check (week between 1 and 4), revision integer not null check (revision between 1 and 100),
 payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=10000),
 actor_id uuid references auth.users on delete set null, recorded_at timestamptz not null default now(), primary key(org_id,week,revision)
);
create table public.pilot_events (
 org_id uuid not null references public.pilot_plans on delete cascade, event_key text not null check(length(event_key)<=100),
 kind text not null check(kind in ('workspace_saved','snapshot_saved','comparison','ingestion_succeeded','ingestion_failed')),
 occurred_at timestamptz not null default now(), primary key(org_id,event_key)
);
create index pilot_event_time on public.pilot_events(org_id,occurred_at);
alter table public.pilot_plans enable row level security;
alter table public.pilot_reviews enable row level security;
alter table public.pilot_events enable row level security;
revoke all on public.pilot_plans,public.pilot_reviews,public.pilot_events from public,anon,authenticated;
grant select on public.pilot_plans,public.pilot_reviews,public.pilot_events to authenticated;
grant all on public.pilot_plans,public.pilot_reviews,public.pilot_events to service_role;
create policy owner_read on public.pilot_plans for select to authenticated using (exists(select 1 from public.memberships m where m.org_id=pilot_plans.org_id and m.user_id=auth.uid() and m.role='owner'));
create policy owner_read on public.pilot_reviews for select to authenticated using (exists(select 1 from public.memberships m where m.org_id=pilot_reviews.org_id and m.user_id=auth.uid() and m.role='owner'));
create policy owner_read on public.pilot_events for select to authenticated using (exists(select 1 from public.memberships m where m.org_id=pilot_events.org_id and m.user_id=auth.uid() and m.role='owner'));
create trigger immutable_pilot_plan before update on public.pilot_plans for each row execute function public.reject_record_update();
create trigger immutable_pilot_review before update on public.pilot_reviews for each row execute function public.reject_record_update();
create trigger immutable_pilot_event before update on public.pilot_events for each row execute function public.reject_record_update();

create function public.pilot_record_event(p_org uuid,p_kind text,p_key text) returns void
language sql set search_path='' as $$
 insert into public.pilot_events(org_id,kind,event_key)
 select p_org,p_kind,p_key from public.pilot_plans where org_id=p_org
 and (now() at time zone 'UTC')::date >= start_date and (now() at time zone 'UTC')::date < start_date+28
 on conflict do nothing;
$$;
create function public.pilot_audit_event() returns trigger language plpgsql set search_path='' as $$
begin
 if new.action='save' then
  perform public.pilot_record_event(new.org_id,case when new.credential_id is null then 'workspace_saved' else 'ingestion_succeeded' end,'save:'||new.id);
  if exists(select 1 from public.snapshots where org_id=new.org_id and submitted_version=new.workspace_version) then
   perform public.pilot_record_event(new.org_id,'snapshot_saved','snapshot:'||new.id);
  end if;
 end if;
 return new;
end $$;
create trigger record_pilot_activity after insert on public.audit_events for each row execute function public.pilot_audit_event();

-- Like beta_command, only the trusted server may supply a verified actor.
create function public.pilot_command(p_action text,p_org uuid,p_actor uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare plan public.pilot_plans; role_name text; rev integer; w integer; target public.runs; baseline public.runs; today date := (now() at time zone 'UTC')::date;
begin
 if p_action='ingestion_failed' then
  perform public.beta_command('credential_lookup',p_org,null,jsonb_build_object('credential_hash',p_data->>'credential_hash'));
  perform public.pilot_record_event(p_org,'ingestion_failed','failure:'||(p_data->>'attempt_id')::uuid);
  return '{"recorded":true}'::jsonb;
 end if;
 select role into role_name from public.memberships where org_id=p_org and user_id=p_actor;
 if role_name is null or (p_action<>'comparison' and role_name<>'owner') then raise exception 'forbidden'; end if;
 if p_action <> 'read' then perform 1 from public.organizations where id=p_org for update; end if;
 select * into plan from public.pilot_plans where org_id=p_org;
 if p_action='read' then
  return jsonb_build_object('plan',case when plan.org_id is null then null else jsonb_build_object('payload',plan.payload,'synthetic',plan.synthetic,'created_at',plan.created_at) end,
   'reviews',coalesce((select jsonb_agg(jsonb_build_object('week',week,'revision',revision,'payload',payload,'recorded_at',recorded_at) order by week,revision) from public.pilot_reviews where org_id=p_org),'[]'::jsonb),
   'activity',coalesce((select jsonb_agg(to_jsonb(a)) from (select 1+((occurred_at at time zone 'UTC')::date-plan.start_date)/7 as week,kind,count(*) as count,min(occurred_at) as first_at,max(occurred_at) as last_at from public.pilot_events where org_id=p_org group by 1,kind) a),'[]'::jsonb));
 elsif p_action='create' then
  if plan.org_id is not null then raise exception 'record_conflict'; end if;
  if not exists(select 1 from public.robots where org_id=p_org) then raise exception 'save_robot_first'; end if;
  if (p_data->>'startDate')::date < today or coalesce(length(trim(p_data->>'scope')),0)=0 or coalesce(length(trim(p_data->>'successCriteria')),0)=0 then raise exception 'invalid_plan'; end if;
  insert into public.pilot_plans(org_id,start_date,synthetic,payload,created_by)
   select p_org,(p_data->>'startDate')::date,(bundle->>'synthetic')::boolean,p_data,p_actor from public.workspaces where org_id=p_org;
 elsif p_action='review' then
  w := (p_data->>'week')::integer;
  if plan.org_id is null or w is null or w not between 1 and 4 or today < plan.start_date+(w-1)*7 then raise exception 'week_not_started'; end if;
  select coalesce(max(revision),0) into rev from public.pilot_reviews where org_id=p_org and week=w;
  if (p_data->>'expectedRevision')::integer is distinct from rev then raise exception 'version_conflict'; end if;
  insert into public.pilot_reviews(org_id,week,revision,payload,actor_id) values(p_org,w,rev+1,p_data,p_actor);
 elsif p_action='comparison' then
  if plan.org_id is null or today < plan.start_date or today >= plan.start_date+28 then return '{"recorded":false}'::jsonb; end if;
  select * into target from public.runs where org_id=p_org and id=p_data->>'runId';
  select * into baseline from public.runs where org_id=p_org and id=p_data->>'baselineId';
  if target.id is null or baseline.id is null or target.robot_id<>baseline.robot_id or baseline.payload->>'outcome'<>'success' or (baseline.payload->>'at')::timestamptz >= (target.payload->>'at')::timestamptz then raise exception 'invalid_comparison'; end if;
  perform public.pilot_record_event(p_org,'comparison','comparison:'||md5(jsonb_build_array(p_actor,target.id,baseline.id,today)::text));
 else raise exception 'invalid_action';
 end if;
 return '{"recorded":true}'::jsonb;
end $$;
revoke all on function public.pilot_record_event(uuid,text,text),public.pilot_audit_event(),public.pilot_command(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pilot_record_event(uuid,text,text),public.pilot_audit_event(),public.pilot_command(text,uuid,uuid,jsonb) to service_role;
commit;
