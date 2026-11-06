begin;
alter table public.execution_attempts add unique(org_id,id,project_id);
create table public.shared_execution_summaries (
 org_id uuid not null,project_id uuid not null,attempt_id uuid not null,revision integer not null check(revision>0),
 publication_id bigint generated always as identity unique,payload jsonb not null,
 evidence_cutoff bigint not null,published_by uuid not null references auth.users,published_at timestamptz not null default clock_timestamp(),
 primary key(org_id,project_id,attempt_id,revision),
 foreign key(org_id,attempt_id,project_id) references public.execution_attempts(org_id,id,project_id) on delete cascade
);
create index shared_execution_attempt on public.shared_execution_summaries(org_id,attempt_id,project_id);
create index shared_execution_page on public.shared_execution_summaries(org_id,project_id,publication_id);
create trigger immutable before update on public.shared_execution_summaries for each row execute function public.reject_record_update();
alter table public.shared_execution_summaries enable row level security;
revoke all on public.shared_execution_summaries from public,anon,authenticated;
grant all on public.shared_execution_summaries to service_role;
grant usage on sequence public.shared_execution_summaries_publication_id_seq to service_role;
grant select(org_id,project_id,attempt_id,revision,publication_id,payload,published_at) on public.shared_execution_summaries to authenticated;
create policy approved_project_read on public.shared_execution_summaries for select to authenticated using(public.can_read_project(org_id,project_id));

create function public.publish_execution(p_org uuid,p_actor uuid,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a public.execution_attempts;cutoff bigint;n integer;summary jsonb;prior public.shared_execution_summaries;
begin
 perform 1 from public.organizations where id=p_org for update;
 if not found or not public.org_capability(p_org,p_actor,'publish') then raise exception 'forbidden';end if;
 select * into a from public.execution_attempts where org_id=p_org and id=(p_data->>'attempt_id')::uuid;
 if a.id is null then raise exception 'forbidden';end if;
 select coalesce(max(archive_id),0) into cutoff from public.execution_events where org_id=p_org and attempt_id=a.id;
 if cutoff<>coalesce((p_data->>'cutoff')::bigint,-1) then raise exception 'version_conflict';end if;
 if p_data->>'outcome' is null or p_data->>'outcome' not in ('requested','queued','running','succeeded','failed','cancelled','timed-out','unknown') then raise exception 'invalid_outcome';end if;
 -- Only derived publication fields reach clients, never arbitrary client-supplied JSON.
 summary:=jsonb_build_object('attemptId',a.id,'outcome',p_data->>'outcome','observedAt',(select max((payload->>'observed_at')::timestamptz) from public.execution_events where org_id=p_org and attempt_id=a.id),
  'reality',a.payload->>'reality','method',a.payload->>'method','evidenceWarning',coalesce((p_data->>'evidence_warning')::boolean,true));
 select * into prior from public.shared_execution_summaries where org_id=p_org and project_id=a.project_id and attempt_id=a.id order by revision desc limit 1;
 if prior.payload=summary and prior.evidence_cutoff=cutoff then return jsonb_build_object('revision',prior.revision,'duplicate',true);end if;
 n:=coalesce(prior.revision,0)+1;
 insert into public.shared_execution_summaries(org_id,project_id,attempt_id,revision,payload,evidence_cutoff,published_by) values(p_org,a.project_id,a.id,n,summary,cutoff,p_actor);
 insert into public.audit_events(org_id,actor_id,action) values(p_org,p_actor,'execution_outcome_published');
 return jsonb_build_object('revision',n,'duplicate',false);
end $$;
revoke all on function public.publish_execution(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.publish_execution(uuid,uuid,jsonb) to service_role;
commit;
