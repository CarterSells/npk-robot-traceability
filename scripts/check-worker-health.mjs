import {readHealth} from '../lib/beta/worker-health.mjs';
try{
 const [worker,path]=process.argv.slice(2);
 if(!['report','connector'].includes(worker)||!path||process.argv.length!==4)throw Error('Invalid invocation.');
 const result=await readHealth(path,{worker});
 console.log(JSON.stringify(result));process.exitCode=result.healthy?0:1;
}catch{console.log(JSON.stringify({healthy:false,reasons:['health_unavailable']}));process.exitCode=1;}
