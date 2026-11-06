import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { demoRecords } from '../../lib/demo/fixtures.ts';
import { appendBundle } from '../../lib/beta/records.ts';
import { emptyBundle, correctField, appendInvestigation } from '../../lib/local/records.ts';
const A='00000000-0000-4000-8000-000000000001', B='00000000-0000-4000-8000-000000000002';
const owner='10000000-0000-4000-8000-000000000001', other='10000000-0000-4000-8000-000000000002', viewer='10000000-0000-4000-8000-000000000003';
const fixture=()=>structuredClone({format:'unify-local',version:1,synthetic:true,records:demoRecords,corrections:[]});
async function database(){
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to authenticated,anon,service_role;
 insert into auth.users values('${owner}','owner@example.invalid',now()),('${other}','other@example.invalid',now()),('${viewer}','viewer@example.invalid',now());`);
 await db.exec(await readFile('supabase/migrations/202610130001_private_beta.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261016040114_stage7_investigations.sql','utf8'));
 // Reproduce the hosted default grant that PUBLIC-only revocation misses.
 await db.exec('grant execute on function public.is_org_member(uuid) to anon');
 await db.exec(await readFile('supabase/migrations/20261016223410_restrict_membership_helper.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261020030024_stage8_pilot.sql','utf8'));
 assert.deepEqual((await db.query("select has_function_privilege('anon','public.is_org_member(uuid)','execute') as anonymous, has_function_privilege('authenticated','public.is_org_member(uuid)','execute') as member")).rows[0], {anonymous:false,member:true});
 await db.query(`insert into organizations(id,name) values($1,'Synthetic A'),($2,'Synthetic B')`,[A,B]);
 await db.query(`insert into memberships values($1,$3,'owner'),($2,$4,'owner'),($1,$5,'viewer')`,[A,B,owner,other,viewer]);
 await db.query(`insert into workspaces(org_id) values($1),($2)`,[A,B]);return db;
}
async function command(db,action,org,actor,data={}){return(await db.query('select beta_command($1,$2,$3,$4::jsonb) as result',[action,org,actor,JSON.stringify(data)])).rows[0].result;}
const saveData=(bundle,version=0,key='first',h='a')=>({bundle,expected_version:version,request_id:key,body_hash:h.repeat(64)});
const pilot=(db,action,org,actor,data={})=>db.query('select pilot_command($1,$2,$3,$4::jsonb) as result',[action,org,actor,JSON.stringify(data)]).then(r=>r.rows[0].result);
test('pilot opt-in, immutable reviews, deduplicated activity and owner isolation',async()=>{
 const db=await database();try{
 await command(db,'save',A,owner,saveData(fixture()));
 assert.equal((await db.query('select * from pilot_events')).rows.length,0);
 const plan={startDate:new Date().toISOString().slice(0,10),scope:'Synthetic workflow',successCriteria:'Agreed rehearsal',baselineMinutes:null,baselineSamples:null,baselineMethod:''};
 await assert.rejects(pilot(db,'create',A,viewer,plan),/forbidden/);
 await pilot(db,'create',A,owner,plan);
 await assert.rejects(pilot(db,'create',A,owner,plan),/record_conflict/);
 await assert.rejects(pilot(db,'read',A,other),/forbidden/);
 await pilot(db,'comparison',A,viewer,{runId:'run-043',baselineId:'run-042'});
 await pilot(db,'comparison',A,viewer,{runId:'run-043',baselineId:'run-042'});
 await assert.rejects(pilot(db,'comparison',A,viewer,{runId:'foreign',baselineId:'run-042'}),/invalid_comparison/);
 await command(db,'save',A,owner,saveData(fixture(),1,'again'));
 const credential_hash='c'.repeat(64);const credential=await command(db,'credential',A,owner,{robot_id:fixture().records.robots[0].id,token_hash:credential_hash});
 const upload={...saveData(fixture(),2,'upload'),credential_hash};await command(db,'save',A,null,upload);await command(db,'save',A,null,upload);
 await pilot(db,'ingestion_failed',A,null,{credential_hash,attempt_id:'20000000-0000-4000-8000-000000000001'});
 await command(db,'revoke_credential',A,owner,{id:credential.id});
 await assert.rejects(pilot(db,'ingestion_failed',A,null,{credential_hash,attempt_id:'20000000-0000-4000-8000-000000000002'}),/forbidden/);
 const review={week:1,expectedRevision:0,evidenceNote:'Synthetic only',expectedRuns:null,capturedRuns:null};
 await pilot(db,'review',A,owner,review);await assert.rejects(pilot(db,'review',A,owner,review),/version_conflict/);
 await pilot(db,'review',A,owner,{...review,expectedRevision:1});
 await assert.rejects(pilot(db,'review',A,owner,{...review,week:4}),/week_not_started/);
 const data=await pilot(db,'read',A,owner);assert.equal(data.plan.synthetic,true);assert.equal(data.reviews.length,2);
 assert.deepEqual(Object.fromEntries(data.activity.map(a=>[a.kind,a.count])),{comparison:1,ingestion_failed:1,ingestion_succeeded:1,workspace_saved:1});
 for(const who of [viewer,other])await asUser(db,who,async()=>{for(const table of ['pilot_plans','pilot_reviews','pilot_events'])assert.equal((await db.query(`select * from ${table}`)).rows.length,0);});
 await asUser(db,owner,async()=>{assert.equal((await db.query('select * from pilot_reviews')).rows.length,2);await assert.rejects(pilot(db,'read',A,owner),/permission denied/);await assert.rejects(db.query("update pilot_reviews set payload='{}'"),/permission denied/);});
 await assert.rejects(db.query("update pilot_reviews set payload='{}'"),/immutable_record/);
 assert.equal(JSON.stringify(data).includes(credential_hash),false);
 const original=fixture(),snapshot=original.records.snapshots[0];
 const corrected=correctField(original,snapshot,'calibration',{state:'known',value:'synthetic-pilot-calibration'},{...snapshot.provenance.calibration,method:'Manual correction',author:'Synthetic verifier',recordedAt:new Date().toISOString().replace(/\.\d{3}Z$/,'Z')},'Synthetic capture measurement');
 await command(db,'save',A,owner,saveData(corrected,3,'pilot-snapshot'));
 assert.equal((await pilot(db,'read',A,owner)).activity.find(a=>a.kind==='snapshot_saved').count,1);
 await db.query("insert into memberships values($1,$2,'owner')",[A,other]);
 await command(db,'member',A,other,{user_id:owner,role:'remove'});
 await assert.rejects(pilot(db,'read',A,owner),/forbidden/);
 await asUser(db,owner,async()=>{for(const table of ['pilot_plans','pilot_reviews','pilot_events'])assert.equal((await db.query(`select * from ${table}`)).rows.length,0);});
 }finally{await db.close();}
});
async function asUser(db,user,work){await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);try{return await work();}finally{await db.exec('reset role');}}
test('PostgreSQL RLS isolates every exposed relation; direct writes and RPC denied',async()=>{
 const db=await database();try{
 await command(db,'save',A,owner,saveData(fixture()));await command(db,'save',B,other,saveData(fixture()));
 await asUser(db,owner,async()=>{
 for(const table of ['organizations','memberships','workspaces','robots','snapshots','runs','corrections','mappings','investigations','investigation_revisions','audit_events','components','evidence_references']){
 const rows=(await db.query(`select * from ${table}`)).rows;assert.ok(rows.every(r=>(table==='organizations'?r.id:r.org_id)===A),table);}
 await assert.rejects(db.query('update workspaces set version=99'),/permission denied/);
 await assert.rejects(command(db,'save',B,other,saveData(fixture())),/permission denied/);
 for(const t of ['invitations','collector_credentials','ingestion_receipts'])await assert.rejects(db.query(`select * from ${t}`),/permission denied/);
 });
 await db.exec('set role anon');await assert.rejects(db.query('select * from workspaces'),/permission denied/);await db.exec('reset role');
 await assert.rejects(command(db,'save',B,owner,saveData(fixture())),/forbidden/);
 await assert.rejects(command(db,'save',A,viewer,saveData(fixture())),/forbidden/);
 }finally{await db.close();}
});
test('immutable history, exact references, stale saves and retry identity',async()=>{
 const db=await database();try{
 const original=fixture();assert.equal((await command(db,'save',A,owner,saveData(original))).version,1);
 assert.equal((await command(db,'save',A,owner,saveData(original))).duplicate,true);
 await assert.rejects(command(db,'save',A,owner,saveData(original,0,'first','b')),/idempotency_conflict/);
 await assert.rejects(command(db,'save',A,owner,saveData(original,0,'stale')),/version_conflict/);
 const s=original.records.snapshots[0];const revised=correctField(original,s,'calibration',{state:'known',value:'synthetic-corrected'},{...s.provenance.calibration,method:'Manual correction',author:'Synthetic reviewer',recordedAt:'2026-10-13T10:00:00Z'},'Synthetic correction');
 await command(db,'save',A,owner,saveData(revised,1,'correction'));
 assert.deepEqual((await db.query('select payload from runs where org_id=$1 order by id',[A])).rows.map(r=>r.payload),[...original.records.runs].sort((a,b)=>a.id.localeCompare(b.id)));
 await assert.rejects(db.query("update snapshots set payload='{}'"),/immutable_record/);
 await assert.rejects(command(db,'save',A,owner,saveData(original,2,'erase')),/record_conflict/);
 await assert.rejects(db.query(`insert into runs values($1,'foreign','no-robot','no-snapshot',1,'{}',1)`,[B]),/foreign key/);
 const provenance=(await db.query('select s.revision,s.submitted_version,a.actor_id from snapshots s join audit_events a on a.org_id=s.org_id and a.workspace_version=s.submitted_version where s.org_id=$1 and s.id=$2 order by revision',[A,s.id])).rows;
 assert.deepEqual(provenance.map(p=>[p.revision,p.submitted_version,p.actor_id]),[[1,1,owner],[2,2,owner]]);
 assert.equal((await db.query('select version from workspaces where org_id=$1',[A])).rows[0].version,2);
 }finally{await db.close();}
});
test('email-bound single-use invitations, last owner and membership revocation',async()=>{
 const db=await database();try{
 await assert.rejects(command(db,'invite',A,viewer,{email:'other@example.invalid',role:'member',token_hash:'d'.repeat(64)}),/forbidden/);
 await command(db,'invite',A,owner,{email:'other@example.invalid',role:'member',token_hash:'d'.repeat(64)});
 await assert.rejects(command(db,'accept_invite',null,viewer,{token_hash:'d'.repeat(64)}),/forbidden/);
 await command(db,'accept_invite',null,other,{token_hash:'d'.repeat(64)});
 await assert.rejects(command(db,'accept_invite',null,other,{token_hash:'d'.repeat(64)}),/forbidden/);
 await assert.rejects(command(db,'member',A,owner,{user_id:owner,role:'remove'}),/last_owner/);
 await command(db,'member',A,owner,{user_id:other,role:'remove'});
 await asUser(db,other,async()=>assert.equal((await db.query('select * from workspaces where org_id=$1',[A])).rows.length,0));
 const inv=await command(db,'invite',A,owner,{email:'other@example.invalid',role:'viewer',token_hash:'e'.repeat(64)});
 await command(db,'revoke_invite',A,owner,{id:inv.id});await assert.rejects(command(db,'accept_invite',null,other,{token_hash:'e'.repeat(64)}),/forbidden/);
 }finally{await db.close();}
});
test('collector scope, expiry, revocation and atomic failure',async()=>{
 const db=await database();try{
 await command(db,'save',A,owner,saveData(fixture()));
 const robot=fixture().records.robots[0].id,credential_hash='c'.repeat(64);
 const cred=await command(db,'credential',A,owner,{robot_id:robot,token_hash:credential_hash});
 assert.equal((await command(db,'credential_lookup',A,null,{credential_hash})).robot_id,robot);
 await assert.rejects(command(db,'credential_lookup',B,null,{credential_hash}),/forbidden/);
 const wrong=fixture();wrong.records.robots.push({id:'outside-scope',name:'Synthetic',task:'Synthetic'});
 await assert.rejects(command(db,'save',A,null,{...saveData(wrong,1,'wrong'),credential_hash}),/forbidden/);
 assert.equal((await db.query("select * from robots where id='outside-scope'")).rows.length,0);
 await command(db,'save',A,null,{...saveData(fixture(),1,'upload'),credential_hash});
 await command(db,'revoke_credential',A,owner,{id:cred.id});
 await assert.rejects(command(db,'save',A,null,{...saveData(fixture(),1,'upload'),credential_hash}),/forbidden/);
 const second=await command(db,'credential',A,owner,{robot_id:robot,token_hash:'f'.repeat(64)});
 await db.query("update collector_credentials set expires_at=now()-interval '1 second' where id=$1",[second.id]);
 await assert.rejects(command(db,'credential_lookup',A,null,{credential_hash:'f'.repeat(64)}),/forbidden/);
 }finally{await db.close();}
});
test('backup restores data and RLS; deletion cannot cross organizations',async()=>{
 const db=await database();let restored;try{
 await command(db,'save',A,owner,saveData(fixture()));await command(db,'save',B,other,saveData(fixture()));
 const credential_hash='b'.repeat(64),robot=fixture().records.robots[0].id;
 const credential=await command(db,'credential',A,owner,{robot_id:robot,token_hash:credential_hash});
 await command(db,'revoke_credential',A,owner,{id:credential.id});
 restored=new PGlite({loadDataDir:await db.dumpDataDir()});
 await assert.rejects(command(restored,'credential_lookup',A,null,{credential_hash}),/forbidden/);
 assert.deepEqual((await restored.query('select bundle from workspaces where org_id=$1',[A])).rows[0].bundle,fixture());
 await asUser(restored,owner,async()=>assert.equal((await restored.query('select * from workspaces')).rows.length,1));
 await assert.rejects(command(restored,'delete_org',B,owner,{confirmation:B}),/forbidden/);
 await command(restored,'delete_org',A,owner,{confirmation:A});
 assert.equal((await restored.query('select * from snapshots where org_id=$1',[A])).rows.length,0);
 assert.deepEqual((await restored.query('select bundle from workspaces where org_id=$1',[B])).rows[0].bundle,fixture());
 }finally{await db.close();await restored?.close();}
});
test('append validates allowlists and preserves historical payloads',()=>{
 const b=fixture();assert.deepEqual(appendBundle(emptyBundle(),b),b);assert.deepEqual(appendBundle(b,b),b);
 const conflict=fixture();conflict.records.robots[0].name='changed';assert.throws(()=>appendBundle(b,conflict),/conflicts/);
 const extra=fixture();extra.secret='disallowed';assert.throws(()=>appendBundle(b,extra),/not allowed/);
});
test('investigation history persists atomically with audit, RLS and confirmation checks',async()=>{
 const db=await database();try{
 const entry={id:'20000000-0000-4000-8000-000000000001',revision:1,runId:'run-043',baselineId:'run-042',state:'investigating',author:'Synthetic engineer',recordedAt:'2026-10-16T04:00:00Z',note:'Inspect evidence.',evidenceNote:'',retestId:''};
 const a=appendInvestigation(fixture(),entry);await command(db,'save',A,owner,saveData(a));
 const b=appendInvestigation(a,{...entry,revision:2,state:'confirmed-by-engineer',evidenceNote:'Synthetic evidence reviewed.'});await command(db,'save',A,owner,saveData(b,1,'resolve'));
 assert.equal((await db.query('select * from investigation_revisions where org_id=$1',[A])).rows.length,2);
 const audit=(await db.query('select a.actor_id from investigation_revisions i join audit_events a on a.org_id=i.org_id and a.workspace_version=i.submitted_version where i.org_id=$1',[A])).rows;assert.ok(audit.every(a=>a.actor_id===owner));
 await asUser(db,other,async()=>assert.equal((await db.query('select * from investigation_revisions')).rows.length,0));
 await asUser(db,viewer,async()=>{assert.equal((await db.query('select * from investigation_revisions')).rows.length,2);await assert.rejects(db.query("update investigation_revisions set state='unresolved'"),/permission denied/);});
 await assert.rejects(command(db,'save',A,viewer,saveData(b,2,'viewer')),/forbidden/);
 await assert.rejects(command(db,'save',A,owner,saveData(a,2,'erase')),/record_conflict/);
 const bad=structuredClone(b);bad.investigations.push({...entry,revision:3,state:'confirmed-by-engineer'});
 await assert.rejects(command(db,'save',A,owner,saveData(bad,2,'no-evidence')),/check constraint/);
 assert.equal((await db.query('select version from workspaces where org_id=$1',[A])).rows[0].version,2);
 const otherBundle=fixture();otherBundle.records.runs.find(r=>r.id==='run-042').id='foreign-only';await command(db,'save',B,other,saveData(otherBundle));
 const foreign=structuredClone(b);foreign.investigations.push({...entry,id:'20000000-0000-4000-8000-000000000002',baselineId:'foreign-only'});
 await assert.rejects(command(db,'save',A,owner,saveData(foreign,2,'foreign')),/invalid_investigation_reference/);
 const credential_hash='a'.repeat(64);await command(db,'credential',A,owner,{robot_id:fixture().records.robots[0].id,token_hash:credential_hash});
 const c=appendInvestigation(b,{...entry,revision:3,state:'unresolved'});
 await assert.rejects(command(db,'save',A,null,{...saveData(c,2,'collector'),credential_hash}),/forbidden/);
 await command(db,'save',A,null,{...saveData(b,2,'collector-preserve'),credential_hash});
 assert.equal((await db.query('select * from investigation_revisions where org_id=$1',[A])).rows.length,2);
 await assert.rejects(db.query("update investigation_revisions set state='unresolved'"),/immutable_record/);
 }finally{await db.close();}
});
