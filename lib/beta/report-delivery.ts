import {lookup} from 'node:dns/promises';
import {request as httpsRequest} from 'node:https';
import {isIP} from 'node:net';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {unseal,type Sealed} from './connector-secrets.ts';
import {validatePublishedReport} from './reports.ts';

export function publicIPv4(address:string){
 if(isIP(address)!==4)return false;
 const [a,b,c]=address.split('.').map(Number);
 // Deny non-global ranges, documentation/benchmark ranges and multicast/reserved.
 return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2||b===88&&c===99))||(a===198&&(b===18||b===19||b===51&&c===100))||(a===203&&b===0&&c===113));
}
export function webhookURL(raw:unknown){
 if(typeof raw!=='string'||raw.length>1000)throw Error('Invalid webhook URL.');
 const url=new URL(raw),hosts=(process.env.REPORT_WEBHOOK_HOSTS??'').split(',').map(s=>s.trim()).filter(Boolean);
 if(url.protocol!=='https:'||url.port||url.username||url.password||url.search||url.hash||isIP(url.hostname)||!hosts.includes(url.hostname)||!url.hostname.includes('.')||url.hostname.endsWith('.'))throw Error('Use an operator-allowlisted HTTPS hostname on port 443 without credentials, query or fragment.');
 return url;
}
export async function resolveWebhook(raw:string,resolver:typeof lookup=lookup){
 const url=webhookURL(raw);let timer:ReturnType<typeof setTimeout>|undefined;
 const addresses=await Promise.race([resolver(url.hostname,{all:true}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('DNS deadline exceeded.')),3000);})]).finally(()=>clearTimeout(timer));
 if(!addresses.length||addresses.some(a=>a.family!==4||!publicIPv4(a.address)))throw Error('Destination must resolve only to public IPv4 addresses.');
 return {url,address:addresses[0].address};
}
export async function sendWebhook(raw:string,body:string,headers:Record<string,string>){
 const {url,address}=await resolveWebhook(raw);
 return new Promise<number>((resolve,reject)=>{
  const req=httpsRequest(url,{method:'POST',agent:false,family:4,servername:url.hostname,maxHeaderSize:8192,
   lookup:(_name,_options,callback)=>callback(null,address,4),
   headers:{...headers,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},response=>{
    let bytes=0;response.on('data',chunk=>{bytes+=chunk.length;if(bytes>16384)req.destroy(Error('Response too large.'));});
    response.on('end',()=>resolve(response.statusCode??0));response.on('error',()=>reject(Error('Delivery interrupted.')));
   });
  const timer=setTimeout(()=>req.destroy(Error('Delivery deadline exceeded.')),5000);
  req.on('close',()=>clearTimeout(timer));req.on('error',()=>reject(Error('Delivery unavailable.')));req.end(body);
 });
}
export function signature(secret:string,timestamp:string,eventId:string,body:string){return createHmac('sha256',secret).update('v1.'+timestamp+'.'+eventId+'.'+body).digest('hex');}
export function verifyReportWebhook(body:string,headers:Headers,secrets:string[],now=Date.now()){
 const timestamp=headers.get('x-tavrik-timestamp')??'',id=headers.get('x-tavrik-event-id')??'';
 if(!/^\d{10}$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300||! /^[a-f0-9-]{36}$/.test(id))return false;
 const signatures=(headers.get('x-tavrik-signature')??'').split(',');
 return secrets.some(secret=>signatures.some(s=>{if(!/^[a-f0-9]{64}$/.test(s))return false;return timingSafeEqual(Buffer.from(signature(secret,timestamp,id,body),'hex'),Buffer.from(s,'hex'));}));
}
type Command=(action:string,data:Record<string,unknown>)=>Promise<any>;
export async function reportWorkerStep(command:Command,send=sendWebhook){
 const job=await command('claim',{});if(!job)return {worked:false};if(job.skipped)return {worked:true};
 try{
  // Fresh access check and current endpoint/signing revision immediately before delivery.
  const delivery=await command('dispatch',{id:job.id,lease:job.lease});
  if(!delivery)return {worked:true};
  validatePublishedReport(delivery.report);
  const body=JSON.stringify({schema_version:1,event_id:delivery.event_id,event_type:delivery.event_type,report:delivery.report});
  if(Buffer.byteLength(body)>131072)throw Error('Report too large.');
  const secret=unseal<{active:string;previous:string|null;previous_until:number}>(delivery.secret as Sealed,'report:'+delivery.org_id+':'+delivery.endpoint_id);
  const timestamp=String(Math.floor(Date.now()/1000));
  const keys=[secret.active,...(secret.previous&&secret.previous_until>Date.now()?[secret.previous]:[])];
  const status=await send(delivery.url,body,{'X-Tavrik-Event-Id':delivery.event_id,'X-Tavrik-Timestamp':timestamp,'X-Tavrik-Signature':keys.map(k=>signature(k,timestamp,delivery.event_id,body)).join(',')});
  await command('finish',{id:job.id,lease:job.lease,delivered:status>=200&&status<300,status_code:status||null});
 }catch{
  // Lost responses are transport retries of the same delivery, never command execution.
  await command('finish',{id:job.id,lease:job.lease,delivered:false,status_code:null});
 }
 return {worked:true};
}
