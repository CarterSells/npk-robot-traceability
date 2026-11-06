import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {seal,unseal,verifyOnshapeWebhook} from '../../lib/beta/connector-secrets.ts';
import {captureReference,useOnshape} from '../../lib/beta/onshape.ts';
import {cadBundle,connectorRoute,onshapeCallback} from '../../lib/beta/connectors.ts';
import {connectorWorkerStep} from '../../lib/beta/connector-worker.ts';
import {demoRecords} from '../../lib/demo/fixtures.ts';
const did='a'.repeat(24),eid='b'.repeat(24),mid='c'.repeat(24),vid='d'.repeat(24);
Object.assign(process.env,{CONNECTOR_KEYS:JSON.stringify({one:'1'.repeat(64),two:'2'.repeat(64)}),CONNECTOR_ACTIVE_KEY:'one',ONSHAPE_CLIENT_ID:'test-client',ONSHAPE_CLIENT_SECRET:'test-only',BETA_ORIGIN:'https://beta.example.invalid'});
test('connector secrets bind tenant/context, rotate keys and authenticate raw webhook bytes',()=>{
 const encrypted=seal({refresh:'test-refresh'},'org:connection');assert.equal(JSON.stringify(encrypted).includes('test-refresh'),false);
 assert.deepEqual(unseal(encrypted,'org:connection'),{refresh:'test-refresh'});assert.throws(()=>unseal(encrypted,'other:connection'));
 process.env.CONNECTOR_ACTIVE_KEY='two';assert.equal(seal(unseal(encrypted,'org:connection'),'org:connection').keyId,'two');process.env.CONNECTOR_ACTIVE_KEY='one';
 const timestamp=new Date().toISOString(),raw='{"messageId":"test"}',signature=createHmac('sha256','test-key').update(timestamp+'.'+raw).digest('base64');
 const headers=new Headers({'x-onshape-webhook-timestamp':timestamp,'x-onshape-webhook-signature-secondary':signature});
 assert.equal(verifyOnshapeWebhook(raw,headers,['old-key','test-key']),true);assert.equal(verifyOnshapeWebhook(raw+' ',headers,['test-key']),false);assert.equal(verifyOnshapeWebhook(raw,headers,['test-key'],Date.now()+600000),false);
});
test('CAD capture pins a workspace before reading its element and preserves manual installation evidence',async()=>{
 const paths=[];const ref=await captureReference({document_id:did},async path=>{paths.push(path);return path.endsWith('currentmicroversion')?{microversion:mid}:[{id:eid,name:'Synthetic gripper'}];},{kind:'w',reference_id:vid,element_id:eid});
 assert.equal(paths[1].includes('/m/'+mid+'/'),true);assert.equal(ref.installation,'not_verified');
 const base=demoRecords.snapshots[0],robot=demoRecords.robots.find(r=>r.id===base.robotId),copy=structuredClone(base);
 const bundle=cadBundle(base,robot,ref,'gripper',randomUUID(),true,'Synthetic author');
 assert.deepEqual(base,copy);assert.deepEqual(bundle.records.snapshots[0].provenance.hardware,base.provenance.hardware);assert.equal(bundle.records.runs.length,0);assert.match(bundle.records.snapshots[0].custom[0].value.value,/\/m\//);
 await assert.rejects(captureReference({document_id:did},async()=>[],{kind:'m',reference_id:mid,element_id:eid}),/unavailable/);
});
test('provider write transport ambiguity is never retried and releases its lease',async()=>{
 let sent=0,released=false;const org=randomUUID(),id=randomUUID();
 const command=async action=>{if(action==='lease')return {org_id:org,id,secret:seal({access:'test',refresh:'test',expires:Date.now()+3600000},org+':'+id),lease:randomUUID()};if(action==='reserve_call')return {reserved:true};if(action==='release')released=true;};
 await assert.rejects(useOnshape(command,async()=>{sent++;throw Error('lost response');},org,randomUUID(),id,async(c,call)=>call('/api/v10/documents/d/'+did+'/versions',{})),/unknown/);
 assert.equal(sent,1);assert.equal(released,true);
});
test('connector schema enforces tenant scope, refresh exclusion, revocation, OAuth replay, budgets and uncertain job recovery',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users,not_after timestamptz);
 create table auth.identities(id uuid primary key,user_id uuid references auth.users,provider text);
 create function auth.uid() returns uuid language sql as $$select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;grant usage on schema auth,public to authenticated;`);
 for(const f of(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 const org=randomUUID(),actor=randomUUID(),session=randomUUID(),id=randomUUID();
 await db.query('insert into auth.users values($1,$2,now())',[actor,'synthetic@example.invalid']);await db.query('insert into auth.sessions values($1,$2,null)',[session,actor]);await db.query('select approve_app_session($1,$2)',[actor,session]);
 await db.query("insert into organizations(id,name) values($1,'Synthetic connectors')",[org]);await db.query("insert into memberships values($1,$2,'owner')",[org,actor]);await db.query('insert into workspaces(org_id,incremental) values($1,true)',[org]);
 await db.query('select append_records($1,$2,$3)',[org,actor,JSON.stringify({bundle:{format:'unify-local',version:1,synthetic:true,records:demoRecords,corrections:[]},request_id:'seed',body_hash:'a'.repeat(64)})]);
 const project=(await db.query("select project_command('project',$1,$2,$3) r",[org,actor,JSON.stringify({name:'Synthetic CAD'})])).rows[0].r.id;
 await db.query("select project_command('robot',$1,$2,$3)",[org,actor,JSON.stringify({project_id:project,robot_id:demoRecords.robots[0].id})]);
 const command=(action,o=org,a=actor,data={})=>db.query('select integration_command($1,$2,$3,$4) r',[action,o,a,JSON.stringify(data)]).then(r=>r.rows[0].r);
 await command('create',org,actor,{id,project_id:project,robot_id:demoRecords.robots[0].id,document_id:did});
 await assert.rejects(command('list',randomUUID(),actor),/forbidden/);
 const metadata=await command('begin_oauth',org,actor,{connection_id:id,state_hash:'a'.repeat(64),binding_hash:'b'.repeat(64),session_id:session});
 await assert.rejects(command('consume_oauth',null,null,{state_hash:'a'.repeat(64),binding_hash:'c'.repeat(64)}),/forbidden/);
 await command('consume_oauth',null,null,{state_hash:'a'.repeat(64),binding_hash:'b'.repeat(64)});
 await assert.rejects(command('consume_oauth',null,null,{state_hash:'a'.repeat(64),binding_hash:'b'.repeat(64)}),/forbidden/);
 const tokens={access:'test',refresh:'test',expires:Date.now()+3600000};
 await command('activate',org,actor,{connection_id:id,revision:metadata.revision,session_id:session,secret:seal(tokens,org+':'+id)});
 const list=await command('list');assert.equal(JSON.stringify(list).includes('secret'),false);
 const lease=await command('lease',org,actor,{connection_id:id});assert.equal((await command('lease',org,actor,{connection_id:id})).busy,true);
 await command('reserve_call',org,actor,{connection_id:id,lease:lease.lease});assert.ok((await command('reserve_call',org,actor,{connection_id:id,lease:lease.lease})).wait_ms>0);
 await command('disconnect',org,actor,{connection_id:id});await assert.rejects(command('rotate',org,actor,{connection_id:id,lease:lease.lease,secret:seal(tokens,org+':'+id)}),/forbidden/);
 await command('activate',org,actor,{connection_id:id,revision:2,session_id:session,secret:seal(tokens,org+':'+id)});
 await assert.rejects(command('enqueue',org,actor,{connection_id:id,id:randomUUID(),kind:'create_version',parameters:{},body_hash:'a'}),/forbidden/);
 const jobId=randomUUID(),data={connection_id:id,id:jobId,kind:'export_step',parameters:{version_id:vid,element_id:eid,microversion_id:mid},body_hash:'a'};
 assert.equal((await command('enqueue',org,actor,data)).duplicate,false);assert.equal((await command('enqueue',org,actor,data)).duplicate,true);await assert.rejects(command('enqueue',org,actor,{...data,body_hash:'b'}),/idempotency_conflict/);
 assert.equal((await db.query("select count(*)::int n from audit_events where org_id=$1 and action='integration_enqueued'",[org])).rows[0].n,1);
 const job=await command('claim_job',null,null,{});await command('dispatch_job',org,null,{id:jobId,lease:job.lease});
 await db.query("update integration_jobs set lease_until=now()-interval '1 second' where id=$1",[jobId]);
 await command('claim_job',null,null,{});assert.equal((await db.query('select status from integration_jobs where id=$1',[jobId])).rows[0].status,'unknown');
 const oldJob=randomUUID();await command('enqueue',org,actor,{...data,id:oldJob});
 await db.query("update integration_jobs set status='active',created_at=now()-interval '25 hours' where id=$1",[oldJob]);await command('claim_job',null,null,{});
 assert.equal((await db.query('select status from integration_jobs where id=$1',[oldJob])).rows[0].status,'unknown');
 const active=await command('lease',org,actor,{connection_id:id});await db.query("update integration_connections set lease_until=now()-interval '1 second' where id=$1",[id]);assert.equal((await command('lease',org,actor,{connection_id:id})).reconnect_required,true);
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from integration_connections'),/permission denied/);await assert.rejects(command('list'),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});
test('worker rejects a changed workspace without dispatch and marks lost writes unknown',async()=>{
 for(const changed of [true,false]){
  const org=randomUUID(),connection=randomUUID();let dispatched=0,status,posts=0;
  const job={id:randomUUID(),org_id:org,connection_id:connection,actor_id:randomUUID(),kind:'create_version',status:'queued',lease:randomUUID(),parameters:{workspace_id:vid,microversion_id:mid,name:'Synthetic'},attempts:0};
  const command=async(action,o,a,data)=>{if(action==='claim_job')return job;if(action==='lease')return {document_id:did,write_enabled:true,lease:randomUUID(),secret:seal({access:'test',refresh:'test',expires:Date.now()+3600000},org+':'+connection)};if(action==='reserve_call')return {reserved:true};if(action==='dispatch_job')dispatched++;if(action==='finish_job')status=data.status;};
  await connectorWorkerStep(command,async(url,init)=>{if(init.method==='POST'){posts++;throw Error('lost');}return Response.json({microversion:changed?vid:mid});});
  assert.equal(dispatched,changed?0:1);assert.equal(posts,changed?0:1);assert.equal(status,changed?'rejected':'unknown');
 }
});
test('OAuth binds callback to its browser cookie, consumes state and never returns tokens',async()=>{
 const org=randomUUID(),actor=randomUUID(),session=randomUUID(),connection=randomUUID();let activated,consumed=0,providerCalls=0;
 const cfg={origin:'https://beta.example.invalid',url:'https://db.example.invalid',key:'test',service:'test'};
 const remote=async(path,method,body)=>{
  if(body.p_action==='begin_oauth')return {write_enabled:false,revision:0};
  if(body.p_action==='consume_oauth'){consumed++;return {org_id:org,actor_id:actor,connection_id:connection,session_id:session};}
  if(body.p_action==='activate'){activated=body.p_data;return {saved:true};}
  throw Error('Unexpected RPC');
 };
 const provider=async(url,init)=>{providerCalls++;assert.equal(url,'https://oauth.onshape.com/oauth/token');assert.equal(init.redirect,'error');return Response.json({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600});};
 const token='x.'+Buffer.from(JSON.stringify({session_id:session})).toString('base64url')+'.x';
 const begin=await connectorRoute(new Request(cfg.origin,{method:'POST'}),cfg,remote,provider,org,actor,token,{action:'authorize',connection_id:connection},async()=>[]);
 const authorize=await begin.json(),state=new URL(authorize.url).searchParams.get('state');assert.equal(new URL(authorize.url).searchParams.get('scope'),'OAuth2Read');
 const cookie=begin.headers.get('set-cookie').split(';')[0];
 const invalid=await onshapeCallback(new Request(cfg.origin+'/api/onshape-callback?code=test&state=bad',{headers:{Cookie:cookie}}),cfg,remote,provider);
 assert.match(invalid.headers.get('location'),/failed/);assert.equal(consumed,0);
 const valid=await onshapeCallback(new Request(cfg.origin+'/api/onshape-callback?code=test&state='+state,{headers:{Cookie:cookie}}),cfg,remote,provider);
 assert.match(valid.headers.get('location'),/connected/);assert.equal(consumed,1);assert.equal(providerCalls,1);assert.equal(activated.session_id,session);
 assert.equal(unseal(activated.secret,org+':'+connection).refresh,'synthetic-refresh');assert.equal((await valid.text()).includes('synthetic-access'),false);
});
test('expiring provider token rotates both tokens before a read and exports progress to completion',async()=>{
 const org=randomUUID(),id=randomUUID();let stored,refreshes=0;
 const command=async(action,o,a,data)=>{if(action==='lease')return {document_id:did,lease:randomUUID(),secret:seal({access:'old',refresh:'old-refresh',expires:0},org+':'+id)};if(action==='reserve_call')return {reserved:true};if(action==='rotate')stored=data.secret;};
 await useOnshape(command,async(url,init)=>{if(url.includes('/oauth/token')){refreshes++;return Response.json({access_token:'new',refresh_token:'new-refresh',expires_in:3600});}assert.equal(init.headers.Authorization,'Bearer new');return Response.json({id:vid});},org,randomUUID(),id,async(c,call)=>call('/api/v10/documents/'+did));
 assert.equal(refreshes,1);assert.equal(unseal(stored,org+':'+id).refresh,'new-refresh');
 const job={id:randomUUID(),org_id:org,actor_id:randomUUID(),connection_id:id,kind:'export_step',status:'active',provider_id:vid,lease:randomUUID()};let finished;
 const workerCommand=async(action,o,a,data)=>{if(action==='claim_job')return job;if(action==='lease')return {document_id:did,lease:randomUUID(),secret:seal({access:'test',refresh:'test',expires:Date.now()+3600000},org+':'+id)};if(action==='reserve_call')return {reserved:true};if(action==='finish_job')finished=data;};
 await connectorWorkerStep(workerCommand,async()=>Response.json({id:vid,documentId:did,requestState:'DONE',resultExternalDataIds:[eid]}));
 assert.equal(finished.status,'completed');assert.deepEqual(finished.output.externalDataIds,[eid]);
});
