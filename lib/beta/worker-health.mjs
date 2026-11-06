import {mkdir,open,rename,unlink,realpath,readFile} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
export async function healthPath(raw){
 if(typeof raw!=='string'||!isAbsolute(raw))throw Error('Use an absolute private worker-health path.');
 const path=resolve(raw),parent=await realpath(dirname(path)),repo=await realpath(root);
 const rel=relative(repo,parent);
 if(!rel||(!rel.startsWith('..'+(process.platform==='win32'?'\\':'/'))&&!isAbsolute(rel)))throw Error('Worker health belongs outside the repository.');
 return resolve(parent,path.slice(dirname(path).length+1));
}
export async function writeHealth(path,state){
 const target=await healthPath(path),temporary=target+'.pending-'+randomUUID();
 let handle;
 try{handle=await open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify(state));await handle.sync();await handle.close();handle=null;await rename(temporary,target);}
 finally{await handle?.close();await unlink(temporary).catch(()=>{});}
}
export function assessHealth(state,{worker,now=Date.now(),maxAgeMs=60000,maxFailures=3}={}){
 const bad={healthy:false,reasons:['invalid_health_record']};
 if(!state||state.schema_version!==1||!['report','connector'].includes(state.worker)||worker&&state.worker!==worker||
    !['starting','idle','processed','error','stopped'].includes(state.state)||
    !Number.isSafeInteger(state.consecutive_failures)||state.consecutive_failures<0||
    !Number.isFinite(Date.parse(state.recorded_at))||!Number.isFinite(maxAgeMs)||maxAgeMs<1||!Number.isInteger(maxFailures)||maxFailures<1)return bad;
 const age=now-Date.parse(state.recorded_at),reasons=[];
 if(age<0)reasons.push('clock_inconsistent');
 if(age>maxAgeMs)reasons.push('heartbeat_stale');
 if(state.consecutive_failures>=maxFailures)reasons.push('repeated_step_failure');
 if(['starting','stopped'].includes(state.state))reasons.push('worker_not_running');
 return {healthy:reasons.length===0,reasons};
}
export async function readHealth(path,options){
 const target=await healthPath(path),handle=await open(target,'r');
 try{if((await handle.stat()).size>4096)throw Error('Health record too large.');return assessHealth(JSON.parse(await handle.readFile('utf8')),options);}finally{await handle.close();}
}

// The callback returns only whether it processed a step. No error object, job or URL is logged.
export async function runWorker({worker,step,once=false,path,shouldStop=()=>false,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now(),log=line=>console.log(line)}){
 if(!['report','connector'].includes(worker))throw Error('Invalid worker.');
 if(path)await healthPath(path);
 const state={schema_version:1,worker,instance_id:randomUUID(),state:'starting',recorded_at:new Date(now()).toISOString(),last_success_at:null,consecutive_failures:0,processed_steps:0};
 const emit=async()=>{state.recorded_at=new Date(now()).toISOString();if(path)await writeHealth(path,state);log(JSON.stringify(state));};
 await emit();
 let failed=false;
 do{
  try{const result=await step();state.state=result?.worked?'processed':'idle';state.consecutive_failures=0;state.last_success_at=new Date(now()).toISOString();if(result?.worked)state.processed_steps++;failed=false;}
  catch{state.state='error';state.consecutive_failures++;failed=true;}
  await emit();
  if(!once&&!shouldStop())await sleep(5000);
 }while(!once&&!shouldStop());
 // A scheduled --once run is judged by its completed step, not a persistent process heartbeat.
 if(!once){state.state='stopped';await emit();}
 return failed?1:0;
}
