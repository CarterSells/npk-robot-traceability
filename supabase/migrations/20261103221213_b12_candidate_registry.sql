-- Unavailable evaluation candidates only. No model activation or robot control.
begin;
create table public.prediction_candidates(
 org_id uuid not null,project_id uuid not null,id uuid not null,
 dataset_hash text not null check(dataset_hash~'^[a-f0-9]{64}$'),
 capability text not null check(capability in ('failure_risk','duration','quality','maintenance')),
 dataset jsonb not null,evaluation jsonb not null,created_by uuid not null references auth.users,
 created_at timestamptz not null default clock_timestamp(),primary key(org_id,id),
 unique(org_id,project_id,dataset_hash),foreign key(org_id,project_id) references public.projects on delete cascade,
 check(octet_length(dataset::text)<=2097152),check(octet_length(evaluation::text)<=2097152),
 check(dataset->'cohort'->>'reality' in ('real','simulation')),check(evaluation->>'available'='false')
);
create index prediction_project on public.prediction_candidates(org_id,project_id,created_at,id);
create table public.prediction_reviews(
 org_id uuid not null,candidate_id uuid not null,revision integer not null check(revision>0),
 state text not null check(state in ('collecting_data','insufficient_labels','evaluating','paused','degraded')),
 reason text not null check(length(trim(reason)) between 1 and 1000),
 published boolean not null default false,public_label text,public_reason text,
 author uuid not null references auth.users,recorded_at timestamptz not null default clock_timestamp(),
 primary key(org_id,candidate_id,revision),foreign key(org_id,candidate_id) references public.prediction_candidates on delete cascade,
 check(not published or (length(trim(public_label)) between 1 and 120 and length(trim(public_reason)) between 1 and 1000))
);
do $$declare t text;begin
 foreach t in array array['prediction_candidates','prediction_reviews'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create trigger immutable before update on public.%I for each row execute function public.reject_record_update()',t);
 end loop;
end $$;

create function public.prediction_command(p_org uuid,p_actor uuid,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare action text:=p_data->>'action';c public.prediction_candidates;r public.prediction_reviews;
 d jsonb:=p_data->'dataset';e jsonb:=p_data->'evaluation';v jsonb;state text;pid uuid;result jsonb;
begin
 perform 1 from public.organizations where id=p_org for update;
 if not found or not public.org_capability(p_org,p_actor,'read_internal') then raise exception 'forbidden';end if;
 if action='list' then
  select coalesce(jsonb_agg(x),'[]') into result from (
   select c.id,c.project_id,c.dataset_hash,c.capability,c.created_at,r.revision,r.state,r.reason,r.published
   from public.prediction_candidates c join lateral(select * from public.prediction_reviews r where r.org_id=c.org_id and r.candidate_id=c.id order by revision desc limit 1)r on true
   where c.org_id=p_org and c.project_id=(p_data->>'project_id')::uuid order by c.created_at desc,c.id limit 100
  )x;return result;
 end if;
 if not public.org_capability(p_org,p_actor,'publish') then raise exception 'forbidden';end if;
 if action='register' then
  pid:=(d->>'project_id')::uuid;
  if (d->>'org_id')::uuid<>p_org or not exists(select 1 from public.projects where org_id=p_org and id=pid)
   or d->'cohort'->>'reality' not in ('real','simulation') or e->>'available'<>'false'
   or e->>'dataset_hash'<>d->>'dataset_hash' or jsonb_array_length(d->'rows')>1000 then raise exception 'invalid_candidate';end if;
  for v in select value from jsonb_array_elements(d->'rows') loop
   if not exists(select 1 from public.execution_attempts a where a.org_id=p_org and a.project_id=pid and a.id=(v->>'attempt_id')::uuid
    and a.job_id=(v->>'job_id')::uuid and a.robot_id=v->>'robot_id' and a.snapshot_id=v->'snapshot'->>'id'
    and a.snapshot_revision=(v->'snapshot'->>'revision')::integer and a.payload->>'reality'=d->'cohort'->>'reality') then raise exception 'candidate_source_mismatch';end if;
  end loop;
  select * into c from public.prediction_candidates where org_id=p_org and project_id=pid and dataset_hash=d->>'dataset_hash';
  if c.id is not null then
   if c.dataset<>d or c.evaluation<>e then raise exception 'record_conflict';end if;
   return jsonb_build_object('id',c.id,'duplicate',true);
  end if;
  if (select count(*) from public.prediction_candidates where org_id=p_org)>=1000 then raise exception 'candidate_limit';end if;
  state:=e->>'state';
  if state not in ('collecting_data','insufficient_labels','evaluating') then raise exception 'invalid_candidate';end if;
  insert into public.prediction_candidates values(p_org,pid,(p_data->>'id')::uuid,d->>'dataset_hash',d->'target'->>'capability',d,e,p_actor,clock_timestamp()) returning * into c;
  insert into public.prediction_reviews(org_id,candidate_id,revision,state,reason,author) values(p_org,c.id,1,state,p_data->>'reason',p_actor);
  return jsonb_build_object('id',c.id,'revision',1,'available',false,'duplicate',false);
 elsif action='review' then
  select * into c from public.prediction_candidates where org_id=p_org and id=(p_data->>'id')::uuid;
  if c.id is null then raise exception 'forbidden';end if;
  select * into r from public.prediction_reviews where org_id=p_org and candidate_id=c.id order by revision desc limit 1;
  if r.revision<>(p_data->>'expected_revision')::integer then raise exception 'version_conflict';end if;
  state:=p_data->>'state';
  if state not in ('paused','degraded') and state<>c.evaluation->>'state' then raise exception 'invalid_candidate_state';end if;
  if r.revision>=1000 then raise exception 'candidate_limit';end if;
  insert into public.prediction_reviews values(p_org,c.id,r.revision+1,state,p_data->>'reason',(p_data->>'published')::boolean,p_data->>'public_label',p_data->>'public_reason',p_actor,clock_timestamp());
  return jsonb_build_object('id',c.id,'revision',r.revision+1,'available',false);
 end if;
 raise exception 'invalid_action';
end $$;

create function public.prediction_public_readiness(p_org uuid,p_project uuid,p_actor uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.projects where org_id=p_org and id=p_project) or not (
 public.org_capability(p_org,p_actor,'read_internal') or exists(select 1 from public.client_project_grants where org_id=p_org and project_id=p_project and user_id=p_actor)) then raise exception 'forbidden';end if;
 select coalesce(jsonb_agg(x),'[]') into result from (
  select c.capability,r.state,false as available,r.public_label as cohort,r.public_reason as reason,
   null as eligible_runs,'reviewed_candidate_only' as evaluation,c.id::text as candidate_id,r.revision,r.recorded_at
  from public.prediction_candidates c join lateral(select * from public.prediction_reviews r where r.org_id=c.org_id and r.candidate_id=c.id order by revision desc limit 1)r on true
  where c.org_id=p_org and c.project_id=p_project and r.published order by c.capability,c.id limit 100
 )x;return result;
end $$;
revoke all on function public.prediction_command(uuid,uuid,jsonb),public.prediction_public_readiness(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.prediction_command(uuid,uuid,jsonb),public.prediction_public_readiness(uuid,uuid,uuid) to service_role;
commit;
