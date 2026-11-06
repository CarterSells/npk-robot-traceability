import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
type Config = { origin: string; url: string; key: string; service: string };
export type Remote = (route: string, method?: string, body?: unknown, token?: string, key?: string) => Promise<any>;
export function cookieValue(request: Request, name: string): string {
  const item=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));
  try{return item?decodeURIComponent(item.slice(name.length+1)):'';}catch{return '';}
}
export function cookie(cfg: Config,name: string,value: string,age: number,lax=false){return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=${lax?'Lax':'Strict'}; Max-Age=${age}${cfg.origin.startsWith('https:')?'; Secure':''}`;}
export function claims(access: string): { sub?: string; session_id?: string; exp?: number; amr?: {method: string;timestamp: number}[] } {
  try{return JSON.parse(Buffer.from(access.split('.')[1],'base64url').toString());}catch{return {};}
}
export function recentAuthentication(access: string){return claims(access).amr?.some(a=>['password','oauth'].includes(a.method)&&Number.isFinite(a.timestamp)&&a.timestamp<=Date.now()/1000+30&&a.timestamp>Date.now()/1000-600)??false;}
export function sessionResponse(cfg: Config, session: {access_token: string; refresh_token?: string; expires_in: number}, location?: string) {
  if(typeof session.access_token!=='string'||!Number.isFinite(session.expires_in)||session.expires_in<=0)throw Error('Invalid authentication response.');
  const headers=new Headers({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  headers.append('Set-Cookie',cookie(cfg,'unify_session',session.access_token,Math.max(1,Math.min(3600,session.expires_in))));
  headers.append('Set-Cookie',cookie(cfg,'unify_refresh',session.refresh_token??'',session.refresh_token?2592000:0));
  headers.append('Set-Cookie',cookie(cfg,'unify_oauth','',0,true));
  if(location){headers.set('Location',cfg.origin+location);return new Response(null,{status:303,headers});}
  return Response.json({signedIn:true},{headers});
}
export function clearSession(cfg: Config){const response=Response.json({signedOut:true},{headers:{'Cache-Control':'private, no-store'}});for(const name of ['unify_session','unify_refresh','unify_oauth'])response.headers.append('Set-Cookie',cookie(cfg,name,'',0,name==='unify_oauth'));return response;}
function sign(cfg: Config,value: string){return createHmac('sha256',cfg.service).update('unify-oauth-v1:'+value).digest('base64url');}
export function beginGoogle(cfg: Config, expectedUser?: string){
  const verifier=randomBytes(32).toString('base64url');
  const payload=Buffer.from(JSON.stringify({verifier,expires:Date.now()+600000,expectedUser})).toString('base64url');
  const url=new URL(cfg.url+'/auth/v1/authorize');
  url.search=new URLSearchParams({provider:'google',redirect_to:cfg.origin+'/api/oauth-callback',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'s256',scopes:'openid email profile',prompt:'select_account'}).toString();
  return Response.json({url:url.href},{headers:{'Cache-Control':'private, no-store','Set-Cookie':cookie(cfg,'unify_oauth',payload+'.'+sign(cfg,payload),600,true)}});
}
export function oauthState(cfg: Config,request: Request): {verifier:string;expires:number;expectedUser?:string}|null{
  try{
    const [payload,signature]=cookieValue(request,'unify_oauth').split('.');if(!payload||!signature)return null;
    const a=Buffer.from(signature),b=Buffer.from(sign(cfg,payload));if(a.length!==b.length||!timingSafeEqual(a,b))return null;
    const state=JSON.parse(Buffer.from(payload,'base64url').toString());
    if(!Number.isFinite(state.expires)||state.expires<Date.now()||typeof state.verifier!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(state.verifier))return null;
    return state;
  }catch{return null;}
}
export async function approveSession(remote: Remote,access: string,userId: string,google: string|null=null,link=false){
  const payload=claims(access);
  if(payload.sub!==userId||!payload.session_id||!/^[a-f0-9-]{36}$/i.test(payload.session_id))throw Error('Invalid authenticated session.');
  const allowed=await remote('/rest/v1/rpc/approve_app_session','POST',{p_user:userId,p_session:payload.session_id,p_google:google,p_link:link});
  if(allowed!==true)throw Error('Session is no longer active.');
}
