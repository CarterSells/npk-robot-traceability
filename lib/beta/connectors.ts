import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {cookie,cookieValue,claims,type Remote} from './auth.ts';
import {seal,unseal,verifyOnshapeWebhook,type Sealed} from './connector-secrets.ts';
import {captureReference,connectorText,onshapeCapabilities,onshapeId,oauthConfig,tokenExchange,useOnshape,type CadReference,type Command} from './onshape.ts';
import {parseBundle,type Bundle} from '../local/records.ts';
import type {Snapshot} from '../demo/records.ts';
const digest=(x:string)=>createHash('sha256').update(x).digest('hex');
const uuid=(x:unknown)=>{if(typeof x!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(x))throw Error('Invalid connector identifier.');return x;};
const localId=(x:unknown)=>{const s=connectorText(x);if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(s))throw Error('Invalid record identifier.');return s;};
export const connectorCommand=(remote:Remote):Command=>(action,org,actor,data)=>remote('/rest/v1/rpc/integration_command','POST',{p_action:action,p_org:org,p_actor:actor,p_data:data});
type Config={origin:string;url:string;key:string;service:string};
const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
type OAuthBinding={state:string;binding:string;revision:number;expires:number};
export async function onshapeCallback(request:Request,cfg:Config,remote:Remote,fetcher:typeof fetch){
 const headers=new Headers({'Location':cfg.origin+'/?integration=failed','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Set-Cookie':cookie(cfg,'unify_onshape','',0,true)});
 try{
  const value=cookieValue(request,'unify_onshape');if(!value||value.length>4096)throw Error('Missing connection state.');
  const binding=unseal<OAuthBinding>(JSON.parse(Buffer.from(value,'base64url').toString()),'oauth');
  const query=new URL(request.url).searchParams;
  if(binding.expires<Date.now()||query.get('state')!==binding.state||query.has('error'))throw Error('Invalid connection state.');
  const command=connectorCommand(remote),state=await command('consume_oauth',null,null,{state_hash:digest(binding.state),binding_hash:digest(binding.binding)});
  const tokens=await tokenExchange(fetcher,{grant_type:'authorization_code',code:connectorText(query.get('code'),2048),redirect_uri:oauthConfig().redirect});
  await command('activate',state.org_id,state.actor_id,{connection_id:state.connection_id,revision:binding.revision,session_id:state.session_id,secret:seal(tokens,state.org_id+':'+state.connection_id)});
  headers.set('Location',cfg.origin+'/?integration=connected');
 }catch{/* Never return provider bodies, codes, keys or encrypted secrets. */}
 return new Response(null,{status:303,headers});
}
export function cadBundle(base:Snapshot,robot:Bundle['records']['robots'][number],reference:CadReference,component:string,requestId:string,synthetic:boolean,actor:string):Bundle{
 const snapshot:Snapshot={...structuredClone(base),id:'cad-'+uuid(requestId),revision:1,schemaVersion:2};
 const fieldId='cad-'+digest(component).slice(0,16);
 snapshot.custom=[...(snapshot.custom??[]).filter(f=>f.id!==fieldId),{
  id:fieldId,component,name:'Onshape exact design reference',type:'text',unit:'',category:'configuration',value:{state:'known',value:reference.url},
  provenance:{source:'Onshape API',method:'API design metadata; physical installation not verified',author:actor,observedAt:reference.capturedAt,recordedAt:reference.capturedAt,evidence:reference.url,available:true},
 }];
 return parseBundle(JSON.stringify({format:'unify-local',version:2,synthetic,records:{robots:[robot],snapshots:[snapshot],runs:[]},corrections:[]}));
}
export async function connectorRoute(request:Request,cfg:Config,remote:Remote,fetcher:typeof fetch,org:string,actor:string,token:string,data:Record<string,unknown>,read:(table:string,query:string)=>Promise<any>){
 const command=connectorCommand(remote),action=request.method==='GET'?'list':data.action;
 if(action==='list')return response({...await command('list',org,actor,{}),capabilities:onshapeCapabilities,configured:!!process.env.ONSHAPE_CLIENT_ID&&!!process.env.ONSHAPE_CLIENT_SECRET&&!!process.env.CONNECTOR_KEYS});
 if(action==='create'){
  const id=randomUUID();return response(await command('create',org,actor,{id,project_id:uuid(data.project_id),robot_id:localId(data.robot_id),document_id:onshapeId(data.document_id),write_enabled:data.write_enabled===true}));
 }
 const connectionId=uuid(data.connection_id);
 if(action==='authorize'){
  const provider=oauthConfig(),state=randomBytes(32).toString('base64url'),binding=randomBytes(32).toString('base64url');
  const metadata=await command('begin_oauth',org,actor,{connection_id:connectionId,state_hash:digest(state),binding_hash:digest(binding),session_id:uuid(claims(token).session_id)});
  const url=new URL('https://oauth.onshape.com/oauth/authorize');url.search=new URLSearchParams({response_type:'code',client_id:provider.client,redirect_uri:provider.redirect,state,scope:metadata.write_enabled?'OAuth2Read OAuth2Write':'OAuth2Read'}).toString();
  const result=response({url:url.href});result.headers.set('Set-Cookie',cookie(cfg,'unify_onshape',Buffer.from(JSON.stringify(seal({state,binding,revision:metadata.revision,expires:Date.now()+600000},'oauth'))).toString('base64url'),600,true));return result;
 }
 if(action==='disconnect')return response(await command('disconnect',org,actor,{connection_id:connectionId}));
 if(action==='discover')return response(await useOnshape(command,fetcher,org,actor,connectionId,async(c,call)=>{
  const offset=Number(data.offset??0);if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw Error('Invalid version page.');
  const versions=await call(`/api/v10/documents/d/${c.document_id}/versions?offset=${offset}&limit=25`);
  if(!Array.isArray(versions))throw Error('Invalid version response.');
  return {versions:versions.map(v=>({id:onshapeId(v.id),name:connectorText(v.name),microversionId:onshapeId(v.microversion)})),next:versions.length===25?offset+25:null};
 }));
 if(action==='preview')return response(await useOnshape(command,fetcher,org,actor,connectionId,async(c,call)=>{
  const reference=await captureReference(c,call,data),component=connectorText(data.component);
  return {reference,ticket:seal({reference,component,actor,connectionId,robotId:c.robot_id,expires:Date.now()+600000},'preview:'+org)};
 }));
 if(action==='import'){
  if(data.approved!==true)throw Error('Review and approve the exact reference first.');
  const ticket=unseal<{reference:CadReference;component:string;actor:string;connectionId:string;robotId:string;expires:number}>(data.ticket as Sealed,'preview:'+org);
  if(ticket.actor!==actor||ticket.connectionId!==connectionId||ticket.expires<Date.now())throw Error('Reference preview expired; preview again.');
  // Reauthorize the connection and provider grant before persisting the reviewed pin.
  return response(await useOnshape(command,fetcher,org,actor,connectionId,async(c,call)=>{
   await captureReference(c,call,{kind:'m',reference_id:ticket.reference.microversionId,element_id:ticket.reference.elementId});
   const snapshotId=localId(data.snapshot_id),revision=Number(data.snapshot_revision);
   if(!Number.isSafeInteger(revision)||revision<1)throw Error('Invalid snapshot revision.');
   const [base]=await read('snapshots',`org_id=eq.${org}&id=eq.${snapshotId}&revision=eq.${revision}&select=payload`);
   const [robot]=await read('robots',`org_id=eq.${org}&id=eq.${encodeURIComponent(c.robot_id)}&select=payload`);
   const [state]=await read('workspaces',`org_id=eq.${org}&select=history_synthetic,bundle`);
   if(!base||!robot||base.payload.robotId!==c.robot_id)throw Error('Choose a saved snapshot for the connected robot.');
   const synthetic=state.history_synthetic??state.bundle.synthetic;
   if(data.synthetic!==synthetic)throw Error('Confirm whether this is a synthetic test document or real evidence.');
   const requestId=uuid(data.request_id),bundle=cadBundle(base.payload,robot.payload,ticket.reference,ticket.component,requestId,synthetic,actor);
   const result=await command('import',org,actor,{connection_id:connectionId,lease:c.lease,capture:{bundle,request_id:requestId,body_hash:digest(JSON.stringify(bundle))}});
   return {saved:result,snapshot_id:bundle.records.snapshots[0].id,revision:1};
  }));
 }
 if(action==='enqueue'){
  if(data.approved!==true)throw Error('Explicit approval is required for this provider operation.');
  const kind=data.kind;let parameters;
  if(kind==='create_version')parameters={workspace_id:onshapeId(data.workspace_id),microversion_id:onshapeId(data.microversion_id),name:connectorText(data.name)};
  else if(kind==='export_step')parameters={version_id:onshapeId(data.version_id),element_id:onshapeId(data.element_id),microversion_id:onshapeId(data.microversion_id)};
  else throw Error('Unsupported connector action.');
  return response(await command('enqueue',org,actor,{connection_id:connectionId,id:uuid(data.request_id),kind,parameters,body_hash:digest(JSON.stringify({kind,parameters}))}));
 }
 if(action==='reconcile')return response(await useOnshape(command,fetcher,org,actor,connectionId,async(c,call)=>{
  const jobId=uuid(data.request_id),providerId=onshapeId(data.provider_id);
  const [job]=await remote(`/rest/v1/integration_jobs?org_id=eq.${org}&id=eq.${jobId}&connection_id=eq.${connectionId}&select=kind,parameters,status`);
  if(!job||job.status!=='unknown')throw Error('Only an uncertain operation can be reconciled.');
  const p=job.parameters;let status:string,output;
  if(job.kind==='create_version'){
   const result=await call(`/api/v10/documents/d/${c.document_id}/versions/${providerId}`);
   if(result.id!==providerId||result.microversion!==p.microversion_id||result.description!=='UNIFY operation '+jobId)throw Error('Provider version does not match this exact operation.');
   status='completed';output={versionId:providerId,microversionId:p.microversion_id,reconciled:true};
  }else{
   const result=await call(`/api/v11/translations/${providerId}`);
   if(result.documentId!==c.document_id||result.versionId!==p.version_id||result.requestElementId!==p.element_id||!['ACTIVE','DONE','FAILED'].includes(result.requestState))throw Error('Provider translation does not match the approved version and element.');
   status=result.requestState==='DONE'?'completed':result.requestState==='FAILED'?'failed':'active';output={state:result.requestState,reconciled:true};
  }
  return command('reconcile',org,actor,{connection_id:connectionId,id:jobId,provider_id:providerId,status,output});
 }));
 throw Error('Unsupported connector operation.');
}
// Only signed notifications from configured company settings are accepted.
// Notifications are hints; metadata is always reconciled through authorized API reads.
export async function onshapeNotification(request:Request,remote:Remote,raw:string){
 const keyText=process.env.ONSHAPE_WEBHOOK_KEYS;if(!keyText||!verifyOnshapeWebhook(raw,request.headers,JSON.parse(keyText)))return response({error:'Webhook authentication failed.'},401);
 const body=JSON.parse(raw);const org=uuid(new URL(request.url).searchParams.get('org')),connectionId=uuid(new URL(request.url).searchParams.get('connection'));
 const rows=await remote(`/rest/v1/integration_connections?org_id=eq.${org}&id=eq.${connectionId}&select=document_id,created_by,status`);
 if(!rows[0]||rows[0].status!=='connected'||body.documentId!==rows[0].document_id)return response({error:'Webhook scope denied.'},403);
 if(!['webhook.register','webhook.ping','onshape.model.lifecycle.changed','onshape.model.lifecycle.createversion','onshape.model.translation.complete'].includes(body.event))return response({ignored:true});
 return response(await connectorCommand(remote)('notification',org,rows[0].created_by,{connection_id:connectionId,message_id:onshapeId(body.messageId),body_hash:digest(raw)}));
}
