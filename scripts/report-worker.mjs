import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {reportWorkerStep} from '../lib/beta/report-delivery.ts';
import {runWorker} from '../lib/beta/worker-health.mjs';
try{for(const [key,value]of Object.entries(parseEnv(readFileSync('beta/.env.local','utf8'))))process.env[key]??=value;}catch{}
if(process.env.BETA_REPORTS_ENABLED!=='true')throw Error('Reports must be activated before running the worker.');
const base=new URL(process.env.SUPABASE_URL),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(base.protocol!=='https:'||!key)throw Error('Worker configuration unavailable.');
const command=async(action,data)=>{
 const r=await fetch(base.origin+'/rest/v1/rpc/report_worker',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_action:action,p_data:data}),redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Worker database unavailable.');return r.json();
};
let stopping=false;process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
process.exitCode=await runWorker({worker:'report',step:()=>reportWorkerStep(command),once:process.argv.includes('--once'),path:process.env.WORKER_HEALTH_PATH,shouldStop:()=>stopping});
