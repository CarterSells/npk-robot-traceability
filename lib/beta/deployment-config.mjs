import {isIP} from 'node:net';

const flags=['BETA_ENABLED','BETA_HISTORY_ENABLED','BETA_AUTH_LIFECYCLE','BETA_GOOGLE_ENABLED','BETA_PROJECTS_ENABLED','BETA_MACHINES_ENABLED','BETA_LIFECYCLE_ENABLED','BETA_PORTAL_ENABLED','BETA_COMMANDS_ENABLED','BETA_REPORTS_ENABLED','BETA_CONNECTORS_ENABLED'];
function hostname(value){return typeof value==='string'&&value.length<=253&&value.includes('.')&&!isIP(value)&&!/(^|\.)(localhost|local|invalid|test|example)$/.test(value)&&value.split('.').every(s=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s));}
function origin(value){try{const u=new URL(value);return u.origin===value&&u.protocol==='https:'&&hostname(u.hostname)&&!u.port&&!u.username&&!u.password;}catch{return false;}}
function keyRing(env){
 try{const values=JSON.parse(env.CONNECTOR_KEYS);return values&&typeof values==='object'&&!Array.isArray(values)&&Object.keys(values).length>0&&Object.hasOwn(values,env.CONNECTOR_ACTIVE_KEY)&&Object.entries(values).every(([id,key])=>/^[a-zA-Z0-9_-]{1,32}$/.test(id)&&typeof key==='string'&&/^[a-f0-9]{64}$/.test(key));}catch{return false;}
}
export function checkDeploymentConfig(env,mode='app'){
 if(!['app','report-worker','connector-worker'].includes(mode))throw Error('Choose app, report-worker or connector-worker.');
 const errors=[],notes=[],enabled=name=>env[name]==='true',need=(condition,message)=>{if(!condition)errors.push(message);};
 for(const flag of flags)if(env[flag]!==undefined)need(['true','false'].includes(env[flag]),flag+' must be true or false.');
 need(origin(env.SUPABASE_URL),'SUPABASE_URL must be an exact HTTPS DNS origin for the intended hosted project.');
 need(typeof env.SUPABASE_SERVICE_ROLE_KEY==='string'&&env.SUPABASE_SERVICE_ROLE_KEY.trim().length>0,'SUPABASE_SERVICE_ROLE_KEY is missing.');
 // Values and dynamic environment names must never appear in output.
 const privateNames=['SUPABASE_SERVICE_ROLE_KEY','ONSHAPE_CLIENT_SECRET','CONNECTOR_KEYS','ONSHAPE_WEBHOOK_KEYS'];
 const privateValues=privateNames.map(k=>env[k]).filter(v=>typeof v==='string'&&v.length>0);
 need(!Object.entries(env).some(([key,value])=>key.startsWith('NEXT_PUBLIC_')&&(privateValues.includes(value)||/SERVICE_ROLE|SECRET|CONNECTOR_KEYS|WEBHOOK_KEYS/.test(key))),'A private setting appears in NEXT_PUBLIC_ configuration; remove it and rotate any exposed secret.');
 const dependencies=[
  ['BETA_GOOGLE_ENABLED','BETA_AUTH_LIFECYCLE'],
  ['BETA_LIFECYCLE_ENABLED','BETA_MACHINES_ENABLED'],
  ['BETA_PORTAL_ENABLED','BETA_PROJECTS_ENABLED'],
  ['BETA_PORTAL_ENABLED','BETA_LIFECYCLE_ENABLED'],
  ['BETA_COMMANDS_ENABLED','BETA_MACHINES_ENABLED'],
  ['BETA_REPORTS_ENABLED','BETA_PROJECTS_ENABLED'],
  ['BETA_REPORTS_ENABLED','BETA_LIFECYCLE_ENABLED'],
 ];
 for(const [feature,dependency] of dependencies)if(enabled(feature))need(enabled(dependency),feature+' requires '+dependency+'.');
 if(mode==='app'){
  need(enabled('BETA_ENABLED'),'BETA_ENABLED must be true for an active beta deployment.');
  need(enabled('BETA_AUTH_LIFECYCLE'),'BETA_AUTH_LIFECYCLE must be true for this deployment profile.');
  need(origin(env.BETA_ORIGIN),'BETA_ORIGIN must be the exact HTTPS deployment origin, without path or trailing slash.');
  need(typeof env.SUPABASE_ANON_KEY==='string'&&env.SUPABASE_ANON_KEY.trim().length>0,'SUPABASE_ANON_KEY is missing.');
  need(!env.SUPABASE_ANON_KEY||env.SUPABASE_ANON_KEY!==env.SUPABASE_SERVICE_ROLE_KEY,'Public and privileged database credentials must differ.');
  if(enabled('BETA_REPORTS_ENABLED'))notes.push('Publication can run without a delivery worker; verify report-worker configuration separately.');
 }else need(enabled(mode==='report-worker'?'BETA_REPORTS_ENABLED':'BETA_CONNECTORS_ENABLED'),'Enable the matching worker feature only after schema and synthetic acceptance.');
 if(mode==='connector-worker'||mode==='app'&&enabled('BETA_CONNECTORS_ENABLED')){
  need(Boolean(env.ONSHAPE_CLIENT_ID?.trim())&&Boolean(env.ONSHAPE_CLIENT_SECRET?.trim()),'Onshape client ID and secret are required for enabled connector operations.');
  need(keyRing(env),'Configure a valid CONNECTOR_KEYS ring and CONNECTOR_ACTIVE_KEY for connectors.');
 }
 if(mode==='report-worker'){
  need(keyRing(env),'Configure a valid CONNECTOR_KEYS ring and CONNECTOR_ACTIVE_KEY for report signing secrets.');
  const hosts=(env.REPORT_WEBHOOK_HOSTS??'').split(',').map(s=>s.trim()).filter(Boolean);
  need(hosts.length>0&&hosts.every(hostname),'REPORT_WEBHOOK_HOSTS must contain approved DNS hostnames; empty means delivery is blocked.');
 }
 if(enabled('BETA_GOOGLE_ENABLED'))notes.push('Google provider settings, redirects, consent and actual sign-in are not checked.');
 if(enabled('BETA_COMMANDS_ENABLED'))notes.push('Only simulation.check is supported; configuration does not authorize physical execution.');
 return {mode,configuration_valid:errors.length===0,release_verified:false,errors,notes,unverified:['Credential validity and project identity','Installed migrations and feature acceptance','Deployed authorization and TLS/proxy behavior','Worker scheduling, receiver ownership and network egress','Isolated managed recovery and deletion reconciliation','Load, retention, alerting and customer-hosting gates']};
}
