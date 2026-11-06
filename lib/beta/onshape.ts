import {seal,unseal,type Sealed} from './connector-secrets.ts';
export const onshapeCapabilities={contractVersion:1,provider:'onshape',read:true,writeActions:['create_version'],asyncActions:['export_step'],robotExecution:false,simulation:false,webhooks:'signed-company-settings-or-polling'} as const;
export type Command=(action:string,org:string|null,actor:string|null,data:Record<string,unknown>)=>Promise<any>;
export type Tokens={access:string;refresh:string;expires:number};
export type Connection={org_id:string;id:string;project_id:string;robot_id:string;document_id:string;write_enabled:boolean;secret:Sealed;lease:string;revision:number};
export function onshapeId(value:unknown):string{if(typeof value!=='string'||!/^[a-f0-9]{24}$/.test(value))throw Error('Expected a 24-character Onshape ID.');return value;}
export function connectorText(value:unknown,max=120):string{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('Invalid connector text.');return value.trim();}
export function oauthConfig(){
 const client=process.env.ONSHAPE_CLIENT_ID,secret=process.env.ONSHAPE_CLIENT_SECRET,origin=process.env.BETA_ORIGIN;
 if(!client||!secret||!origin)throw Error('Register the Onshape OAuth application and configure its client ID/secret first.');
 const url=new URL(origin);
 if(url.origin!==origin||url.protocol!=='https:')throw Error('Onshape cloud OAuth requires the registered HTTPS beta origin.');
 return {client,secret,redirect:origin+'/api/onshape-callback'};
}
export class ProviderError extends Error{status:number;uncertain:boolean;constructor(status:number,uncertain=false){super(uncertain?'Provider outcome is unknown; do not repeat this operation.':`Onshape request rejected (${status}).`);this.status=status;this.uncertain=uncertain;}}
export async function providerJSON(fetcher:typeof fetch,url:string,init:RequestInit,write=false){
 let response:Response;
 try{response=await fetcher(url,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new ProviderError(503,write);}
 if(!response.ok)throw new ProviderError(response.status,write&&response.status>=500);
 if(!response.headers.get('content-type')?.includes('application/json'))throw new ProviderError(502,write);
 const reader=response.body?.getReader();if(!reader)throw new ProviderError(502,write);
 let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>2097152){await reader.cancel();throw Error('oversized');}chunks.push(item.value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
 catch{throw new ProviderError(502,write);}
}
export async function tokenExchange(fetcher:typeof fetch,params:Record<string,string>):Promise<Tokens>{
 const cfg=oauthConfig();
 const data=await providerJSON(fetcher,'https://oauth.onshape.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...params,client_id:cfg.client,client_secret:cfg.secret}).toString()},true);
 if(typeof data.access_token!=='string'||!data.access_token||typeof data.refresh_token!=='string'||!data.refresh_token||!Number.isFinite(data.expires_in)||data.expires_in<=0)throw new ProviderError(502,true);
 return {access:data.access_token,refresh:data.refresh_token,expires:Date.now()+Math.min(3600,data.expires_in)*1000};
}
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
export async function useOnshape<T>(command:Command,fetcher:typeof fetch,org:string,actor:string,connectionId:string,work:(c:Connection,call:(path:string,body?:unknown)=>Promise<any>)=>Promise<T>):Promise<T>{
 const c=await command('lease',org,actor,{connection_id:connectionId}) as Connection&{busy?:boolean;reconnect_required?:boolean};
 if(c.busy)throw Error('Connection busy. Retry after the current request finishes.');
 if(c.reconnect_required)throw Error('Reconnect Onshape: an earlier provider request was interrupted.');
 const context=org+':'+connectionId;
 try{
  let tokens=unseal<Tokens>(c.secret,context);
  const reserve=async()=>{for(let i=0;i<3;i++){const r=await command('reserve_call',org,actor,{connection_id:connectionId,lease:c.lease});if(r.reserved)return;await pause(Math.min(1100,Math.max(1,r.wait_ms??1000)));}throw Error('Provider rate limit; retry later.');};
  const refresh=async()=>{
   await reserve();
   try{tokens=await tokenExchange(fetcher,{grant_type:'refresh_token',refresh_token:tokens.refresh});}
   catch(error){await command('disconnect',org,actor,{connection_id:connectionId});throw error;}
   await command('rotate',org,actor,{connection_id:connectionId,lease:c.lease,secret:seal(tokens,context)});
  };
  if(tokens.expires<Date.now()+60000)await refresh();
  else if(c.secret.keyId!==process.env.CONNECTOR_ACTIVE_KEY)await command('rotate',org,actor,{connection_id:connectionId,lease:c.lease,secret:seal(tokens,context)});
  const call=async(path:string,body?:unknown)=>{
   if(!/^\/api\/v(?:10|11)\/[a-zA-Z0-9/?=&._-]+$/.test(path))throw Error('Unsupported provider path.');
   const write=body!==undefined;
   for(let i=0;i<3;i++){
    await reserve();
    try{return await providerJSON(fetcher,'https://cad.onshape.com'+path,{method:write?'POST':'GET',headers:{Authorization:'Bearer '+tokens.access,'Content-Type':'application/json'},...(write?{body:JSON.stringify(body)}:{})},write);}
    catch(error){
     if(error instanceof ProviderError&&error.status===401&&!write&&i===0){await refresh();continue;}
     if(!write&&error instanceof ProviderError&&(error.status===429||error.status>=500)&&i<2){await pause(500*(2**i));continue;}
     throw error;
    }
   }throw Error('Provider retry limit reached.');
  };
  return await work(c,call);
 }finally{try{await command('release',org,actor,{connection_id:connectionId,lease:c.lease});}catch{/* Revocation or an expired lease must never be restored. */}}
}
export type CadReference={provider:'onshape';documentId:string;elementId:string;microversionId:string;versionId:string|null;name:string;capturedAt:string;url:string;installation:'not_verified'};
export async function captureReference(c:Connection,call:(path:string)=>Promise<any>,input:Record<string,unknown>):Promise<CadReference>{
 const kind=input.kind;if(!['w','v','m'].includes(String(kind)))throw Error('Choose workspace, version or microversion.');
 const reference=onshapeId(input.reference_id),element=onshapeId(input.element_id);
 const microversion=kind==='m'?reference:onshapeId((await call(`/api/v10/documents/d/${c.document_id}/${kind}/${reference}/currentmicroversion`)).microversion);
 const elements=await call(`/api/v10/documents/d/${c.document_id}/m/${microversion}/elements`);
 if(!Array.isArray(elements))throw Error('Invalid Onshape element response.');
 const selected=elements.find(e=>e.id===element);if(!selected)throw Error('The selected element is unavailable in this exact revision.');
 return {provider:'onshape',documentId:c.document_id,elementId:element,microversionId:microversion,versionId:kind==='v'?reference:null,name:connectorText(selected.name),capturedAt:new Date().toISOString().replace(/\.\d{3}Z$/,'Z'),url:`https://cad.onshape.com/documents/${c.document_id}/m/${microversion}/e/${element}`,installation:'not_verified'};
}
