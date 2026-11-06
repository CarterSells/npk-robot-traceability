-- B2: additive, opt-in per organization; existing bundles remain rollback checkpoints.
begin;
alter table public.workspaces add column incremental boolean not null default false;
alter table public.workspaces add column history_synthetic boolean;
update public.workspaces set history_synthetic=(bundle->>'synthetic')::boolean where jsonb_array_length(bundle->'records'->'robots')>0;
create index runs_robot_history on public.runs(org_id,robot_id,id);
create index snapshots_robot_history on public.snapshots(org_id,robot_id,id,revision);
create index audit_org_history on public.audit_events(org_id,id);
create index investigation_text_history on public.investigation_revisions(org_id,(investigation_id::text),revision);
create function public.guard_legacy_workspace() returns trigger language plpgsql set search_path='' as $$
begin
 if old.incremental and (not new.incremental or new.bundle is distinct from old.bundle) then raise exception 'incremental_required'; end if;
 return new;
end $$;
create trigger guard_legacy_workspace before update on public.workspaces for each row execute function public.guard_legacy_workspace();
revoke all on function public.guard_legacy_workspace() from public,anon,authenticated;
-- Also block no-op legacy saves: they would run legacy full-history triggers.
alter function public.beta_command(text,uuid,uuid,jsonb) rename to beta_legacy_command;
create function public.beta_command(p_action text,p_org uuid,p_actor uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.organizations where id=p_org for update;
 if p_action='save' and exists(select 1 from public.workspaces where org_id=p_org and incremental) then raise exception 'incremental_required'; end if;
 return public.beta_legacy_command(p_action,p_org,p_actor,p_data);
end $$;
revoke all on function public.beta_command(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.beta_command(text,uuid,uuid,jsonb) to service_role;

create function public.append_records(p_org uuid,p_actor uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r text; w public.workspaces; c public.collector_credentials; b jsonb; item jsonb; old jsonb;
 v integer; v_principal text; receipt public.ingestion_receipts;
 history jsonb; old_row public.investigation_revisions; prior public.investigation_revisions;
 target public.runs; baseline public.runs; retest public.runs; iid uuid; rev integer; head_run text;
begin
 perform 1 from public.organizations where id=p_org for update;
 if not found then raise exception 'forbidden'; end if;
 select role into r from public.memberships where org_id=p_org and user_id=p_actor;
 if p_actor is null then
  select * into c from public.collector_credentials where org_id=p_org and token_hash=p_data->>'credential_hash';
  if c.id is null or c.revoked_at is not null or c.expires_at<=now() or not exists(select 1 from public.memberships where org_id=p_org and user_id=c.created_by and role in ('owner','member')) then raise exception 'forbidden'; end if;
  r:='member';
 end if;
 if r is null or r not in ('owner','member') then raise exception 'forbidden'; end if;
 select * into w from public.workspaces where org_id=p_org for update;
 if not found or not w.incremental then raise exception 'cutover_required'; end if;
 v_principal:=coalesce(p_actor::text,c.id::text);
 if coalesce(length(p_data->>'request_id'),0) not between 1 and 120 or coalesce(p_data->>'body_hash','') !~ '^[a-f0-9]{64}$' then raise exception 'invalid_request'; end if;
 select * into receipt from public.ingestion_receipts where org_id=p_org and principal=v_principal and request_id=p_data->>'request_id';
 if found then
  if receipt.body_hash<>p_data->>'body_hash' then raise exception 'idempotency_conflict'; end if;
  return jsonb_build_object('version',receipt.version,'duplicate',true);
 end if;
 b:=p_data->'bundle';
 if b is null or octet_length(b::text)>2097152 or coalesce(b->>'format','')<>'unify-local' or coalesce((b->>'version')::integer,0) not in (1,2) then raise exception 'invalid_bundle'; end if;
 if jsonb_typeof(b->'synthetic') is distinct from 'boolean' then raise exception 'invalid_bundle'; end if;
 if w.history_synthetic is not null and w.history_synthetic<>(b->>'synthetic')::boolean then raise exception 'record_conflict'; end if;
 v:=w.version+1;
 -- Audit first; deferred legacy FKs and immediate investigation FK share this transaction.
 insert into public.audit_events(org_id,actor_id,credential_id,action,workspace_version) values(p_org,p_actor,c.id,'append',v);
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

 history:=coalesce(b->'investigations','[]'::jsonb);
  for item in select value from jsonb_array_elements(history) loop
    iid := (item->>'id')::uuid; rev := (item->>'revision')::integer;
    select * into old_row from public.investigation_revisions where org_id=p_org and investigation_id=iid and revision=rev;
    if found then
      if old_row.payload<>item then raise exception 'record_conflict'; end if;
      continue;
    end if;
    if p_actor is null or c.id is not null or not exists(select 1 from public.memberships where org_id=p_org and user_id=p_actor and role in ('owner','member')) then raise exception 'forbidden'; end if;
    select * into target from public.runs where org_id=p_org and id=item->>'runId';
    select * into baseline from public.runs where org_id=p_org and id=item->>'baselineId';
    if target.id is null or baseline.id is null or target.robot_id<>baseline.robot_id or baseline.payload->>'outcome'<>'success' or (baseline.payload->>'at')::timestamptz >= (target.payload->>'at')::timestamptz then raise exception 'invalid_investigation_reference'; end if;
    if coalesce(length(trim(item->>'note')),0)=0 or coalesce(length(trim(item->>'author')),0)=0 or (item->>'recordedAt')::timestamptz < (target.payload->>'at')::timestamptz then raise exception 'invalid_investigation'; end if;
    if nullif(item->>'retestId','') is not null then
      select * into retest from public.runs where org_id=p_org and id=item->>'retestId';
      if retest.id is null or retest.robot_id<>target.robot_id or (retest.payload->>'at')::timestamptz <= (target.payload->>'at')::timestamptz or (retest.payload->>'at')::timestamptz > (item->>'recordedAt')::timestamptz then raise exception 'invalid_investigation_reference'; end if;
    end if;
    select * into prior from public.investigation_revisions where org_id=p_org and investigation_id=iid order by revision desc limit 1;
    if rev <> coalesce(prior.revision,0)+1 then raise exception 'record_conflict'; end if;
    if prior.revision is not null and (prior.run_id<>target.id or prior.baseline_id<>baseline.id or (prior.payload->>'recordedAt')::timestamptz > (item->>'recordedAt')::timestamptz) then raise exception 'record_conflict'; end if;
    select run_id into head_run from public.investigations where org_id=p_org and id=iid;
    -- Existing Stage 6 investigation rows must be explicitly migrated, not overwritten.
    if head_run is not null and prior.revision is null then raise exception 'record_conflict'; end if;
    insert into public.investigations(org_id,id,run_id,state,evidence_note)
      values(p_org,iid,target.id,item->>'state',coalesce(nullif(trim(item->>'evidenceNote'),''),nullif(item->>'retestId','')))
      on conflict(org_id,id) do update set state=excluded.state,evidence_note=excluded.evidence_note;
    insert into public.investigation_revisions values(p_org,iid,rev,target.id,baseline.id,nullif(item->>'retestId',''),item->>'state',item,v);
  end loop;

 update public.workspaces set version=v,updated_at=now(),history_synthetic=(b->>'synthetic')::boolean where org_id=p_org;
 insert into public.ingestion_receipts values(p_org,v_principal,p_data->>'request_id',p_data->>'body_hash',v);
 perform public.pilot_record_event(p_org,case when c.id is null then 'workspace_saved' else 'ingestion_succeeded' end,'append:'||v);
 if exists(select 1 from public.snapshots where org_id=p_org and submitted_version=v) then
  perform public.pilot_record_event(p_org,'snapshot_saved','append-snapshot:'||v);
 end if;
 return jsonb_build_object('version',v,'duplicate',false);
end $$;
revoke all on function public.append_records(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.append_records(uuid,uuid,jsonb) to service_role;
-- Cutover verifies every canonical payload in both directions before freezing the checkpoint.
create function public.cutover_history(p_org uuid,p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.workspaces; t text; a jsonb; actual jsonb; counts jsonb:='{}';
begin
 perform 1 from public.organizations where id=p_org for update;
 if not exists(select 1 from public.memberships where org_id=p_org and user_id=p_actor and role='owner') then raise exception 'forbidden'; end if;
 select * into w from public.workspaces where org_id=p_org for update;
 if w.incremental then return jsonb_build_object('incremental',true,'version',w.version); end if;
 foreach t in array array['robots','snapshots','runs','corrections','mappings','investigation_revisions'] loop
  a:=coalesce(case when t in ('robots','snapshots','runs') then w.bundle->'records'->t when t='investigation_revisions' then w.bundle->'investigations' else w.bundle->t end,'[]'::jsonb);
  execute format('select coalesce(jsonb_agg(payload),''[]''::jsonb) from public.%I where org_id=$1',t) into actual using p_org;
  if jsonb_array_length(a)<>jsonb_array_length(actual) or not(a @> actual and actual @> a) then raise exception 'backfill_mismatch'; end if;
  counts:=counts||jsonb_build_object(t,jsonb_array_length(actual));
 end loop;
 update public.workspaces set incremental=true,history_synthetic=case when jsonb_array_length(bundle->'records'->'robots')>0 then (bundle->>'synthetic')::boolean end where org_id=p_org;
 return jsonb_build_object('incremental',true,'version',w.version,'verified_counts',counts);
end $$;
revoke all on function public.cutover_history(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cutover_history(uuid,uuid) to service_role;

-- Stable keyset cursor and submission watermark; recheck live membership on every page.
create function public.history_page(p_org uuid,p_actor uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t text:=p_data->>'collection'; k text; rev text; rows jsonb; watermark integer; n integer;
begin
 if not exists(select 1 from public.memberships where org_id=p_org and user_id=p_actor) then raise exception 'forbidden'; end if;
 if t not in ('robots','snapshots','runs','corrections','mappings','investigation_revisions','audit_events') or t is null then raise exception 'invalid_collection'; end if;
 select version into watermark from public.workspaces where org_id=p_org;
 watermark:=least(watermark,coalesce((p_data->>'watermark')::integer,watermark));
 n:=coalesce((p_data->>'limit')::integer,100);
 if n not between 1 and 100 then raise exception 'invalid_limit'; end if;
 k:=case t when 'corrections' then 'snapshot_id' when 'investigation_revisions' then 'investigation_id' else 'id' end;
 rev:=case when t in ('snapshots','corrections','investigation_revisions') then 'revision' else '0' end;
 if t='audit_events' then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (select id::text as key,0 as revision,jsonb_build_object('id',id,'action',action,'recorded_at',recorded_at,'actor_id',actor_id,'credential_id',credential_id,'workspace_version',workspace_version) as payload,workspace_version as submitted_version from public.audit_events where org_id=p_org and id>coalesce(nullif(p_data->>'after','')::bigint,0) and workspace_version<=watermark order by id limit n) q;
 else
  execute format('select coalesce(jsonb_agg(to_jsonb(q)),''[]'') from (select %I::text as key,%s as revision,payload,submitted_version from public.%I where org_id=$1 and submitted_version<=$2 and (%I::text,%s)>($3,$4) %s order by key,revision limit $5) q',k,rev,t,k,rev,case when t in ('snapshots','runs') then 'and ($6 is null or robot_id=$6)' else '' end)
  into rows using p_org,watermark,coalesce(p_data->>'after',''),coalesce((p_data->>'revision')::integer,0),n,p_data->>'robot_id';
 end if;
 return jsonb_build_object('rows',rows,'watermark',watermark,'next',case when jsonb_array_length(rows)=n then rows->(n-1) else null end);
end $$;
revoke all on function public.history_page(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.history_page(uuid,uuid,jsonb) to service_role;
commit;
