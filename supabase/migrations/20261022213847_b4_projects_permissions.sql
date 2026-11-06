begin;
alter table public.memberships drop constraint memberships_role_check;
alter table public.memberships add constraint memberships_role_check check(role in ('owner','admin','engineer','operator','internal_viewer','member','viewer'));
alter table public.invitations drop constraint invitations_role_check;
alter table public.invitations add constraint invitations_role_check check(role in ('admin','engineer','operator','internal_viewer','member','viewer'));
create table public.clients(org_id uuid references public.organizations on delete cascade,id uuid default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 120),primary key(org_id,id));
create table public.teams(org_id uuid references public.organizations on delete cascade,id uuid default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 120),primary key(org_id,id));
create table public.team_members(org_id uuid,team_id uuid,user_id uuid,primary key(org_id,team_id,user_id),foreign key(org_id,team_id) references public.teams on delete cascade,foreign key(org_id,user_id) references public.memberships on delete cascade);
create table public.projects(org_id uuid references public.organizations on delete cascade,id uuid default gen_random_uuid(),client_id uuid,name text not null check(length(trim(name)) between 1 and 120),primary key(org_id,id),unique(org_id,id,client_id),foreign key(org_id,client_id) references public.clients on delete restrict);
create table public.project_robots(org_id uuid,project_id uuid,robot_id text,primary key(org_id,project_id,robot_id),foreign key(org_id,project_id) references public.projects on delete cascade,foreign key(org_id,robot_id) references public.robots on delete cascade);
create table public.client_project_grants(org_id uuid,project_id uuid,client_id uuid not null,user_id uuid references auth.users on delete cascade,granted_by uuid references auth.users,created_at timestamptz not null default now(),primary key(org_id,project_id,user_id),foreign key(org_id,project_id,client_id) references public.projects(org_id,id,client_id) on delete cascade);
create table public.project_invitations(id uuid primary key default gen_random_uuid(),org_id uuid,project_id uuid,client_id uuid not null,email text not null,token_hash text not null unique check(token_hash~'^[a-f0-9]{64}$'),created_by uuid references auth.users,expires_at timestamptz not null default now()+interval '7 days',used_at timestamptz,revoked_at timestamptz,foreign key(org_id,project_id,client_id) references public.projects(org_id,id,client_id) on delete cascade);
create table public.run_projects(org_id uuid,run_id text,project_id uuid,robot_id text,assigned_by uuid references auth.users,primary key(org_id,run_id),unique(org_id,run_id,project_id),foreign key(org_id,run_id) references public.runs on delete cascade,foreign key(org_id,project_id,robot_id) references public.project_robots on delete cascade);
alter table public.runs add constraint runs_robot_identity unique(org_id,id,robot_id);
alter table public.run_projects add foreign key(org_id,run_id,robot_id) references public.runs(org_id,id,robot_id) on delete cascade;
create trigger immutable before update on public.run_projects for each row execute function public.reject_record_update();
create table public.shared_run_summaries(org_id uuid,project_id uuid,run_id text,revision integer not null check(revision>0),publication_id bigint generated always as identity unique,payload jsonb not null,published_by uuid references auth.users,published_at timestamptz not null default now(),primary key(org_id,project_id,run_id,revision),foreign key(org_id,run_id,project_id) references public.run_projects(org_id,run_id,project_id) on delete cascade);
create trigger immutable before update on public.shared_run_summaries for each row execute function public.reject_record_update();

create function public.org_capability(p_org uuid,p_user uuid,p_cap text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships where org_id=p_org and user_id=p_user and case
 when p_cap='read_internal' then true
 when p_cap in ('ownership','delete_org') then role='owner'
 when p_cap in ('manage','credentials','integrations','approve_job') then role in ('owner','admin')
 when p_cap in ('write_records','publish') then role in ('owner','admin','engineer','member')
 when p_cap in ('append_run','request_job') then role in ('owner','admin','engineer','member','operator') else false end);
$$;
revoke all on function public.org_capability(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.org_capability(uuid,uuid,text) to service_role;
create function public.can_read_project(p_org uuid,p_project uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.app_session_allowed(auth.uid(),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')::uuid)
 and (exists(select 1 from public.memberships where org_id=p_org and user_id=auth.uid()) or exists(select 1 from public.client_project_grants where org_id=p_org and project_id=p_project and user_id=auth.uid()));
$$;
revoke all on function public.can_read_project(uuid,uuid) from public,anon;
grant execute on function public.can_read_project(uuid,uuid) to authenticated;
do $$declare t text;begin
 foreach t in array array['clients','teams','team_members','projects','project_robots','client_project_grants','project_invitations','run_projects','shared_run_summaries'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  if t<>'project_invitations' then
   execute format('grant select on public.%I to authenticated',t);
   execute format('create policy internal_read on public.%I for select to authenticated using(public.is_org_member(org_id))',t);
  end if;
 end loop;
end $$;
create policy client_project_read on public.projects for select to authenticated using(public.can_read_project(org_id,id));
create policy client_summary_read on public.shared_run_summaries for select to authenticated using(public.can_read_project(org_id,project_id));
create policy own_grants on public.client_project_grants for select to authenticated using(user_id=auth.uid() and public.can_read_project(org_id,project_id));
revoke select on public.shared_run_summaries,public.client_project_grants from authenticated;
grant select(org_id,project_id,run_id,revision,publication_id,payload,published_at) on public.shared_run_summaries to authenticated;
grant select(org_id,project_id,client_id,user_id,created_at) on public.client_project_grants to authenticated;
grant usage,select on sequence public.shared_run_summaries_publication_id_seq to service_role;

-- Extend existing implementation in place; fail if its reviewed structure differs.
do $$declare source text;begin
 source:=pg_get_functiondef('public.beta_legacy_command(text,uuid,uuid,jsonb)'::regprocedure);
 if position('if r<>''owner'' then raise exception ''forbidden''; end if;' in source)=0 then raise exception 'unexpected_legacy_function'; end if;
 source:=replace(source,'if r=''viewer'' then raise exception ''forbidden''; end if;','if r not in (''owner'',''admin'',''member'',''engineer'') then raise exception ''forbidden''; end if;');
 source:=replace(source,'role in (''owner'',''member'')','role in (''owner'',''admin'')');
 source:=replace(source,'if r<>''owner'' then raise exception ''forbidden''; end if;', 'if r not in (''owner'',''admin'') then raise exception ''forbidden''; end if;
 if r=''admin'' and (p_action=''delete_org'' or (p_action=''member'' and (p_data->>''role''=''owner'' or exists(select 1 from public.memberships where org_id=p_org and user_id=(p_data->>''user_id'')::uuid and role=''owner'')))) then raise exception ''forbidden''; end if;');
 execute source;
 source:=pg_get_functiondef('public.append_records(uuid,uuid,jsonb)'::regprocedure);
 if position('if r is null or r not in (''owner'',''member'')' in source)=0 then raise exception 'unexpected_append_function'; end if;
 source:=replace(source,'role in (''owner'',''member'')','role in (''owner'',''admin'',''engineer'',''member'')');
 source:=replace(source,'if r is null or r not in (''owner'',''member'')','if r is null or r not in (''owner'',''admin'',''engineer'',''member'',''operator'')');
 source:=replace(source,'v:=w.version+1;', 'if r=''operator'' then
 if jsonb_array_length(coalesce(b->''records''->''runs'',''[]''))=0 then raise exception ''forbidden''; end if;
 if exists(select 1 from jsonb_array_elements(b->''records''->''snapshots'') x where not exists(select 1 from public.snapshots where org_id=p_org and id=x->>''id'' and revision=(x->>''revision'')::integer) and not exists(select 1 from jsonb_array_elements(b->''records''->''runs'') y where y->>''snapshotId''=x->>''id'' and y->>''snapshotRevision''=x->>''revision'')) then raise exception ''forbidden''; end if;
 if jsonb_array_length(coalesce(b->''corrections'',''[]''))>0 or jsonb_array_length(coalesce(b->''mappings'',''[]''))>0 or jsonb_array_length(coalesce(b->''investigations'',''[]''))>0 then raise exception ''forbidden''; end if;
 if exists(select 1 from jsonb_array_elements(b->''records''->''robots'') x where not exists(select 1 from public.robots where org_id=p_org and id=x->>''id'')) or exists(select 1 from jsonb_array_elements(b->''records''->''snapshots'') x where (x->>''revision'')::integer<>1) then raise exception ''forbidden''; end if;
 end if;
 v:=w.version+1;');
 execute source;
end $$;

create function public.project_command(p_action text,p_org uuid,p_actor uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid; cid uuid; result jsonb; inv public.project_invitations; run public.runs; revision integer;
begin
 if p_action='accept' then
  select * into inv from public.project_invitations where token_hash=p_data->>'token_hash';
  if inv.id is null then raise exception 'forbidden'; end if;
  p_org:=inv.org_id;
 end if;
 perform 1 from public.organizations where id=p_org for update;
 if not found then raise exception 'forbidden'; end if;
 if p_action='accept' then
  select * into inv from public.project_invitations where id=inv.id for update;
  if inv.used_at is not null or inv.revoked_at is not null or inv.expires_at<=now() or not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null and lower(email)=inv.email) then raise exception 'forbidden'; end if;
  insert into public.client_project_grants(org_id,project_id,client_id,user_id,granted_by) values(p_org,inv.project_id,inv.client_id,p_actor,inv.created_by) on conflict do nothing;
  update public.project_invitations set used_at=now() where id=inv.id;
  return '{"accepted":true}';
 end if;
 if not public.org_capability(p_org,p_actor,case when p_action='publish' then 'publish' else 'manage' end) then raise exception 'forbidden'; end if;
 pid:=nullif(p_data->>'project_id','')::uuid;
 case p_action
 when 'read' then
  select jsonb_build_object('clients',coalesce((select jsonb_agg(t) from public.clients t where org_id=p_org),'[]'),'teams',coalesce((select jsonb_agg(t) from public.teams t where org_id=p_org),'[]'),'team_members',coalesce((select jsonb_agg(t) from public.team_members t where org_id=p_org),'[]'),'projects',coalesce((select jsonb_agg(t) from public.projects t where org_id=p_org),'[]'),'project_robots',coalesce((select jsonb_agg(t) from public.project_robots t where org_id=p_org),'[]'),'grants',coalesce((select jsonb_agg(t) from public.client_project_grants t where org_id=p_org),'[]'),'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'email',email,'project_id',project_id,'expires_at',expires_at,'used_at',used_at,'revoked_at',revoked_at)) from public.project_invitations where org_id=p_org),'[]')) into result;
  return result;
 when 'client' then insert into public.clients(org_id,name) values(p_org,p_data->>'name') returning jsonb_build_object('id',id) into result;
 when 'team' then insert into public.teams(org_id,name) values(p_org,p_data->>'name') returning jsonb_build_object('id',id) into result;
 when 'team_member' then
  if p_data->>'remove'='true' then delete from public.team_members where org_id=p_org and team_id=(p_data->>'team_id')::uuid and user_id=(p_data->>'user_id')::uuid;
  else insert into public.team_members values(p_org,(p_data->>'team_id')::uuid,(p_data->>'user_id')::uuid) on conflict do nothing; end if;
 when 'project' then insert into public.projects(org_id,client_id,name) values(p_org,nullif(p_data->>'client_id','')::uuid,p_data->>'name') returning jsonb_build_object('id',id) into result;
 when 'robot' then insert into public.project_robots values(p_org,pid,p_data->>'robot_id') on conflict do nothing;
 when 'invite' then
  select client_id into cid from public.projects where org_id=p_org and id=pid;
  if cid is null then raise exception 'client_project_required'; end if;
  insert into public.project_invitations(org_id,project_id,client_id,email,token_hash,created_by) values(p_org,pid,cid,lower(p_data->>'email'),p_data->>'token_hash',p_actor) returning jsonb_build_object('id',id,'expires_at',expires_at) into result;
 when 'revoke_invite' then update public.project_invitations set revoked_at=now() where org_id=p_org and id=(p_data->>'id')::uuid;
 when 'revoke_grant' then delete from public.client_project_grants where org_id=p_org and project_id=pid and user_id=(p_data->>'user_id')::uuid;
 when 'publish' then
  select * into run from public.runs where org_id=p_org and id=p_data->>'run_id';
  if run.id is null or not exists(select 1 from public.project_robots where org_id=p_org and project_id=pid and robot_id=run.robot_id) then raise exception 'forbidden'; end if;
  insert into public.run_projects values(p_org,run.id,pid,run.robot_id,p_actor) on conflict do nothing;
  if not exists(select 1 from public.run_projects where org_id=p_org and run_id=run.id and project_id=pid) then raise exception 'record_conflict'; end if;
  select coalesce(max(s.revision),0)+1 into revision from public.shared_run_summaries s where org_id=p_org and project_id=pid and run_id=run.id;
  insert into public.shared_run_summaries(org_id,project_id,run_id,revision,payload,published_by) select p_org,pid,run.id,revision,jsonb_build_object('runId',run.id,'outcome',run.payload->'outcome','observedAt',run.payload->'at','synthetic',coalesce(history_synthetic,(bundle->>'synthetic')::boolean)),p_actor from public.workspaces where org_id=p_org;
  result:=jsonb_build_object('revision',revision);
 else raise exception 'invalid_action'; end case;
 insert into public.audit_events(org_id,actor_id,action) values(p_org,p_actor,'project_'||p_action);
 return coalesce(result,'{}');
end $$;
revoke all on function public.project_command(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.project_command(text,uuid,uuid,jsonb) to service_role;
commit;
