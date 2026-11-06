import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, origin, apiURL, status, sql } from './local-supabase.mjs';
import { createHandler } from '../lib/beta/server.ts';
import { demoRecords } from '../lib/demo/fixtures.ts';
import { appendInvestigation } from '../lib/local/records.ts';

const manifestPath=resolve(root,'.cache/local-supabase-accounts.json');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function bootstrapSQL(m) {
  for(const id of [...m.organizations,...m.accounts.map(a=>a.id)]) if(!uuid.test(id)) throw new Error('Invalid local fixture identifier.');
  const [a,b]=m.organizations, [owner,other,viewer]=m.accounts.map(a=>a.id);
  // IDs are generated once and retained. No update/delete/upsert can replace user data.
  return `begin;
with created as (
  insert into public.organizations(id,name) values('${a}','Synthetic local A'),('${b}','Synthetic local B') on conflict do nothing returning id
), members as (
  insert into public.memberships(org_id,user_id,role)
  select v.org_id,v.user_id,v.role from (values('${a}'::uuid,'${owner}'::uuid,'owner'),('${b}'::uuid,'${other}'::uuid,'owner'),('${a}'::uuid,'${viewer}'::uuid,'viewer')) v(org_id,user_id,role)
  join created on created.id=v.org_id returning org_id
)
insert into public.workspaces(org_id) select id from created;
commit;`;
}
function manifest(create=false) {
  if(!existsSync(manifestPath)) {
    if(!create) throw new Error('Run npm run db:seed first.');
    mkdirSync(resolve(root,'.cache'),{recursive:true});
    const tag=randomUUID();
    const m={format:'unify-local-synthetic-accounts-v1',organizations:[randomUUID(),randomUUID()],accounts:['owner','other','viewer'].map(role=>({role,email:`${role}-${tag}@example.invalid`,password:randomBytes(24).toString('base64url')}))};
    writeFileSync(manifestPath,JSON.stringify(m,null,2)+'\n',{flag:'wx',mode:0o600});
  }
  const m=JSON.parse(readFileSync(manifestPath,'utf8'));
  if(m.format!=='unify-local-synthetic-accounts-v1' || m.accounts.length!==3 || m.organizations.length!==2 || m.accounts.some(a=>!a.email.endsWith('@example.invalid'))) throw new Error('Invalid local account manifest.');
  return m;
}
function connection() {
  const s=status();
  Object.assign(process.env,{BETA_ENABLED:'true',BETA_ORIGIN:origin,SUPABASE_URL:apiURL,SUPABASE_ANON_KEY:s.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:s.SERVICE_ROLE_KEY});
  return s;
}
async function remote(s,path,method='GET',body,token=s.SERVICE_ROLE_KEY) {
  const response=await fetch(apiURL+path,{method,headers:{apikey:s.ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(15000)});
  // Never echo provider response bodies: they may include credentials or private data.
  if(!response.ok) throw new Error(`Local service request failed (${response.status}) at ${path.split('?')[0]}.`);
  return response.status===204?{}:response.json();
}
export function client(handle=createHandler()) {
  let cookie='';
  return async (path,body,expected=200)=>{
    const response=await handle(new Request(origin+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}));
    assert.equal(response.status,expected,`Unexpected status from ${path}`);
    if(response.headers.has('set-cookie')) cookie=response.headers.get('set-cookie').split(';')[0];
    return response.json();
  };
}
export async function seed() {
  const s=connection(),m=manifest(true);
  for(const account of m.accounts) {
    if(!account.id) {
      // Resume a partial seed by finding only this manifest's random synthetic email.
      let existing;
      for(let page=1;;page++) {
        const result=await remote(s,`/auth/v1/admin/users?page=${page}&per_page=100`);
        existing=result.users.find(u=>u.email===account.email);
        if(existing || result.users.length<100) break;
      }
      const user=existing ?? await remote(s,'/auth/v1/admin/users','POST',{email:account.email,password:account.password,email_confirm:true});
      account.id=user.id;
      writeFileSync(manifestPath,JSON.stringify(m,null,2)+'\n',{mode:0o600});
    }
    // Verify the manifest still belongs to these accounts; never rotate an existing password.
    const token=await remote(s,'/auth/v1/token?grant_type=password','POST',{email:account.email,password:account.password},s.ANON_KEY);
    assert.equal(token.user.id,account.id);
  }
  sql(bootstrapSQL(m));
  for(let i=0;i<2;i++) {
    const api=client();await api('login',{email:m.accounts[i].email,password:m.accounts[i].password});
    const saved=await api(`org/${m.organizations[i]}/workspace`);
    assert.equal(saved.role,'owner');
    if(saved.version===0 && saved.bundle.records.robots.length===0) {
      const bundle=appendInvestigation(structuredClone({format:'unify-local',version:1,synthetic:true,records:demoRecords,corrections:[]}),{
        id:randomUUID(),revision:1,runId:'run-043',baselineId:'run-042',state:'investigating',author:'Synthetic local engineer',recordedAt:new Date().toISOString().replace(/\.\d{3}Z$/,'Z'),note:'Synthetic seed: inspect recorded calibration changes.',evidenceNote:'',retestId:''});
      await api(`org/${m.organizations[i]}/save`,{expected_version:0,request_id:'local-seed-v1',bundle});
    }
    await api('logout',{});
  }
  console.log('Synthetic organizations and owner/other/viewer accounts ready. Existing records preserved.');
  console.log('Local login details are in ignored .cache/local-supabase-accounts.json; do not commit or share it.');
}
export async function verify() {
  const s=connection(),m=manifest(),[a,b]=m.organizations;
  const owner=client(),other=client(),viewer=client();
  for(const [api,account] of [[owner,m.accounts[0]],[other,m.accounts[1]],[viewer,m.accounts[2]]]) await api('login',{email:account.email,password:account.password});
  const before=await owner(`org/${a}/workspace`);
  assert.equal(before.bundle.synthetic,true);
  assert.ok(before.bundle.records.runs.length>0);
  const bundle=appendInvestigation(before.bundle,{id:randomUUID(),revision:1,runId:'run-043',baselineId:'run-042',state:'unresolved',author:'Synthetic local verifier',recordedAt:new Date().toISOString().replace(/\.\d{3}Z$/,'Z'),note:'Local persistence test; no causal conclusion.',evidenceNote:'',retestId:''});
  const result=await owner(`org/${a}/save`,{expected_version:before.version,request_id:randomUUID(),bundle});
  await owner('logout',{});await owner('login',{email:m.accounts[0].email,password:m.accounts[0].password});
  const after=await owner(`org/${a}/workspace`);
  assert.equal(after.version,result.version);assert.deepEqual(after.bundle,bundle);
  assert.deepEqual(await owner(`org/${a}/export`),bundle);
  await other(`org/${a}/workspace`,undefined,403);await other(`org/${a}/export`,undefined,403);
  await owner(`org/${b}/workspace`,undefined,403);
  assert.deepEqual((await viewer(`org/${a}/workspace`)).bundle,bundle);
  await viewer(`org/${a}/save`,{expected_version:after.version,request_id:randomUUID(),bundle},403);
  const token=await remote(s,'/auth/v1/token?grant_type=password','POST',{email:m.accounts[0].email,password:m.accounts[0].password},s.ANON_KEY);
  for(const table of ['workspaces','robots','snapshots','runs','investigation_revisions']) {
    const rows=await remote(s,`/rest/v1/${table}?org_id=eq.${b}&select=*`,'GET',undefined,token.access_token);
    assert.deepEqual(rows,[],`RLS on ${table}`);
  }
  const runs=await remote(s,`/rest/v1/runs?org_id=eq.${a}&select=payload`,'GET',undefined,token.access_token);
  assert.deepEqual(runs.map(r=>r.payload).sort((x,y)=>x.id.localeCompare(y.id)),[...bundle.records.runs].sort((x,y)=>x.id.localeCompare(y.id)));
  const revisions=await remote(s,`/rest/v1/investigation_revisions?org_id=eq.${a}&select=payload`,'GET',undefined,token.access_token);
  assert.equal(revisions.length,bundle.investigations.length);
  const missing=sql(`select count(*) from public.runs r left join public.snapshots s on (r.org_id,r.snapshot_id,r.snapshot_revision,r.robot_id)=(s.org_id,s.id,s.revision,s.robot_id) where s.id is null;`).trim();
  assert.equal(missing,'0');
  for(const api of [owner,other,viewer]) await api('logout',{});
  console.log('PASS: real local Auth/PostgREST, save/relogin/reload/export, exact run payloads, relational references, investigation rows, two-organization RLS and viewer denial.');
  console.log('Verification appends one synthetic investigation; no records deleted.');
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { if(process.argv[2]==='seed') await seed(); else if(process.argv[2]==='verify') await verify(); else throw new Error('Use seed or verify.'); }
  catch(error) { console.error(error.message);process.exitCode=1; }
}
