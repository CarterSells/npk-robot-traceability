-- Tavrik: run in the selected project's SQL editor. Read-only; no token values.
begin transaction read only;

-- Whole database inventory, including provider-owned tables/views.
select table_schema, table_name, table_type from information_schema.tables
where table_schema not in ('pg_catalog','information_schema')
order by table_schema, table_name;

-- All application columns/types (JSON payload fields are documented in the guide).
select table_name,column_name,data_type,is_nullable from information_schema.columns
where table_schema='public' order by table_name,ordinal_position;

select 'organizations' as relation, count(*) as rows from public.organizations
union all select 'memberships',count(*) from public.memberships
union all select 'workspaces',count(*) from public.workspaces
union all select 'robots',count(*) from public.robots
union all select 'snapshots',count(*) from public.snapshots
union all select 'runs',count(*) from public.runs
union all select 'corrections',count(*) from public.corrections
union all select 'mappings',count(*) from public.mappings
union all select 'investigations',count(*) from public.investigations
union all select 'investigation_revisions',count(*) from public.investigation_revisions
union all select 'invitations',count(*) from public.invitations
union all select 'collector_credentials',count(*) from public.collector_credentials
union all select 'ingestion_receipts',count(*) from public.ingestion_receipts
union all select 'audit_events',count(*) from public.audit_events
union all select 'pilot_plans',count(*) from public.pilot_plans
union all select 'pilot_reviews',count(*) from public.pilot_reviews
union all select 'pilot_events',count(*) from public.pilot_events;

-- Expected: zero broken exact references.
select count(*) as broken_run_snapshot_references from public.runs r
left join public.snapshots s on s.org_id=r.org_id and s.id=r.snapshot_id
and s.revision=r.snapshot_revision and s.robot_id=r.robot_id
where s.id is null;

-- Expected: zero rows. Bundle and relational record counts must agree.
select w.org_id,w.version,w.updated_at from public.workspaces w
where jsonb_array_length(w.bundle->'records'->'robots') <> (select count(*) from public.robots r where r.org_id=w.org_id)
or jsonb_array_length(w.bundle->'records'->'snapshots') <> (select count(*) from public.snapshots s where s.org_id=w.org_id)
or jsonb_array_length(w.bundle->'records'->'runs') <> (select count(*) from public.runs r where r.org_id=w.org_id);

-- Expected after Stage 8: all 17 application base tables have RLS enabled.
select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' order by c.relname;

-- Expected: false for anonymous helper access; true for authenticated.
select has_function_privilege('anon','public.is_org_member(uuid)','EXECUTE') as anon_helper,
has_function_privilege('authenticated','public.is_org_member(uuid)','EXECUTE') as authenticated_helper;
rollback;
