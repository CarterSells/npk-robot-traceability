import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,unlink,rmdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {runWorker,readHealth,assessHealth,healthPath} from '../../lib/beta/worker-health.mjs';

test('worker records redacted failures, recovers, stops and detects stale heartbeats',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'tavrik-health-')),path=join(directory,'report.json'),logs=[];
 let time=Date.now(),calls=0;
 try{
  const code=await runWorker({worker:'report',path,log:s=>logs.push(JSON.parse(s)),now:()=>time,shouldStop:()=>calls===4,sleep:async()=>{time+=5000;},step:async()=>{calls++;if(calls<=3)throw Error('secret provider content');return {worked:true,private:'ignored'};}});
  assert.equal(code,0);assert.equal(logs.at(-1).state,'stopped');assert.equal(logs.at(-1).consecutive_failures,0);
  assert.equal(logs.at(-1).processed_steps,1);assert.equal(JSON.stringify(logs).includes('secret'),false);assert.equal(JSON.stringify(logs).includes('private'),false);
  assert.deepEqual(assessHealth(logs[3],{now:time}).reasons,['repeated_step_failure']);
  assert.equal((await readHealth(path,{worker:'report',now:time})).healthy,false);
  await runWorker({worker:'report',path,once:true,step:async()=>({worked:false}),log:()=>{},now:()=>time});
  assert.equal((await readHealth(path,{worker:'report',now:time})).healthy,true);
  assert.deepEqual((await readHealth(path,{worker:'report',now:time+61000})).reasons,['heartbeat_stale']);
  assert.equal((await readHealth(path,{worker:'connector',now:time})).healthy,false);
  assert.equal((await readHealth(path,{worker:'report',now:time-1})).healthy,false);
  assert.notEqual(JSON.parse(await readFile(path,'utf8')).instance_id,logs[0].instance_id);
  assert.equal(await runWorker({worker:'report',once:true,step:async()=>{throw Error('secret');},log:()=>{}}),1);
  await assert.rejects(healthPath(resolve('.cache/health.json')));
 }finally{await unlink(path);await rmdir(directory);}
});
