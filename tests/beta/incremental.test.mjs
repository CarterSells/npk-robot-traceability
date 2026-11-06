import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { demoRecords } from '../../lib/demo/fixtures.ts';
const org='00000000-0000-4000-8000-000000000001',owner='10000000-0000-4000-8000-000000000001',viewer='10000000-0000-4000-8000-000000000002';
const fixture=()=>structuredClone({format:'unify-local',version:1,synthetic:true,records:demoRecords,corrections:[]});
async function setup(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users,not_after timestamptz);
 create table auth.identities(id uuid primary key,user_id uuid references auth.users,provider text);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to authenticated,anon,service_role;
 insert into auth.users values('${owner}','owner@example.invalid',now()),('${viewer}','viewer@example.invalid',now());`);
 for(const name of (await readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+name,'utf8'));
 await db.query("insert into organizations(id,name) values($1,'Synthetic B2')",[org]);
 await db.query("insert into memberships values($1,$2,'owner'),($1,$3,'viewer')",[org,owner,viewer]);
 await db.query('insert into workspaces(org_id) values($1)',[org]);
 return db;
}
const rpc=(db,name,actor,data)=>db.query(`select ${name}($1,$2,$3::jsonb) as result`,[org,actor,JSON.stringify(data)]).then(r=>r.rows[0].result);
const append=(db,bundle,key,actor=owner)=>rpc(db,'append_records',actor,{bundle,request_id:key,body_hash:createHash('sha256').update(JSON.stringify(bundle)).digest('hex')});
test('incremental migration, immutable legacy checkpoint, atomic retries, pagination and revocation',async()=>{
 const db=await setup();try{
 const b=fixture();
 await db.query("select beta_command('save',$1,$2,$3)",[org,owner,JSON.stringify({bundle:b,expected_version:0,request_id:'legacy',body_hash:'a'.repeat(64)})]);
 const cut=await db.query('select cutover_history($1,$2) as result',[org,owner]);
 assert.equal(cut.rows[0].result.verified_counts.runs,b.records.runs.length);
 await assert.rejects(db.query("select beta_command('save',$1,$2,'{}')",[org,owner]),/incremental_required/);
 const delta=fixture();delta.records.runs=delta.records.runs.map(r=>({...r,id:r.id+'-new'}));
 assert.equal((await append(db,delta,'b')).version,2);
 assert.equal((await append(db,delta,'b')).duplicate,true);
 await assert.rejects(append(db,b,'b'),/idempotency_conflict/);
 const foreign=fixture();foreign.records.runs[0]={...foreign.records.runs[0],id:'foreign-reference',robotId:'other-robot'};
 await assert.rejects(append(db,foreign,'foreign'),/foreign key/);
 await assert.rejects(append(db,delta,'c',viewer),/forbidden/);
 const conflict=fixture();conflict.records.robots[0].name='Changed';
 await assert.rejects(append(db,conflict,'d'),/record_conflict/);
 assert.equal((await db.query('select version from workspaces')).rows[0].version,2);
 assert.deepEqual((await db.query('select bundle from workspaces')).rows[0].bundle,b);
 let page=await rpc(db,'history_page',viewer,{collection:'runs',limit:1});
 const keys=[];while(true){keys.push(...page.rows.map(r=>r.key));if(!page.next)break;page=await rpc(db,'history_page',viewer,{collection:'runs',limit:1,after:page.next.key,watermark:page.watermark});}
 assert.equal(keys.length,new Set(keys).size);assert.equal(keys.length,b.records.runs.length*2);
 const concurrent=fixture();concurrent.records.runs=concurrent.records.runs.map(r=>({...r,id:r.id+'-concurrent'}));
 const writes=await Promise.all([append(db,concurrent,'parallel-a'),append(db,concurrent,'parallel-b')]);
 assert.deepEqual(writes.map(r=>r.version).sort(),[3,4]);
 assert.equal((await rpc(db,'history_page',owner,{collection:'runs',watermark:2})).rows.length,b.records.runs.length*2);
 await db.query('delete from memberships where org_id=$1 and user_id=$2',[org,viewer]);
 await assert.rejects(rpc(db,'history_page',viewer,{collection:'runs'}),/forbidden/);
 await db.exec('set role authenticated');
 await assert.rejects(rpc(db,'append_records',owner,{}),/permission denied/);
 await db.exec('reset role');
 }finally{await db.close();}
});
test('history exceeds legacy collection bound without rewriting checkpoint',async()=>{
 const db=await setup();try{
 await db.query('select cutover_history($1,$2)',[org,owner]);
 const b=fixture();b.records.runs=[];
 await append(db,b,'a');
 const start=performance.now();
 for(let batch=0;batch<12;batch++){
  const part=fixture();part.records.runs=Array.from({length:100},(_,i)=>({...part.records.runs[0],id:`run-${String(batch*100+i).padStart(6,'0')}`}));
  await append(db,part,'batch-'+batch);
 }
 assert.equal((await db.query('select count(*)::integer n from runs')).rows[0].n,1200);
 assert.equal((await db.query('select jsonb_array_length(bundle->\'records\'->\'runs\') n from workspaces')).rows[0].n,0);
 const startRead=performance.now();const page=await rpc(db,'history_page',owner,{collection:'runs',after:'run-001000',limit:100});
 assert.equal(page.rows.length,100);
 console.log(JSON.stringify({benchmark:'PGlite synthetic 1200 runs, 12 bounded batches',writeMs:Math.round(startRead-start),pageMs:Math.round(performance.now()-startRead),rssMiB:Math.round(process.memoryUsage().rss/1048576)}));
 }finally{await db.close();}
});
