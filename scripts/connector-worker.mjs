import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {connectorWorkerStep} from '../lib/beta/connector-worker.ts';
import {connectorCommand} from '../lib/beta/connectors.ts';
import {runWorker} from '../lib/beta/worker-health.mjs';
// Local development only; deployed workers receive these through a secret manager.
try{for(const [key,value]of Object.entries(parseEnv(readFileSync('beta/.env.local','utf8'))))process.env[key]??=value;}catch{}
if(process.env.BETA_CONNECTORS_ENABLED!=='true')throw Error('Connectors must be activated before starting a worker.');
const base=new URL(process.env.SUPABASE_URL),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(base.protocol!=='https:'||!key)throw Error('Worker database configuration is missing.');
const remote=async(path,method='GET',body)=>{
 const r=await fetch(base.origin+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Worker database request failed ('+r.status+').');return r.json();
};
let stopping=false;process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
process.exitCode=await runWorker({worker:'connector',step:()=>connectorWorkerStep(connectorCommand(remote)),once:process.argv.includes('--once'),path:process.env.WORKER_HEALTH_PATH,shouldStop:()=>stopping});
