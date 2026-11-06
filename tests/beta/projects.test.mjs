import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {demoRecords} from '../../lib/demo/fixtures.ts';
import {randomUUID} from 'node:crypto';
const org='00000000-0000-4000-8000-000000000001',otherOrg='00000000-0000-4000-8000-000000000002';
const users=Array.from({length:6},(_,i)=>`10000000-0000-4000-8000-00000000000${i+1}`);
const sessions=users.map((_,i)=>`20000000-0000-4000-8000-00000000000${i+1}`);
test('two clients stay outside organization access; grants, invitations and relationships fail closed',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users,not_after timestamptz);
 create table auth.identities(id uuid primary key,user_id uuid references auth.users,provider text);
 create function auth.uid() returns uuid language sql as $$select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
 grant usage on schema auth,public to authenticated;`);
 for(const file of(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 for(let i=0;i<users.length;i++){await db.query("insert into auth.users values($1,$2,now())",[users[i],`synthetic-${i}@example.invalid`]);await db.query('insert into auth.sessions values($1,$2,null)',[sessions[i],users[i]]);await db.query('select approve_app_session($1,$2)',[users[i],sessions[i]]);}
 await db.query("insert into organizations(id,name) values($1,'Synthetic A'),($2,'Synthetic B')",[org,otherOrg]);
 await db.query("insert into memberships values($1,$2,'owner'),($1,$3,'admin'),($1,$4,'engineer'),($1,$5,'operator')",[org,users[0],users[1],users[4],users[5]]);
 await db.query('insert into workspaces(org_id,incremental) values($1,true),($2,true)',[org,otherOrg]);
 const fixture={format:'unify-local',version:1,synthetic:true,records:demoRecords,corrections:[]};
 await db.query('select append_records($1,$2,$3)',[org,users[0],JSON.stringify({bundle:fixture,request_id:'seed',body_hash:'0'.repeat(64)})]);
 const command=(action,actor,data={},tenant=org)=>db.query('select project_command($1,$2,$3,$4) result',[action,tenant,actor,JSON.stringify(data)]).then(r=>r.rows[0].result);
 const ca=(await command('client',users[0],{name:'Client A'})).id,cb=(await command('client',users[1],{name:'Client B'})).id;
 const pa=(await command('project',users[0],{name:'Project A',client_id:ca})).id,pb=(await command('project',users[1],{name:'Project B',client_id:cb})).id;
 await assert.rejects(db.query("insert into projects(org_id,client_id,name) values($1,$2,'Foreign')",[otherOrg,ca]),/foreign key/);
 for(const project of [pa,pb])await command('robot',users[0],{project_id:project,robot_id:demoRecords.runs[0].robotId});
 for(const [index,project,hash]of[[2,pa,'a'],[3,pb,'b']]){
  await command('invite',users[0],{project_id:project,email:`synthetic-${index}@example.invalid`,token_hash:hash.repeat(64)});
  await assert.rejects(command('accept',users[1],{token_hash:hash.repeat(64)},null),/forbidden/);
  await command('accept',users[index],{token_hash:hash.repeat(64)},null);
  await assert.rejects(command('accept',users[index],{token_hash:hash.repeat(64)},null),/forbidden/);
 }
 const sameRobot=demoRecords.runs.filter(r=>r.robotId===demoRecords.runs[0].robotId);
 await command('publish',users[4],{project_id:pa,run_id:sameRobot[0].id});
 await assert.rejects(command('publish',users[0],{project_id:pb,run_id:sameRobot[0].id}),/record_conflict/);
 await command('publish',users[0],{project_id:pb,run_id:sameRobot[1].id});
 const attempts=[];
 for(const project of [pa,pb]){
  const unknown={state:'unknown',reason:'Synthetic missing evidence'},r=sameRobot[0];
  const attempt={job_id:randomUUID(),attempt_id:randomUUID(),retry_of:null,robot_id:r.robotId,snapshot_id:r.snapshotId,snapshot_revision:r.snapshotRevision,source_identity:users[0],procedure:unknown,procedure_version:unknown,task:unknown,environment:unknown,components:unknown,reality:'synthetic',method:'manual'};
  await db.query('select execution_command($1,$2,$3)',[org,users[0],JSON.stringify({action:'create',project_id:project,attempt})]);
  const event={event_id:randomUUID(),source_identity:users[0],source_sequence:1,observed_at:'2026-10-25T00:00:00.000Z',kind:'state',payload:{state:'succeeded'},correction_of:null,reason:null};
  await db.query('select execution_command($1,$2,$3)',[org,users[0],JSON.stringify({action:'append',attempt_id:attempt.attempt_id,event,body_hash:'a'.repeat(64)})]);
  const cutoff=(await db.query('select max(archive_id)::int n from execution_events where org_id=$1 and attempt_id=$2',[org,attempt.attempt_id])).rows[0].n;
  const payload={attempt_id:attempt.attempt_id,cutoff,outcome:'succeeded',evidence_warning:false,internal_note:'must not reach client'};
  const publish=(p,actor=users[4])=>db.query('select publish_execution($1,$2,$3) r',[org,actor,JSON.stringify(p)]).then(r=>r.rows[0].r);
  await assert.rejects(publish({...payload,cutoff:0}),/version_conflict/);
  await assert.rejects(publish(payload,users[2]),/forbidden/);
  assert.equal((await publish(payload)).duplicate,false);assert.equal((await publish(payload)).duplicate,true);
  attempts.push(attempt.attempt_id);
 }
 const team=(await command('team',users[0],{name:'Internal team'})).id;
 await assert.rejects(command('team_member',users[0],{team_id:team,user_id:users[2]}),/foreign key/);
 await assert.rejects(command('publish',users[2],{project_id:pa,run_id:sameRobot[0].id}),/forbidden/);
 async function asClient(index,check){await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:users[index],session_id:sessions[index]})]);try{await check();}finally{await db.exec('reset role');}}
 for(const [index,project]of[[2,pa],[3,pb]])await asClient(index,async()=>{
  assert.equal((await db.query('select * from projects')).rows[0].id,project);
  const rows=(await db.query('select project_id,payload from shared_run_summaries')).rows;assert.equal(rows.length,1);assert.equal(rows[0].project_id,project);assert.deepEqual(Object.keys(rows[0].payload).sort(),['observedAt','outcome','runId','synthetic']);
  await assert.rejects(db.query('select published_by from shared_run_summaries'),/permission denied/);
  const outcomes=(await db.query('select project_id,payload from shared_execution_summaries')).rows;
  assert.equal(outcomes.length,1);assert.equal(outcomes[0].project_id,project);
  assert.deepEqual(Object.keys(outcomes[0].payload).sort(),['attemptId','evidenceWarning','method','observedAt','outcome','reality']);
  await assert.rejects(db.query('select published_by,evidence_cutoff from shared_execution_summaries'),/permission denied/);
  await assert.rejects(db.query('select publish_execution($1,$2,$3)',[org,users[index],'{}']),/permission denied/);
  for(const table of ['execution_attempts','execution_events','execution_jobs'])assert.equal((await db.query(`select * from ${table}`)).rows.length,0);
  for(const table of ['robots','runs','snapshots','investigation_revisions','workspaces','teams','project_robots','run_projects'])assert.equal((await db.query(`select * from ${table}`)).rows.length,0,table);
 });
 await command('revoke_grant',users[1],{project_id:pa,user_id:users[2]});
 await asClient(2,async()=>{assert.equal((await db.query('select payload from shared_run_summaries')).rows.length,0);assert.equal((await db.query('select payload from shared_execution_summaries')).rows.length,0);});
 await db.query("select beta_command('member',$1,$2,$3)",[org,users[0],JSON.stringify({user_id:users[4],role:'internal_viewer'})]);
 await assert.rejects(command('publish',users[4],{project_id:pa,run_id:sameRobot[0].id}),/forbidden/);
 await assert.rejects(db.query("select beta_command('member',$1,$2,$3)",[org,users[1],JSON.stringify({user_id:users[0],role:'remove'})]),/forbidden/);
 await assert.rejects(db.query("select beta_command('member',$1,$2,$3)",[org,users[1],JSON.stringify({user_id:users[4],role:'owner'})]),/forbidden/);
 const noRun=structuredClone(fixture);noRun.records.runs=[];
 await assert.rejects(db.query('select append_records($1,$2,$3)',[org,users[5],JSON.stringify({bundle:noRun,request_id:'operator-no-run',body_hash:'d'.repeat(64)})]),/forbidden/);
 await assert.rejects(db.query("select beta_command('member',$1,$2,$3)",[org,users[0],JSON.stringify({user_id:users[0],role:'remove'})]),/last_owner/);
 const expired=await command('invite',users[0],{project_id:pa,email:'synthetic-2@example.invalid',token_hash:'c'.repeat(64)});
 await db.query("update project_invitations set expires_at=now()-interval '1 minute' where id=$1",[expired.id]);await assert.rejects(command('accept',users[2],{token_hash:'c'.repeat(64)},null),/forbidden/);
 assert.equal((await db.query('select count(*)::int n from memberships where user_id in ($1,$2)',[users[2],users[3]])).rows[0].n,0);
 }finally{await db.close();}
});
