import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boundedHistory,streamHistory} from '../../lib/beta/history.ts';
import {createHandler} from '../../lib/beta/server.ts';
import {demoRecords} from '../../lib/demo/fixtures.ts';
const bundle=()=>structuredClone({format:'unify-local',version:1,synthetic:true,records:demoRecords,corrections:[]});
test('bounded adapter never labels a truncated history complete; streaming stops on revocation',async()=>{
 const page=async({collection})=>({rows:collection==='robots'?Array.from({length:1001},(_,i)=>({key:String(i),revision:0,payload:{id:String(i)},submitted_version:1})):[],next:null,watermark:1});
 assert.equal(await boundedHistory(page,true,1),null);
 let calls=0;
 const stream=streamHistory(async()=>{if(++calls>1)throw Error('forbidden');return{rows:[],next:null,watermark:1};},true,1);
 const reader=stream.getReader();assert.match(new TextDecoder().decode((await reader.read()).value),/unify-history/);
 await assert.rejects(async()=>{while(!(await reader.read()).done){}},/Export interrupted/);
});
test('incremental application save fetches metadata only, validates input and uses verified actor',async()=>{
 Object.assign(process.env,{BETA_HISTORY_ENABLED:'true',BETA_ENABLED:'true',BETA_ORIGIN:'https://beta.example.invalid',SUPABASE_URL:'https://auth.example.invalid',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'private'});
 const org='00000000-0000-4000-8000-000000000001',actor='10000000-0000-4000-8000-000000000001',calls=[];
 const handle=createHandler(async(url,options)=>{calls.push({url,options});const path=new URL(url).pathname;
 if(path==='/auth/v1/user')return Response.json({id:actor});
 if(path==='/rest/v1/memberships')return Response.json([{role:'member'}]);
 if(path==='/rest/v1/workspaces'){assert.equal(new URL(url).searchParams.get('select'),'version,incremental');return Response.json([{version:2000,incremental:true}]);}
 if(path==='/rest/v1/rpc/append_records'){const data=JSON.parse(options.body);assert.equal(data.p_actor,actor);assert.equal(data.p_org,org);assert.equal(data.p_data.expected_version,undefined);return Response.json({version:2001});}
 throw Error('Unexpected call');});
 const request=b=>new Request(`https://beta.example.invalid/api/org/${org}/save`,{method:'POST',headers:{Origin:'https://beta.example.invalid',Cookie:'unify_session=test','Content-Type':'application/json'},body:JSON.stringify({bundle:b,expected_version:1,request_id:'one'})});
 assert.equal((await handle(request(bundle()))).status,200);
 assert.equal((await handle(request({}))).status,400);
 assert.equal(calls.filter(c=>c.url.includes('append_records')).length,1);
});
