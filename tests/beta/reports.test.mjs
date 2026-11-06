import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {demoRecords} from '../../lib/demo/fixtures.ts';
import {buildReport,reportSelection,validatePublishedReport} from '../../lib/beta/reports.ts';
import {publicIPv4,webhookURL,resolveWebhook,signature,verifyReportWebhook,reportWorkerStep} from '../../lib/beta/report-delivery.ts';
import {seal} from '../../lib/beta/connector-secrets.ts';
import {createHandler} from '../../lib/beta/server.ts';
const known=value=>({state:'known',value}),unknown={state:'unknown',reason:'Not measured'};
const attempt={job_id:randomUUID(),attempt_id:randomUUID(),retry_of:null,robot_id:'robot-01',snapshot_id:'snapshot-01',snapshot_revision:1,source_identity:randomUUID(),procedure:known('pick'),procedure_version:known('1'),task:known('test'),environment:unknown,components:unknown,reality:'synthetic',method:'manual'};
const event=(kind,payload,n)=>({event_id:randomUUID(),source_identity:attempt.source_identity,source_sequence:n,observed_at:'2026-11-01T10:00:00.000Z',received_at:'2026-11-01T10:01:00.000Z',archive_id:n+1,author:attempt.source_identity,kind,payload,correction_of:null,reason:null});
const source={attempt,project_id:randomUUID(),created_at:'2026-11-01T10:00:00.000Z',events:[event('state',{state:'succeeded'},0),event('measurement',{name:'duration',state:'known',value:3,unit:'s',reason:null},1),event('label',{name:'internal_note',value:'private investigation',evidence:'https://secret.invalid/raw'},2)]};
const selection=()=>({report_id:randomUUID(),project_id:source.project_id,expected_revision:0,period:{start:'2026-11-01T00:00:00.000Z',end:'2026-11-02T00:00:00.000Z'},attempt_ids:[attempt.attempt_id],metrics:['quality','duration'],conclusion:null,correction_reason:null});
test('reports expose selected measured facts, preserve unknowns and omit raw notes/links',()=>{
 const s=reportSelection(selection()),built=buildReport(s,[source]);
 assert.equal(built.content.runs[0].duration.value,3);assert.equal(built.content.runs[0].measurements[0].value,null);
 assert.equal(JSON.stringify(built).includes('private investigation'),false);assert.equal(JSON.stringify(built).includes('secret.invalid'),false);
 const published={...built.content,report_id:s.report_id,project_id:s.project_id,client_id:randomUUID(),revision:1,previous_revision:null,generated_at:new Date().toISOString()};
 validatePublishedReport(published);
 assert.throws(()=>validatePublishedReport({...published,raw_notes:'no'}));
 assert.throws(()=>validatePublishedReport({...published,model_assessment:{state:'available',reason:'invented'}}));
 assert.throws(()=>buildReport({...s,project_id:randomUUID()},[source]));
 assert.throws(()=>reportSelection({...s,attempt_ids:[attempt.attempt_id,attempt.attempt_id]}));
});
test('webhook URL and DNS restrictions deny private, link-local, numeric, rebinding and redirect-style targets',async()=>{
 process.env.REPORT_WEBHOOK_HOSTS='receiver.example.invalid';
 for(const address of ['127.0.0.1','10.2.3.4','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','198.18.0.1','::1','::ffff:127.0.0.1','192.0.2.1'])assert.equal(publicIPv4(address),false,address);
 assert.equal(publicIPv4('8.8.8.8'),true);
 for(const url of ['http://receiver.example.invalid/x','https://127.0.0.1/x','https://2130706433/x','https://receiver.example.invalid:444/x','https://user@receiver.example.invalid/x','https://receiver.example.invalid/x?secret=y','https://other.example.invalid/x'])assert.throws(()=>webhookURL(url));
 const url='https://receiver.example.invalid/reports';
 const result=await resolveWebhook(url,async()=>[{address:'8.8.8.8',family:4}]);assert.equal(result.address,'8.8.8.8');
 await assert.rejects(resolveWebhook(url,async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]));
 await assert.rejects(resolveWebhook(url,async()=>[{address:'::1',family:6}]));
 await assert.rejects(resolveWebhook(url,async()=>[{address:'127.0.0.1',family:4}]));
});
test('signed deliveries bind timestamp, event identity and exact body through secret rotation',()=>{
 const body='{"synthetic":true}',id=randomUUID(),timestamp=String(Math.floor(Date.now()/1000));
 const headers=new Headers({'X-Tavrik-Event-Id':id,'X-Tavrik-Timestamp':timestamp,'X-Tavrik-Signature':signature('new',timestamp,id,body)+','+signature('old',timestamp,id,body)});
 assert.equal(verifyReportWebhook(body,headers,['old']),true);assert.equal(verifyReportWebhook(body,headers,['new']),true);
 assert.equal(verifyReportWebhook(body+' ',headers,['new']),false);assert.equal(verifyReportWebhook(body,headers,['new'],Date.now()+301000),false);
 headers.set('X-Tavrik-Event-Id',randomUUID());assert.equal(verifyReportWebhook(body,headers,['new']),false);
});

async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users,not_after timestamptz);
 create table auth.identities(id uuid primary key,user_id uuid references auth.users,provider text);
 create function auth.uid() returns uuid language sql as $$select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
 grant usage on schema auth,public to authenticated;`);
 for(const file of(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 const org=randomUUID(),other=randomUUID(),owner=attempt.source_identity,client=randomUUID(),viewer=randomUUID(),project=source.project_id,otherProject=randomUUID(),clientId=randomUUID();
 await db.query("insert into auth.users values($1,'owner@example.invalid',now()),($2,'client@example.invalid',now()),($3,'viewer@example.invalid',now())",[owner,client,viewer]);
 await db.query("insert into organizations(id,name) values($1,'Synthetic reports'),($2,'Other reports')",[org,other]);
 await db.query("insert into memberships values($1,$2,'owner'),($1,$3,'viewer')",[org,owner,viewer]);
 await db.query('insert into workspaces(org_id,incremental) values($1,true)',[org]);
 const run=demoRecords.runs[0],snapshot=demoRecords.snapshots.find(s=>s.id===run.snapshotId&&s.revision===run.snapshotRevision),robot=demoRecords.robots.find(r=>r.id===run.robotId);
 const bundle={format:'unify-local',version:1,synthetic:true,records:{robots:[robot],snapshots:[snapshot],runs:[run]},corrections:[]};
 await db.query('select append_records($1,$2,$3)',[org,owner,JSON.stringify({bundle,request_id:'seed',body_hash:'a'.repeat(64)})]);
 await db.query("insert into clients values($1,$2,'Synthetic client')",[org,clientId]);
 await db.query("insert into projects(org_id,id,client_id,name) values($1,$2,$3,'Shared project'),($1,$4,$3,'Other project')",[org,project,clientId,otherProject]);
 await db.query('insert into project_robots values($1,$2,$3)',[org,project,robot.id]);
 await db.query('insert into client_project_grants(org_id,project_id,client_id,user_id,granted_by) values($1,$2,$3,$4,$5)',[org,project,clientId,client,owner]);
 const a={...attempt,robot_id:robot.id,snapshot_id:snapshot.id,snapshot_revision:snapshot.revision};
 await db.query('select execution_command($1,$2,$3)',[org,owner,JSON.stringify({action:'create',project_id:project,attempt:a})]);
 for(const e of source.events){const {received_at,archive_id,author,...payload}=e;await db.query('select execution_command($1,$2,$3)',[org,owner,JSON.stringify({action:'append',attempt_id:a.attempt_id,event:payload,body_hash:String(e.archive_id).repeat(64)})]);}
 const getBuilt=async(sel)=>{
  const [row]=(await db.query('select created_at from execution_attempts where org_id=$1 and id=$2',[org,a.attempt_id])).rows;
  const events=(await db.query('select * from execution_events where org_id=$1 and attempt_id=$2',[org,a.attempt_id])).rows.map(e=>({...e.payload,archive_id:e.archive_id,received_at:new Date(e.received_at).toISOString(),author:e.author}));
  return buildReport(sel,[{attempt:a,project_id:project,created_at:new Date(row.created_at).toISOString(),events}]);
 };
 const sel={...selection(),period:{start:'2020-01-01T00:00:00.000Z',end:'2030-01-01T00:00:00.000Z'}};
 const pub=(built,actor=owner,tenant=org)=>db.query('select report_publish($1,$2,$3) r',[tenant,actor,JSON.stringify(built)]).then(x=>x.rows[0].r);
 const admin=(data)=>db.query('select report_admin($1,$2,$3) r',[org,owner,JSON.stringify(data)]).then(x=>x.rows[0].r);
 const worker=(action,data)=>db.query('select report_worker($1,$2) r',[action,JSON.stringify(data)]).then(x=>x.rows[0].r);
 const api=(data={},hash='a'.repeat(64))=>db.query('select report_api($1,$2) r',[hash,JSON.stringify(data)]).then(x=>x.rows[0].r);
 process.env.CONNECTOR_KEYS=JSON.stringify({test:'c'.repeat(64)});process.env.CONNECTOR_ACTIVE_KEY='test';
 const endpoint=randomUUID(),secret=seal({active:'new-secret',previous:'old-secret',previous_until:Date.now()+60000},'report:'+org+':'+endpoint);
 await admin({action:'endpoint',id:endpoint,project_id:project,recipient:client,url:'https://receiver.example.invalid/reports',secret});
 await admin({action:'credential',project_id:project,recipient:client,days:1,token_hash:'a'.repeat(64)});
 return {db,org,other,owner,client,viewer,clientId,project,otherProject,sel,getBuilt,pub,admin,worker,api,endpoint,secret};
}
test('publication/outbox is atomic; revision, API scope, redaction, retries, rotation and revoked delivery',async()=>{
 const f=await fixture();const {db,org,other,owner,client,viewer,project,otherProject,sel,getBuilt,pub,admin,worker,api,endpoint}=f;
 try{
  const built=await getBuilt(sel);
  await assert.rejects(pub(built,viewer),/forbidden/);await assert.rejects(pub(built,owner,other),/forbidden/);
  await assert.rejects(pub({...built,cutoffs:{[attempt.attempt_id]:999999}}),/version_conflict/);
  const first=await pub(built);validatePublishedReport(first.report);assert.equal(first.report.revision,1);
  assert.equal((await pub(built)).duplicate,true);
  assert.equal((await db.query('select * from report_deliveries')).rows.length,1);
  assert.equal((await api()).rows.length,1);assert.equal(JSON.stringify(await api()).includes('private investigation'),false);
  const corrected=await getBuilt({...sel,expected_revision:1,correction_reason:'Updated engineer review.',conclusion:'Reviewed synthetic evidence; no cause established.'});
  assert.equal((await pub(corrected)).report.previous_revision,1);
  await assert.rejects(pub({...corrected,selection:{...corrected.selection,expected_revision:0}}),/version_conflict/);
  let deliveries=[];
  const send=async(url,body,headers)=>{assert.equal(url,'https://receiver.example.invalid/reports');assert.equal(verifyReportWebhook(body,new Headers(headers),['old-secret']),true);deliveries.push(JSON.parse(body));return deliveries.length===1?503:204;};
  await reportWorkerStep(worker,send);
  await db.exec("update report_deliveries set next_at=clock_timestamp()-interval '1 second'");
  await reportWorkerStep(worker,send);await reportWorkerStep(worker,send);
  assert.equal(deliveries.length,3);assert.equal(new Set(deliveries.map(x=>x.event_id)).size,2);
  assert.equal(deliveries.some(x=>x.event_type==='report.corrected'),true);
  assert.equal((await db.query("select count(*)::int n from report_deliveries where state='delivered'")).rows[0].n,2);
  const rotated=seal({active:'rotated',previous:null,previous_until:0},'report:'+org+':'+endpoint);
  await admin({action:'rotate',id:endpoint,expected_revision:1,secret:rotated});
  await assert.rejects(admin({action:'rotate',id:endpoint,expected_revision:1,secret:rotated}),/version_conflict/);
  await pub(await getBuilt({...sel,expected_revision:2,correction_reason:'Further review.',conclusion:'Third reviewed revision.'}));
  const pending=await worker('claim',{});
  await db.query('delete from client_project_grants where org_id=$1 and project_id=$2 and user_id=$3',[org,project,client]);
  await assert.rejects(api(),/forbidden/);assert.equal(await worker('dispatch',pending),null);
  await assert.rejects(admin({action:'replay',id:pending.id}),/forbidden/);
  await db.exec('set role authenticated');
  await assert.rejects(pub(built),/permission denied/);await assert.rejects(db.query('select secret from report_endpoints'),/permission denied/);
  await db.exec('reset role');
  await assert.rejects(db.query("update report_publications set payload='{}'"),/immutable/);
  await db.query('delete from organizations where id=$1',[org]);assert.equal((await db.query('select * from report_deliveries')).rows.length,0);
 }finally{await db.close();}
});
test('expired leases, timeout, non-2xx, dead letters and controlled replay retain stable event IDs',async()=>{
 const f=await fixture();const {db,sel,getBuilt,pub,worker,admin}=f;
 try{
  await pub(await getBuilt(sel));const claimed=await worker('claim',{}),first=await worker('dispatch',claimed);
  await db.exec("update report_deliveries set lease_until=clock_timestamp()-interval '1 second'");
  const recovered=await worker('claim',{});assert.notEqual(recovered.lease,claimed.lease);
  assert.equal((await worker('dispatch',recovered)).event_id,first.event_id);
  await worker('finish',{...recovered,delivered:false,status_code:302});
  for(let n=0;n<6;n++){await db.exec("update report_deliveries set next_at=clock_timestamp()-interval '1 second'");await reportWorkerStep(worker,async()=>{throw Error('Timeout');});}
  const [dead]=(await db.query('select id,state from report_deliveries')).rows;assert.equal(dead.state,'dead');
  await admin({action:'replay',id:dead.id});
  let eventId;await reportWorkerStep(worker,async(_url,body)=>{eventId=JSON.parse(body).event_id;return 200;});assert.equal(eventId,first.event_id);
 }finally{await db.close();}
});
test('report HTTP routes separate scoped service keys from human sessions and gate publication',async()=>{
 Object.assign(process.env,{BETA_ENABLED:'true',BETA_REPORTS_ENABLED:'true',BETA_AUTH_LIFECYCLE:'false',BETA_ORIGIN:'https://beta.example.invalid',SUPABASE_URL:'https://db.example.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'server'});
 const actor=randomUUID(),org=randomUUID();let calls=0;
 const handle=createHandler(async(url,init)=>{
  const path=new URL(url).pathname;
  if(path==='/auth/v1/user')return Response.json({id:actor});
  if(path==='/rest/v1/memberships')return Response.json([{role:'viewer'}]);
  if(path==='/rest/v1/rpc/report_api'){calls++;assert.match(JSON.parse(init.body).p_hash,/^[a-f0-9]{64}$/);return Response.json({rows:[],next:null});}
  throw Error('Unexpected upstream');
 });
 const service=key=>new Request('https://beta.example.invalid/api/v1/reports',{headers:{Authorization:'Bearer '+key}});
 assert.equal((await handle(service('tr_'+'a'.repeat(64)))).status,200);assert.equal((await handle(service('um_'+'a'.repeat(64)))).status,401);
 const human=new Request(`https://beta.example.invalid/api/org/${org}/reports`,{method:'POST',headers:{Origin:process.env.BETA_ORIGIN,Cookie:'unify_session=synthetic','Content-Type':'application/json'},body:JSON.stringify({action:'preview',selection:selection()})});
 assert.equal((await handle(human)).status,403);process.env.BETA_REPORTS_ENABLED='false';assert.equal((await handle(service('tr_'+'a'.repeat(64)))).status,503);assert.equal(calls,1);
});
