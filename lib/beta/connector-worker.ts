import {onshapeId,ProviderError,useOnshape,type Command} from './onshape.ts';
// One bounded step. A scheduler/process repeatedly invokes this; a queue row alone
// never executes an operation. No physical execution is supported here.
export async function connectorWorkerStep(command:Command,fetcher:typeof fetch=fetch){
 const job=await command('claim_job',null,null,{});if(!job)return {worked:false};if(job.skipped)return {worked:true};
 let dispatched=false;
 const finish=(status:string,extra:Record<string,unknown>={})=>command('finish_job',job.org_id,null,{id:job.id,lease:job.lease,status,...extra});
 try{
  await useOnshape(command,fetcher,job.org_id,job.actor_id,job.connection_id,async(c,call)=>{
   if(job.status==='active'){
    const result=await call(`/api/v11/translations/${onshapeId(job.provider_id)}`);
    if(result.documentId!==c.document_id||result.id!==job.provider_id)throw Error('Translation scope mismatch.');
    const state=result.requestState;
    if(!['ACTIVE','DONE','FAILED'].includes(state))throw Error('Unknown translation state.');
    const output={state,externalDataIds:Array.isArray(result.resultExternalDataIds)?result.resultExternalDataIds.map(onshapeId):[]};
    await finish(state==='DONE'?'completed':state==='FAILED'?'failed':'active',{output});return;
   }
   const p=job.parameters;
   if(job.kind==='create_version'){
    if(!c.write_enabled)throw Error('Write is disabled.');
    const current=await call(`/api/v10/documents/d/${c.document_id}/w/${onshapeId(p.workspace_id)}/currentmicroversion`);
    if(current.microversion!==p.microversion_id){await finish('rejected',{output:{reason:'Workspace changed; review the new microversion.'}});return;}
    await command('dispatch_job',job.org_id,null,{id:job.id,lease:job.lease});dispatched=true;
    const result=await call(`/api/v10/documents/d/${c.document_id}/versions`,{documentId:c.document_id,workspaceId:p.workspace_id,microversionId:onshapeId(p.microversion_id),name:p.name,description:'UNIFY operation '+job.id});
    const id=onshapeId(result.id);
    if(result.microversion!==p.microversion_id){await finish('unknown',{provider_id:id,output:{reason:'Provider revision did not match the approved pin. Inspect in Onshape.'}});return;}
    await finish('completed',{provider_id:id,output:{versionId:id,microversionId:result.microversion}});
   }else if(job.kind==='export_step'){
    const current=await call(`/api/v10/documents/d/${c.document_id}/v/${onshapeId(p.version_id)}/currentmicroversion`);
    if(current.microversion!==p.microversion_id){await finish('rejected',{output:{reason:'Version pin mismatch.'}});return;}
    const elements=await call(`/api/v10/documents/d/${c.document_id}/m/${onshapeId(p.microversion_id)}/elements`);
    if(!Array.isArray(elements)||!elements.some(e=>e.id===p.element_id&&e.elementType==='PARTSTUDIO')){await finish('rejected',{output:{reason:'Only an authorized Part Studio version is supported.'}});return;}
    await command('dispatch_job',job.org_id,null,{id:job.id,lease:job.lease});dispatched=true;
    const result=await call(`/api/v11/partstudios/d/${c.document_id}/v/${p.version_id}/e/${onshapeId(p.element_id)}/export/step`,{storeInDocument:false});
    await finish('active',{provider_id:onshapeId(result.id),output:{state:'ACTIVE'}});
   }else await finish('rejected');
  });
 }catch(error){
  const definitive=error instanceof ProviderError&&!error.uncertain&&error.status>=400&&error.status<500;
  await finish(dispatched?(definitive?'failed':'unknown'):job.status==='active'?(job.attempts>=10?'unknown':'active'):(job.attempts>=10?'failed':'queued'),{output:{reason:dispatched?'Provider request ended without a verified completion.':'Connection unavailable; bounded retry or reconciliation required.'}});
 }
 return {worked:true};
}
