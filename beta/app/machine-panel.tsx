'use client';
import {useEffect,useState} from 'react';
type Identity={id:string;name:string;kind:string;project_id:string;robot_id:string;capabilities:string[];revoked_at:string|null;per_minute:number;last_seen_at:string|null;last_ingested_at:string|null;last_error:string|null;accepted_count:number;duplicate_count:number;rejected_count:number};
type Credential={id:string;machine_id:string;expires_at:string;revoked_at:string|null;last_used_at:string|null};
type Scope={project_id:string;robot_id:string;project_name:string};
type Data={identities:Identity[];credentials:Credential[];scopes:Scope[]};
export default function MachinePanel({org,api}:{org:string;api:(path:string,body?:unknown)=>Promise<any>}){
 const [data,setData]=useState<Data>({identities:[],credentials:[],scopes:[]});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[secret,setSecret]=useState(''),[message,setMessage]=useState(''),[updated,setUpdated]=useState('');
 async function reload(){const result=await api(`org/${org}/machines`);setData(result);setUpdated(new Date().toISOString());}
 useEffect(()=>{let active=true;void api(`org/${org}/machines`).then(result=>{if(active){setData(result);setUpdated(new Date().toISOString());}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[org]);
 async function action(body?:Record<string,unknown>){setBusy(true);setError('');setMessage('');if(body)setSecret('');try{if(body){const result=await api(`org/${org}/machines`,body);if(result.token)setSecret(result.token);setMessage(result.id?`Identity ${result.id}. Save the token securely before leaving this screen.`:'Access revoked for subsequent requests.');}await reload();}catch(e){setError(e instanceof Error?e.message:'Machine access unavailable.');}finally{setBusy(false);}}
 return <section aria-label="Machine identities"><details><summary>Machine identities and ingestion</summary>
 <p>Scoped metadata uploads for collectors, gateways and API clients. These credentials cannot execute robot jobs or read internal records.</p>
 <button disabled={busy} onClick={()=>void action()}>Refresh ingestion health</button>
 <p>Last refreshed: {updated||'Not loaded'}. Last seen means an authenticated request reached Tavrik; silence does not prove a device failed.</p>
 {!data.scopes.length&&<p>Assign a saved robot to a project under Teams, clients and project access before issuing an identity.</p>}
 <form onSubmit={e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));const scope=data.scopes[Number(d.scope)];if(scope)void action({...d,action:'create',project_id:scope.project_id,robot_id:scope.robot_id});}}>
 <label>Identity name<input name="name" required maxLength={120}/></label>
 <label>Identity kind<select name="kind"><option value="collector">Collector</option><option value="gateway">Robot gateway</option><option value="api_client">External API client</option></select></label>
 <label>Project and robot scope<select name="scope" required>{data.scopes.map((s,i)=><option key={s.project_id+':'+s.robot_id} value={i}>{s.project_name} / {s.robot_id}</option>)}</select></label>
 <label>Capability<select name="capability"><option value="events:write">Submit run metadata and check own receipts</option><option value="receipts:read">Check own receipts only</option></select></label>
 <label>Expires in days<input name="expires_days" type="number" min={1} max={90} defaultValue={30} required/></label>
 <label>Requests per minute<input name="per_minute" type="number" min={1} max={600} defaultValue={60} required/></label>
 <button disabled={busy||!data.scopes.length}>Create machine identity</button></form>
 {secret&&<div><label>Machine token — copy now<textarea readOnly value={secret} rows={3}/></label><button onClick={()=>setSecret('')}>Hide machine token</button></div>}
 {data.identities.map(m=><article key={m.id}><h3>{m.name}</h3><p>{m.kind} · {m.robot_id} · {m.revoked_at?'Revoked':'Issued'} · {m.per_minute} requests/minute</p><p>Source identity: <code>{m.id}</code></p><p>Capabilities: {m.capabilities.join(', ')}</p>
 <p>Last seen: {m.last_seen_at||'No authenticated request recorded'}. Last saved event: {m.last_ingested_at||'None recorded'}.</p>
 <p>Accepted: {m.accepted_count}; duplicate deliveries: {m.duplicate_count}; rejected at storage: {m.rejected_count}. {m.last_error&&`Last storage result: ${m.last_error}.`}</p>
 {!m.revoked_at&&<><form onSubmit={e=>{e.preventDefault();void action({...Object.fromEntries(new FormData(e.currentTarget)),action:'rotate',id:m.id});}}><label>New credential lifetime (days)<input name="expires_days" type="number" min={1} max={90} defaultValue={30} required/></label><label>Old credential overlap (minutes)<input name="overlap_minutes" type="number" min={0} max={60} defaultValue={10} required/></label><button disabled={busy}>Rotate credential for {m.name}</button></form><button disabled={busy} onClick={()=>void action({action:'revoke',id:m.id})}>Revoke identity {m.name}</button></>}
 {data.credentials.filter(c=>c.machine_id===m.id).map(c=><p key={c.id}>Credential {c.id}: {c.revoked_at?'Revoked':`expires ${c.expires_at}`}. Last used: {c.last_used_at||'Not recorded'}. <button disabled={busy||!!c.revoked_at} onClick={()=>void action({action:'revoke_token',id:c.id})}>Revoke credential {c.id}</button></p>)}
 </article>)}
 {busy&&<p role="status">Saving or refreshing…</p>}{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
 <p>Counts cover authenticated storage operations. Invalid envelopes, unauthenticated traffic and network outages are not counted here. Refresh to see new activity.</p>
 </details></section>;
}
