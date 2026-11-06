-- Original Stage 7. Apply after the private-beta migration; never replay an unknown schema.
begin;
create table public.investigation_revisions (
  org_id uuid not null,
  investigation_id uuid not null,
  revision integer not null check (revision > 0),
  run_id text not null,
  baseline_id text not null,
  retest_id text,
  state text not null check (state in ('investigating','hypothesis','confirmed-by-engineer','unresolved')),
  payload jsonb not null,
  submitted_version integer not null,
  primary key (org_id,investigation_id,revision),
  foreign key (org_id,investigation_id) references public.investigations on delete cascade,
  foreign key (org_id,run_id) references public.runs on delete cascade,
  foreign key (org_id,baseline_id) references public.runs on delete cascade,
  foreign key (org_id,retest_id) references public.runs on delete cascade,
  foreign key (org_id,submitted_version) references public.audit_events(org_id,workspace_version) on delete cascade,
  check (state <> 'confirmed-by-engineer' or length(trim(coalesce(payload->>'evidenceNote',''))) > 0 or retest_id is not null)
);
alter table public.investigation_revisions enable row level security;
revoke all on public.investigation_revisions from public,anon,authenticated;
grant select on public.investigation_revisions to authenticated;
grant all on public.investigation_revisions to service_role;
create policy member_read on public.investigation_revisions for select to authenticated using (public.is_org_member(org_id));
create trigger immutable_investigation_revision before update on public.investigation_revisions for each row execute function public.reject_record_update();

-- The existing command inserts its audit event last. This trigger runs in that
-- same transaction after runs exist and ties every new revision to its submitter.
create function public.persist_investigation_revisions() returns trigger
language plpgsql set search_path='' as $$
declare b jsonb; item jsonb; old_row public.investigation_revisions; prior public.investigation_revisions;
  target public.runs; baseline public.runs; retest public.runs;
  iid uuid; rev integer; head_run text; history jsonb;
begin
  if new.action <> 'save' then return new; end if;
  select bundle into b from public.workspaces where org_id=new.org_id;
  history := coalesce(b->'investigations','[]'::jsonb);
  if jsonb_typeof(history)<>'array' or jsonb_array_length(history)>1000 then raise exception 'invalid_investigation'; end if;
  for old_row in select * from public.investigation_revisions where org_id=new.org_id loop
    if not (history @> jsonb_build_array(old_row.payload)) then raise exception 'record_conflict'; end if;
  end loop;
  for item in select value from jsonb_array_elements(history) loop
    iid := (item->>'id')::uuid; rev := (item->>'revision')::integer;
    select * into old_row from public.investigation_revisions where org_id=new.org_id and investigation_id=iid and revision=rev;
    if found then
      if old_row.payload<>item then raise exception 'record_conflict'; end if;
      continue;
    end if;
    if new.actor_id is null or new.credential_id is not null or not exists(select 1 from public.memberships where org_id=new.org_id and user_id=new.actor_id and role in ('owner','member')) then raise exception 'forbidden'; end if;
    select * into target from public.runs where org_id=new.org_id and id=item->>'runId';
    select * into baseline from public.runs where org_id=new.org_id and id=item->>'baselineId';
    if target.id is null or baseline.id is null or target.robot_id<>baseline.robot_id or baseline.payload->>'outcome'<>'success' or (baseline.payload->>'at')::timestamptz >= (target.payload->>'at')::timestamptz then raise exception 'invalid_investigation_reference'; end if;
    if coalesce(length(trim(item->>'note')),0)=0 or coalesce(length(trim(item->>'author')),0)=0 or (item->>'recordedAt')::timestamptz < (target.payload->>'at')::timestamptz then raise exception 'invalid_investigation'; end if;
    if nullif(item->>'retestId','') is not null then
      select * into retest from public.runs where org_id=new.org_id and id=item->>'retestId';
      if retest.id is null or retest.robot_id<>target.robot_id or (retest.payload->>'at')::timestamptz <= (target.payload->>'at')::timestamptz or (retest.payload->>'at')::timestamptz > (item->>'recordedAt')::timestamptz then raise exception 'invalid_investigation_reference'; end if;
    end if;
    select * into prior from public.investigation_revisions where org_id=new.org_id and investigation_id=iid order by revision desc limit 1;
    if rev <> coalesce(prior.revision,0)+1 then raise exception 'record_conflict'; end if;
    if prior.revision is not null and (prior.run_id<>target.id or prior.baseline_id<>baseline.id or (prior.payload->>'recordedAt')::timestamptz > (item->>'recordedAt')::timestamptz) then raise exception 'record_conflict'; end if;
    select run_id into head_run from public.investigations where org_id=new.org_id and id=iid;
    -- Existing Stage 6 investigation rows must be explicitly migrated, not overwritten.
    if head_run is not null and prior.revision is null then raise exception 'record_conflict'; end if;
    insert into public.investigations(org_id,id,run_id,state,evidence_note)
      values(new.org_id,iid,target.id,item->>'state',coalesce(nullif(trim(item->>'evidenceNote'),''),nullif(item->>'retestId','')))
      on conflict(org_id,id) do update set state=excluded.state,evidence_note=excluded.evidence_note;
    insert into public.investigation_revisions values(new.org_id,iid,rev,target.id,baseline.id,nullif(item->>'retestId',''),item->>'state',item,new.workspace_version);
  end loop;
  return new;
end $$;
revoke all on function public.persist_investigation_revisions() from public,anon,authenticated;
grant execute on function public.persist_investigation_revisions() to service_role;
create trigger save_investigation_revisions after insert on public.audit_events for each row execute function public.persist_investigation_revisions();
commit;
