import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createHandler} from '../../lib/beta/server.ts';
import {portalStream} from '../../lib/beta/portal-stream.ts';
test('subscription sends only watermarks, stops after revoked access and cancels cleanly',async()=>{
 let count=0;
 const reader=portalStream(async()=>{if(++count>1)throw Error('revoked');return '1:2';},new AbortController().signal,1).getReader();
 const decode=x=>new TextDecoder().decode(x.value);
 assert.match(decode(await reader.read()),/event: checked/);
 assert.match(decode(await reader.read()),/event: unavailable/);
 assert.equal((await reader.read()).done,true);
 const controller=new AbortController();let calls=0;
 const cancelled=portalStream(async()=>{calls++;return '0:0';},controller.signal,1).getReader();
 await cancelled.read();await cancelled.cancel();const before=calls;
 await new Promise(resolve=>setTimeout(resolve,10));assert.equal(calls,before);
 const abort=new AbortController();let release;
 const inflight=portalStream(()=>new Promise(resolve=>{release=resolve;}),abort.signal,1).getReader();
 const pending=inflight.read();await new Promise(resolve=>setTimeout(resolve,0));abort.abort();release('0:0');
 assert.equal((await pending).done,true);
});
test('subscription denies an unauthorized project before returning any events',async()=>{
 Object.assign(process.env,{BETA_ENABLED:'true',BETA_AUTH_LIFECYCLE:'false',BETA_PORTAL_ENABLED:'true',BETA_ORIGIN:'https://beta.example.invalid',SUPABASE_URL:'https://db.example.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'server'});
 const handle=createHandler(async url=>new URL(url).pathname==='/auth/v1/user'?Response.json({id:randomUUID()}):Response.json([]));
 const response=await handle(new Request(`https://beta.example.invalid/api/client-updates/${randomUUID()}/${randomUUID()}`,{headers:{Cookie:'unify_session=test'}}));
 assert.equal(response.status,403);assert.match(await response.text(),/Project access denied/);
});
test('portal pagination uses only published columns and rechecks project access each request',async()=>{
 Object.assign(process.env,{BETA_ENABLED:'true',BETA_AUTH_LIFECYCLE:'false',BETA_PORTAL_ENABLED:'true',BETA_ORIGIN:'https://beta.example.invalid',SUPABASE_URL:'https://db.example.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'server'});
 const org=randomUUID(),project=randomUUID(),user=randomUUID();let granted=true,queries=[];
 const handle=createHandler(async(url)=>{const u=new URL(url);
  if(u.pathname==='/auth/v1/user')return Response.json({id:user,email:'synthetic@example.invalid'});
  if(u.pathname==='/rest/v1/projects')return Response.json(granted?[{id:project,name:'Synthetic'}]:[]);
  if(u.pathname==='/rest/v1/shared_execution_summaries'){queries.push(u.searchParams);return Response.json(Array.from({length:25},(_,i)=>({publication_id:50-i,revision:1,payload:{outcome:'unknown'},published_at:'2026-10-25T00:00:00Z'})));}
  throw Error('Unexpected endpoint');
 });
 const request=(after='0')=>new Request(`https://beta.example.invalid/api/client-executions/${org}/${project}?after=${after}`,{headers:{Cookie:'unify_session=test'}});
 const first=await handle(request());assert.equal(first.status,200);assert.equal((await first.json()).next,26);
 assert.equal(queries[0].get('select'),'publication_id,revision,payload,published_at');assert.equal(queries[0].get('order'),'publication_id.desc');
 await handle(request('26'));assert.equal(queries[1].get('publication_id'),'lt.26');
 granted=false;assert.equal((await handle(request('26'))).status,403);assert.equal(queries.length,2);
});
