import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {demoRecords} from '../../lib/demo/fixtures.ts';
import {validateMachineEvent,machineAdminInput} from '../../lib/beta/machines.ts';
import {createHandler} from '../../lib/beta/server.ts';
const org='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const owner='10000000-0000-4000-8000-000000000001',viewer='10000000-0000-4000-8000-000000000002';
const hash=x=>createHash('sha256').update(x).digest('hex');
function capture(suffix=''){
 const run=structuredClone(demoRecords.runs[0]);const snapshot=structuredClone(demoRecords.snapshots.find(s=>s.id===run.snapshotId&&s.revision===run.snapshotRevision));
 run.id+=suffix;run.snapshotId+=suffix;snapshot.id+=suffix;
 return {format:'unify-local',version:1,synthetic:true,records:{robots:[demoRecords.robots.find(r=>r.id===run.robotId)],snapshots:[snapshot],runs:[run]},corrections:[]};
}
function event(machine,seq=1,suffix='') {const c=capture(suffix);return {event_id:randomUUID(),schema_version:1,source_identity:machine,source_sequence:seq,run_id:c.records.runs[0].id,observed_at:new Date(c.records.runs[0].at).toISOString(),event_type:'run.recorded',payload:{capture:c}};}

test('event envelope rejects unapproved fields and preserves exact run evidence',()=>{
 const e=event(randomUUID());assert.equal(validateMachineEvent(e).run_id,e.run_id);
 for(const bad of [{...e,org_id:org},{...e,received_at:new Date().toISOString()},{...e,source_sequence:-1},{...e,source_sequence:1.5},{...e,event_type:'robot.execute'},{...e,run_id:'wrong'},{...e,observed_at:'2026-02-30T00:00:00.000Z'},{...e,payload:{...e.payload,source_code:'private'}}])assert.throws(()=>validateMachineEvent(bad));
 assert.throws(()=>machineAdminInput({action:'rotate',id:e.source_identity,expires_days:30,overlap_minutes:61}));
});

test('machine storage atomically commits records/receipts; scopes, rotation, replay, rates and RLS fail closed',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users,not_after timestamptz);
 create table auth.identities(id uuid primary key,user_id uuid references auth.users,provider text);
 create function auth.uid() returns uuid language sql as $$select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
 grant usage on schema auth,public to authenticated;`);
 for(const f of(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 await db.query("insert into auth.users values($1,'owner@example.invalid',now()),($2,'viewer@example.invalid',now())",[owner,viewer]);
 await db.query("insert into organizations(id,name) values($1,'Synthetic A'),($2,'Synthetic B')",[org,other]);
 await db.query("insert into memberships values($1,$2,'owner'),($1,$3,'viewer'),($4,$2,'owner')",[org,owner,viewer,other]);
 await db.query('insert into workspaces(org_id,incremental) values($1,true),($2,true)',[org,other]);
 for(const tenant of [org,other])await db.query('select append_records($1,$2,$3)',[tenant,owner,JSON.stringify({bundle:capture(),request_id:'seed',body_hash:'a'.repeat(64)})]);
 const project=randomUUID(),foreignProject=randomUUID(),robot=capture().records.robots[0].id;
 await db.query("insert into projects(org_id,id,name) values($1,$2,'A'),($3,$4,'B')",[org,project,other,foreignProject]);
 await db.query('insert into project_robots values($1,$2,$3),($4,$5,$3)',[org,project,robot,other,foreignProject]);
 const admin=(action,data,actor=owner,tenant=org)=>db.query('select machine_admin($1,$2,$3,$4) r',[action,tenant,actor,JSON.stringify(data)]).then(r=>r.rows[0].r);
 const config={name:'Synthetic gateway',kind:'gateway',project_id:project,robot_id:robot,capabilities:['events:write','receipts:read'],per_minute:10,expires_days:30,token_hash:'b'.repeat(64)};
 await assert.rejects(admin('create',config,viewer),/forbidden/);
 await assert.rejects(admin('create',{...config,project_id:foreignProject}),/foreign key/);
 const machine=await admin('create',config);
 const transport=(e,h='b'.repeat(64),raw=e?JSON.stringify(e):null,id=null)=>db.query('select machine_transport($1,$2,$3,$4) r',[h,e?JSON.stringify(e):null,raw?hash(raw):null,id]).then(r=>r.rows[0].r);
 const first=event(machine.id,10,'-machine');validateMachineEvent(first);
 let receipt=await transport(first);assert.equal(receipt.duplicate,false,JSON.stringify(receipt));assert.equal(receipt.event_id,first.event_id);
 const rows=await db.query('select r.snapshot_id,r.snapshot_revision,e.workspace_version from runs r join machine_events e on r.org_id=e.org_id and r.id=e.run_id where e.event_id=$1',[first.event_id]);assert.equal(rows.rows[0].snapshot_id,first.payload.capture.records.runs[0].snapshotId);
 assert.equal((await transport(first)).duplicate,true);
 // A transport-level retry with the same event remains one immutable receipt.
 assert.equal((await db.query('select count(*)::int n from machine_events where event_id=$1',[first.event_id])).rows[0].n,1);
 assert.equal((await transport({...first,source_sequence:11})).error_code,'idempotency_conflict');
 assert.equal((await transport({...first,event_id:randomUUID()})).error_code,'sequence_conflict');
 const earlier=event(machine.id,2,'-earlier');assert.equal((await transport(earlier)).duplicate,false);
 const wrong=event(randomUUID(),3,'-wrong');assert.equal((await transport(wrong)).error_code,'scope_denied');
 assert.equal((await transport(null,config.token_hash,null,first.event_id)).body_hash,hash(JSON.stringify(first)));
 const rotated=await admin('rotate',{id:machine.id,token_hash:'c'.repeat(64),expires_days:30,overlap_minutes:10});assert.equal(rotated.id,machine.id);
 assert.equal((await transport(first,'c'.repeat(64))).duplicate,true);
 await assert.rejects(admin('rotate',{id:machine.id,token_hash:'d'.repeat(64),expires_days:30,overlap_minutes:10}),/rotation_pending/);
 await admin('revoke_token',{id:machine.credential_id});await assert.rejects(transport(first),/forbidden/);
 // Saturating one identity never spends a second tenant's budget.
 const otherMachine=await admin('create',{...config,project_id:foreignProject,token_hash:'e'.repeat(64)},owner,other);
 assert.equal((await transport(event(otherMachine.id,1,'-other'),'e'.repeat(64))).duplicate,false);
 for(let i=0;i<10;i++)await transport(first,'c'.repeat(64));
 assert.equal((await transport(first,'c'.repeat(64))).error_code,'rate_limited');
 assert.equal((await transport(event(otherMachine.id,2,'-other2'),'e'.repeat(64))).duplicate,false);
 await db.query("update memberships set role='viewer' where org_id=$1 and user_id=$2",[other,owner]);
 await assert.rejects(transport(event(otherMachine.id,3,'-removed'),'e'.repeat(64)),/forbidden/);
 await db.query("update memberships set role='owner' where org_id=$1 and user_id=$2",[other,owner]);
 await db.query('update machine_identities set window_at=now()-interval \'2 minutes\' where id=$1',[machine.id]);
 // Existing project assignment causes failure after append; transaction must undo new records.
 const conflicting=event(machine.id,30,'-rollback');const otherScope=randomUUID();
 await db.query("insert into projects(org_id,id,name) values($1,$2,'Alternate')",[org,otherScope]);await db.query('insert into project_robots values($1,$2,$3)',[org,otherScope,robot]);
 await db.query('select append_records($1,$2,$3)',[org,owner,JSON.stringify({bundle:conflicting.payload.capture,request_id:'conflict-seed',body_hash:'f'.repeat(64)})]);
 await db.query('insert into run_projects values($1,$2,$3,$4,$5)',[org,conflicting.run_id,otherScope,robot,owner]);
 const before=(await db.query('select version from workspaces where org_id=$1',[org])).rows[0].version;
 assert.equal((await transport(conflicting,'c'.repeat(64))).error_code,'scope_denied');
 assert.equal((await db.query('select version from workspaces where org_id=$1',[org])).rows[0].version,before);
 assert.equal((await db.query('select count(*)::int n from machine_events where event_id=$1',[conflicting.event_id])).rows[0].n,0);
 await admin('revoke',{id:machine.id});await assert.rejects(transport(first,'c'.repeat(64)),/forbidden/);
 await db.query('update collector_credentials set expires_at=now()-interval \'1 second\' where machine_id=$1',[otherMachine.id]);await assert.rejects(transport(event(otherMachine.id,4),'e'.repeat(64)),/forbidden/);
 // Browser roles cannot call privileged operations or obtain credential hashes.
 await db.exec('set role authenticated');
 await assert.rejects(admin('list',{}),/permission denied/);await assert.rejects(transport(first),/permission denied/);
 await assert.rejects(db.query('select * from machine_identities'),/permission denied/);await assert.rejects(db.query('select token_hash from collector_credentials'),/permission denied/);
 assert.equal((await db.query('select * from machine_events')).rows.length,0);await db.exec('reset role');
 assert.equal((await admin('list',{})).identities[0].revoked_at!==null,true);
 // Organization removal must still cascade with the new scope relationships.
 await db.query('delete from organizations where id=$1',[org]);
 assert.equal((await db.query('select count(*)::int n from machine_events where org_id=$1',[org])).rows[0].n,0);
 }finally{await db.close();}
});

test('machine HTTP routes use bearer scope, bounded validated metadata and safe errors',async()=>{
 Object.assign(process.env,{BETA_ENABLED:'true',BETA_MACHINES_ENABLED:'true',BETA_ORIGIN:'https://beta.example.invalid',SUPABASE_URL:'https://db.example.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'server'});
 let called=0;let errorCode=null;
 const handler=createHandler(async(url,init)=>{called++;const body=JSON.parse(init.body);assert.match(url,/rpc\/machine_transport$/);assert.equal(body.p_hash,hash('um_'+'a'.repeat(64)));assert.equal(JSON.stringify(body).includes('um_'),false);return Response.json(errorCode?{error_code:errorCode}:{event_id:body.p_event?.event_id,duplicate:false});});
 const e=event(randomUUID()),raw=JSON.stringify(e);
 const request=(body=raw,token='um_'+'a'.repeat(64))=>new Request('https://beta.example.invalid/api/v1/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body});
 assert.equal((await handler(request())).status,200);assert.equal(called,1);
 assert.equal((await handler(request(JSON.stringify({...e,secret:'no'})))).status,400);assert.equal(called,1);
 assert.equal((await handler(request(raw,'uc_'+'a'.repeat(64)))).status,401);
 assert.equal((await handler(request('x'.repeat(2097153)))).status,413);
 assert.equal((await handler(request(new Uint8Array([0xff,0xfe])))).status,400);
 errorCode='rate_limited';const response=await handler(request());assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'60');
 process.env.BETA_MACHINES_ENABLED='false';assert.equal((await handler(request())).status,503);
});
