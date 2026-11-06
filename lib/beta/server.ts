import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { pilotSummary, validatePilotPlan, validatePilotReview } from './pilot.ts';
import { appendBundle } from './records.ts';
import { appendCapture, emptyBundle, MAX_BYTES, parseBundle } from '../local/records.ts';
import { boundedHistory, streamHistory } from './history.ts';
import { approveSession, beginGoogle, claims, clearSession, cookieValue, oauthState, recentAuthentication, sessionResponse } from './auth.ts';
import { EVENT_BYTES, machineAdminInput, machineId, validateMachineEvent } from './machines.ts';
import { projectAttempt, validateAttempt, validateLifecycleEvent } from './lifecycle.ts';
import { portalStream } from './portal-stream.ts';
import { connectorRoute, onshapeCallback, onshapeNotification } from './connectors.ts';
import { commandInput } from './commands.ts';
import { reportQuery, reportRoute, validateReportPage } from './report-routes.ts';
import { predictionReadiness } from './prediction-readiness.ts';
import { registryInput } from './prediction-registry.ts';

// Server entry point only. Never import into a client component.
type Config = { origin: string; url: string; key: string; service: string };
type User = { id: string; email: string };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
function config(): Config {
  const { BETA_ORIGIN, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, BETA_ENABLED } = process.env;
  if (BETA_ENABLED !== 'true' || !BETA_ORIGIN || !SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) throw new HttpError(503, 'Private beta is not configured.');
  for (const raw of [BETA_ORIGIN, SUPABASE_URL]) {
    const u = new URL(raw);
    if (u.origin !== raw || u.username || u.password || (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname)))) throw new HttpError(503, 'Invalid server configuration.');
  }
  return { origin: BETA_ORIGIN, url: SUPABASE_URL, key: SUPABASE_ANON_KEY, service: SUPABASE_SERVICE_ROLE_KEY };
}
export async function readBody(request: Request, limit = MAX_BYTES + 2048, onRaw?: (body: string) => void) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415, 'Use application/json.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'A JSON body is required.');
  const parts: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new HttpError(413, 'Payload is too large.'); }
    parts.push(value);
  }
  try { const raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(Buffer.concat(parts)); onRaw?.(raw); return JSON.parse(raw) as Record<string, unknown>; }
  catch { throw new HttpError(400, 'Invalid JSON.'); }
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
function object(input: unknown): asserts input is Record<string, unknown> { if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Expected an object.'); }
function string(input: unknown, max = 120): string { if (typeof input !== 'string' || !input.trim() || input.length > max) throw new HttpError(400, 'Missing or invalid input.'); return input; }
function id(input: unknown): string { const s = string(input); if (!uuid.test(s)) throw new HttpError(400, 'Invalid identifier.'); return s; }
function emailAddress(input: unknown) { const value = string(input, 254).trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new HttpError(400, 'Enter a valid email address.'); return value; }
function newPassword(input: unknown) { const value = string(input, 1024); if (value.length < 8) throw new HttpError(400, 'Use at least 8 characters for your password.'); return value; }

export function createHandler(fetcher: typeof fetch = fetch) {
  return async function handle(request: Request): Promise<Response> {
    try {
      const cfg = config();
      const url = new URL(request.url), path = url.pathname.replace(/\/$/, '').split('/').slice(2);
      const ingestion = path[0] === 'ingest';
      const machineTransport = path[0] === 'v1' && path[1] === 'events';
      const commandTransport = path[0] === 'v1' && path[1] === 'commands';
      const connectorWebhook=path[0]==='onshape-webhook'&&process.env.BETA_CONNECTORS_ENABLED==='true';
      if (request.method !== 'GET' && !ingestion && !machineTransport && !commandTransport && !connectorWebhook && request.headers.get('origin') !== cfg.origin) throw new HttpError(403, 'Request origin denied.');
      if (!['GET', 'POST'].includes(request.method)) throw new HttpError(405, 'Method not allowed.');
      async function remote(route: string, method = 'GET', body?: unknown, token = cfg.service, key = cfg.service) {
        let response: Response;
        try { response = await fetcher(`${cfg.url}${route}`, { method, headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) }); }
        catch { throw new HttpError(503, 'Service unavailable. Retry later.'); }
        if (!response.ok) {
          const detail = await response.text();
          if (route.startsWith('/auth/')) {
            let code = ''; try { code = JSON.parse(detail).error_code || ''; } catch { /* Do not echo provider payloads. */ }
            if (code === 'email_not_confirmed') throw new HttpError(403, 'Confirm your email before signing in. You can request another confirmation email.');
            if (code === 'signup_disabled') throw new HttpError(503, 'Account registration is not enabled yet. Ask the administrator to enable email signup.');
            if (['email_address_not_authorized','over_email_send_rate_limit','over_request_rate_limit'].includes(code) || response.status === 429) throw new HttpError(503, 'Email delivery is unavailable or its limit was reached. Wait before retrying, or contact the administrator.');
            if (code === 'weak_password') throw new HttpError(400, 'Choose a stronger password with at least 8 characters.');
            if (code === 'same_password') throw new HttpError(400, 'Choose a different password from your current one.');
            if (code === 'invalid_credentials') throw new HttpError(401, 'Email or password is incorrect. Try again or reset your password.');
            if (response.status === 401) throw new HttpError(401, 'Your session expired. Sign in again.');
          }
          if (/linking_required/.test(detail)) throw new HttpError(403, 'Sign in with your existing password, then explicitly approve Google under Account access.');
          if (/version_conflict|idempotency_conflict|record_conflict/.test(detail)) throw new HttpError(409, 'Conflicting save. Export your draft, reload the workspace, then merge your changes.');
          if (/last_owner/.test(detail)) throw new HttpError(409, 'Keep at least one owner.');
          if (/rotation_pending/.test(detail)) throw new HttpError(409, 'An earlier credential is still in its overlap period. Revoke it or wait before rotating again.');
          if (/machine_limit/.test(detail)) throw new HttpError(409, 'This organization has reached the 100-identity staging limit.');
          if (/command_queue_full|command_event_limit/.test(detail)) throw new HttpError(409, 'Command staging limit reached. Preserve the local journal and reconcile outstanding requests.');
          if (/invalid_command_transition/.test(detail)) throw new HttpError(409, 'Command state changed. Reconcile the recorded state before continuing.');
          if (/report_limit/.test(detail)) throw new HttpError(409, 'Report credential or endpoint staging limit reached.');
          if (/forbidden/.test(detail) || [401, 403].includes(response.status)) throw new HttpError(403, 'Access denied or credential expired.');
          if (response.status >= 500 || response.status === 429) throw new HttpError(503, 'Service unavailable. Retry later.');
          throw new HttpError(400, 'The service rejected this request.');
        }
        return response.status === 204 ? {} : response.json();
      }
      const rpc = (action: string, org: string | null, actor: string | null, data: unknown) => remote('/rest/v1/rpc/beta_command', 'POST', { p_action: action, p_org: org, p_actor: actor, p_data: data });
      const pilot = async (action: string, org: string, actor: string | null, data: unknown = {}) => {
        try { return await remote('/rest/v1/rpc/pilot_command', 'POST', { p_action: action, p_org: org, p_actor: actor, p_data: data }); }
        catch (e) { if (e instanceof HttpError && [403,409].includes(e.status)) throw e; throw new HttpError(503, 'Pilot storage is unavailable or the operation was rejected. Ask an administrator to verify the Stage 8 migration; check that this week has started and reload before retrying.'); }
      };
      // Configuration only: this route deliberately makes no upstream request.
      if (path[0] === 'status' && request.method === 'GET') return json({ configured: true, connectivity: 'not_checked' });
      const lifecycle = process.env.BETA_AUTH_LIFECYCLE === 'true';
      if (path[0] === 'v1' && path[1] === 'reports') {
        if (process.env.BETA_REPORTS_ENABLED !== 'true') throw new HttpError(503, 'Reports are not activated.');
        if (path.length !== 2 || request.method !== 'GET') throw new HttpError(405, 'Use GET for report retrieval.');
        const credential = request.headers.get('authorization')?.match(/^Bearer (tr_[a-f0-9]{64})$/)?.[1];
        if (!credential) throw new HttpError(401, 'A scoped report credential is required.');
        let data; try { data = reportQuery(url); } catch { throw new HttpError(400, 'Invalid report page or revision.'); }
        const result = await remote('/rest/v1/rpc/report_api', 'POST', {p_hash: hash(credential), p_data: data});
        if (result.error_code === 'rate_limited') return json({error: 'Report request limit reached.'}, 429, {'Retry-After':'60'});
        return json(validateReportPage(result));
      }
      if (commandTransport) {
        if (process.env.BETA_COMMANDS_ENABLED !== 'true') throw new HttpError(503, 'Simulation commands are not activated.');
        if (path.length !== 2 || request.method !== 'POST') throw new HttpError(405, 'Use POST for command operations.');
        const credential = request.headers.get('authorization')?.match(/^Bearer (um_[a-f0-9]{64})$/)?.[1];
        if (!credential) throw new HttpError(401, 'An explicitly command-enabled machine credential is required.');
        let data;
        try { data = commandInput(await readBody(request, 4096), true); }
        catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, error instanceof Error ? error.message : 'Invalid command.'); }
        const result = await remote('/rest/v1/rpc/command_control', 'POST', {p_org: null, p_actor: null, p_hash: hash(credential), p_data: data});
        if (result.error_code === 'rate_limited') return json({error: 'Machine request limit reached.'}, 429, {'Retry-After': '60'});
        return json(result);
      }
      if(path[0]==='onshape-callback'&&request.method==='GET'){
        if(process.env.BETA_CONNECTORS_ENABLED!=='true')throw new HttpError(503,'Integrations are not activated.');
        return onshapeCallback(request,cfg,remote,fetcher);
      }
      if(connectorWebhook&&request.method==='POST'){
        let raw='';await readBody(request,16384,value=>{raw=value;});
        return onshapeNotification(request,remote,raw);
      }
      if (path[0] === 'auth-options' && request.method === 'GET') return json({ google: lifecycle && process.env.BETA_GOOGLE_ENABLED === 'true', projects: process.env.BETA_PROJECTS_ENABLED === 'true', machines: process.env.BETA_MACHINES_ENABLED === 'true', executions:process.env.BETA_LIFECYCLE_ENABLED==='true',portal:process.env.BETA_PORTAL_ENABLED==='true',connectors:process.env.BETA_CONNECTORS_ENABLED==='true' });
      if (machineTransport) {
        if (process.env.BETA_MACHINES_ENABLED !== 'true') throw new HttpError(503, 'Machine ingestion is not activated.');
        const credential = request.headers.get('authorization')?.match(/^Bearer (um_[a-f0-9]{64})$/)?.[1];
        if (!credential) throw new HttpError(401, 'A scoped machine credential is required.');
        let event=null, eventId=null, bodyHash='';
        try {
          if (request.method==='POST' && path.length===2) event=validateMachineEvent(await readBody(request,EVENT_BYTES,raw=>{bodyHash=hash(raw);}));
          else if (request.method==='GET' && path.length===3) eventId=machineId(path[2]);
          else throw new HttpError(404,'Not found.');
        } catch(error) { if(error instanceof HttpError)throw error; throw new HttpError(400,error instanceof Error?error.message:'Invalid event.'); }
        if(event?.event_type==='execution.recorded'){
          if(process.env.BETA_LIFECYCLE_ENABLED!=='true')throw new HttpError(503,'Execution evidence is not activated.');
          if(Buffer.byteLength(JSON.stringify(event))>16384)throw new HttpError(413,'Execution event exceeds 16 KiB.');
        }
        const result=await remote('/rest/v1/rpc/machine_transport','POST',{p_hash:hash(credential),p_event:event,p_body_hash:bodyHash||null,p_event_id:eventId});
        const errors:Record<string,[number,string]>={
          rate_limited:[429,'Machine request limit reached. Retry after one minute.'],not_found:[404,'No receipt for this identity and event.'],
          scope_denied:[403,'Event is outside the assigned identity, project or robot scope.'],
          idempotency_conflict:[409,'Event ID already exists with different request bytes. Retry the original queued bytes.'],
          sequence_conflict:[409,'Source sequence already belongs to another event. Preserve sequences across restarts.'],
          record_conflict:[409,'Captured records conflict with immutable history. Review the original capture.'],
          attempt_event_limit:[409,'This attempt reached the 1,000-event staging limit. Preserve the queued evidence.'],
          invalid_event:[400,'Event was not saved. Validate capture, sequence and references; verify incremental storage is active.']};
        if(result.error_code){const [status,message]=errors[result.error_code]??[503,'Machine storage unavailable.'];return json({error:message,code:result.error_code},status,status===429?{'Retry-After':'60'}:{});}
        return json(result);
      }
      if (path[0] === 'google' && request.method === 'POST') {
        if (!lifecycle || process.env.BETA_GOOGLE_ENABLED !== 'true') throw new HttpError(503, 'Google sign-in needs administrator setup. Email sign-in remains available.');
        return beginGoogle(cfg);
      }
      if (path[0] === 'oauth-callback' && request.method === 'GET') {
        const state = oauthState(cfg, request), code = url.searchParams.get('code');
        if (!lifecycle || process.env.BETA_GOOGLE_ENABLED !== 'true' || !state || !code || code.length > 2048 || url.searchParams.has('error')) {
          const response = clearSession(cfg); response.headers.set('Location', cfg.origin + '/?auth_error=google'); return new Response(null, { status: 303, headers: response.headers });
        }
        try {
          const session = await remote('/auth/v1/token?grant_type=pkce', 'POST', { auth_code: code, code_verifier: state.verifier }, cfg.key, cfg.key);
          const verified = await remote('/auth/v1/user', 'GET', undefined, session.access_token, cfg.key);
          id(verified.id);
          if (!verified.email_confirmed_at || (state.expectedUser && state.expectedUser !== verified.id)) throw new HttpError(403, 'Google account does not match the account you approved.');
          const identity = verified.identities?.find((i: {provider: string}) => i.provider === 'google');
          const googleId = id(identity?.identity_id ?? identity?.id);
          await approveSession(remote, session.access_token, verified.id, googleId, !!state.expectedUser);
          return sessionResponse(cfg, session, '/');
        } catch {
          const response = clearSession(cfg); response.headers.set('Location', cfg.origin + '/?auth_error=google'); return new Response(null, { status: 303, headers: response.headers });
        }
      }
      if (path[0] === 'refresh' && request.method === 'POST') {
        if (!lifecycle) throw new HttpError(401, 'Sign in again.');
        const refresh = cookieValue(request, 'unify_refresh');
        if (!refresh || refresh.length > 4096) throw new HttpError(401, 'Sign in again.');
        const session = await remote('/auth/v1/token?grant_type=refresh_token', 'POST', { refresh_token: refresh }, cfg.key, cfg.key);
        const verified = await remote('/auth/v1/user', 'GET', undefined, session.access_token, cfg.key);
        const payload = claims(session.access_token);
        if (!payload.session_id || payload.sub !== verified.id || !(await remote('/rest/v1/rpc/app_session_allowed', 'POST', { p_user: id(verified.id), p_session: id(payload.session_id) }))) throw new HttpError(401, 'Sign in again to approve this session.');
        return sessionResponse(cfg, session);
      }
      if (lifecycle && path[0] === 'logout' && request.method === 'POST') {
        let access=cookieValue(request,'unify_session');
        try {
          let verified;
          try { verified=await remote('/auth/v1/user','GET',undefined,access,cfg.key); }
          catch {
            const refresh=cookieValue(request,'unify_refresh');
            if(!refresh) return clearSession(cfg);
            const renewed=await remote('/auth/v1/token?grant_type=refresh_token','POST',{refresh_token:refresh},cfg.key,cfg.key);
            access=renewed.access_token;verified=await remote('/auth/v1/user','GET',undefined,access,cfg.key);
          }
          const sessionId=claims(access).session_id;
          if(sessionId)await remote('/rest/v1/rpc/revoke_app_session','POST',{p_user:id(verified.id),p_session:id(sessionId),p_all:false});
          await remote('/auth/v1/logout?scope=local','POST',undefined,access,cfg.key);
          return clearSession(cfg);
        } catch {
          const response=clearSession(cfg);response.headers.set('X-UNIFY-Revocation','unconfirmed');return response;
        }
      }
      if (['signup', 'recover', 'resend-confirmation'].includes(path[0]) && request.method === 'POST') {
        const data = await readBody(request, 8192); object(data);
        const email = emailAddress(data.email), redirect = encodeURIComponent(cfg.origin + '/');
        if (path[0] === 'signup') {
          await remote(`/auth/v1/signup?redirect_to=${redirect}`, 'POST', { email, password: newPassword(data.password) }, cfg.key, cfg.key);
        } else if (path[0] === 'recover') {
          await remote(`/auth/v1/recover?redirect_to=${redirect}`, 'POST', { email }, cfg.key, cfg.key);
        } else {
          await remote(`/auth/v1/resend?redirect_to=${redirect}`, 'POST', { email, type: 'signup' }, cfg.key, cfg.key);
        }
        // Do not expose whether an address exists or grant organization membership.
        return json({ message: 'If this address is eligible, check your inbox for the next step. Check spam too.' });
      }
      if (path[0] === 'auth-session' && request.method === 'POST') {
        const data = await readBody(request, 16384); object(data);
        const access = string(data.access_token, 12000);
        const verified = await remote('/auth/v1/user', 'GET', undefined, access, cfg.key);
        id(verified.id);
        if (!verified.email_confirmed_at) throw new HttpError(403, 'Confirm your email before continuing.');
        // Validate with Auth before accepting token claims; never trust a supplied user ID.
        let expires = 0; try { expires = JSON.parse(Buffer.from(access.split('.')[1], 'base64url').toString()).exp; } catch { /* invalid token */ }
        if (!Number.isFinite(expires) || expires <= Date.now() / 1000) throw new HttpError(401, 'This link has expired. Request a new one.');
        if (lifecycle) {
          // OAuth tokens must pass the PKCE/link-approval callback, never this email-link adapter.
          const methods = claims(access).amr ?? [];
          if (!methods.some(m => ['otp','recovery','invite','email/signup','email_change'].includes(m.method)) || methods.some(m => m.method === 'oauth')) throw new HttpError(403, 'Use the appropriate sign-in flow.');
          await approveSession(remote, access, verified.id);
          // Email links keep a bounded session; a separately supplied refresh token is not trusted.
          return sessionResponse(cfg, { access_token: access, expires_in: Math.floor(expires-Date.now()/1000) });
        }
        return json({ signedIn: true }, 200, { 'Set-Cookie': `unify_session=${encodeURIComponent(access)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.min(Math.floor(expires - Date.now() / 1000), 3600)}${cfg.origin.startsWith('https:') ? '; Secure' : ''}` });
      }
      if (path[0] === 'login' && request.method === 'POST') {
        const data = await readBody(request, 8192); object(data);
        const email = string(data.email, 254), password = string(data.password, 1024);
        const session = await remote('/auth/v1/token?grant_type=password', 'POST', { email, password }, cfg.key, cfg.key);
        if (typeof session.access_token !== 'string' || !Number.isFinite(session.expires_in)) throw new HttpError(503, 'Invalid authentication response.');
        if (lifecycle) {
          const verified = await remote('/auth/v1/user', 'GET', undefined, session.access_token, cfg.key);
          if (!verified.email_confirmed_at) throw new HttpError(403, 'Confirm your email before signing in.');
          await approveSession(remote, session.access_token, id(verified.id));
          return sessionResponse(cfg, session);
        }
        // Short-lived sessions deliberately require sign-in again; no browser refresh token.
        const cookie = `unify_session=${encodeURIComponent(session.access_token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.min(session.expires_in, 3600)}${cfg.origin.startsWith('https:') ? '; Secure' : ''}`;
        return json({ signedIn: true }, 200, { 'Set-Cookie': cookie });
      }
      if (ingestion && request.method === 'POST') {
        const token = request.headers.get('authorization')?.match(/^Bearer (uc_[a-f0-9]{64})$/)?.[1];
        if (!token) throw new HttpError(401, 'Collector credential required.');
        const org = id(path[1]), data = await readBody(request); object(data);
        const credential_hash = hash(token), scope = await rpc('credential_lookup', org, null, { credential_hash });
        try {
        let capture; try { capture = parseBundle(JSON.stringify(data.capture)); } catch { throw new HttpError(400, 'Invalid approved capture. Validate it locally.'); }
        if (capture.records.robots.length !== 1 || capture.records.robots[0].id !== scope.robot_id) throw new HttpError(403, 'Capture is outside the credential scope.');
        const current = await remote(`/rest/v1/workspaces?org_id=eq.${org}&select=${process.env.BETA_HISTORY_ENABLED === 'true' ? 'version,incremental' : 'version'}`);
        if (current[0].incremental) {
          try { appendCapture(emptyBundle(), capture); } catch { throw new HttpError(400, 'Expected one approved capture with its exact snapshot.'); }
          return json(await remote('/rest/v1/rpc/append_records', 'POST', { p_org: org, p_actor: null, p_data: { credential_hash, bundle: capture, request_id: string(data.request_id), body_hash: hash(JSON.stringify(capture)) } }));
        }
        const legacy = await remote(`/rest/v1/workspaces?org_id=eq.${org}&select=bundle`);
        let next; try { next = appendCapture(legacy[0].bundle, capture); } catch { throw new HttpError(409, 'Capture conflicts with saved history or exceeds workspace limits.'); }
        return json(await rpc('save', org, null, { credential_hash, expected_version: current[0].version, bundle: next, request_id: string(data.request_id), body_hash: hash(JSON.stringify(capture)) }));
        } catch (error) {
          // Attribute only after credential validation; never record capture contents.
          let tracked = true;
          try { await pilot('ingestion_failed', org, null, { credential_hash, attempt_id: randomUUID() }); } catch { tracked = false; }
          return json({ error: error instanceof HttpError ? error.message : 'Capture could not be saved.' }, error instanceof HttpError ? error.status : 500, { 'X-UNIFY-Pilot-Tracking': tracked ? 'attempted' : 'unavailable' });
        }
      }
      const cookie = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith('unify_session='));
      if (!cookie && path[0] === 'logout' && request.method === 'POST') return clearSession(cfg);
      if (!cookie) throw new HttpError(401, 'Sign in to continue.');
      const token = decodeURIComponent(cookie.slice('unify_session='.length));
      if (path[0] === 'logout' && request.method === 'POST') {
        // Always clear this browser's cookie, even if the upstream session expired.
        try { await remote('/auth/v1/logout?scope=local', 'POST', undefined, token, cfg.key); } catch { /* short-lived token may already be invalid */ }
        return json({ signedOut: true }, 200, { 'Set-Cookie': `unify_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${cfg.origin.startsWith('https:') ? '; Secure' : ''}` });
      }
      const user: User = await remote('/auth/v1/user', 'GET', undefined, token, cfg.key);
      id(user.id);
      if (lifecycle) {
        const sessionId=claims(token).session_id;
        if (!sessionId || !(await remote('/rest/v1/rpc/app_session_allowed','POST',{p_user:user.id,p_session:id(sessionId)}))) throw new HttpError(401,'Sign in again to approve this session.');
      }
      if (path[0] === 'link-google' && request.method === 'POST') {
        if (!lifecycle || process.env.BETA_GOOGLE_ENABLED !== 'true') throw new HttpError(503, 'Google sign-in needs administrator setup.');
        const data=await readBody(request,8192);object(data);
        const proof=await remote('/auth/v1/token?grant_type=password','POST',{email:user.email,password:string(data.password,1024)},cfg.key,cfg.key);
        const verified=await remote('/auth/v1/user','GET',undefined,proof.access_token,cfg.key);
        try { await remote('/auth/v1/logout?scope=local','POST',undefined,proof.access_token,cfg.key); } catch { /* Unapproved proof session grants no app access. */ }
        if(verified.id!==user.id)throw new HttpError(403,'Account mismatch.');
        return beginGoogle(cfg,user.id);
      }
      if (path[0] === 'password' && request.method === 'POST') {
        const data = await readBody(request, 8192); object(data);
        await remote('/auth/v1/user', 'PUT', { password: newPassword(data.password) }, token, cfg.key);
        if (lifecycle) await remote('/rest/v1/rpc/revoke_app_session','POST',{p_user:user.id,p_session:id(claims(token).session_id),p_all:true});
        // End this setup session; sign in again with the chosen password.
        try { await remote('/auth/v1/logout?scope=global', 'POST', undefined, token, cfg.key); } catch { /* JWTs remain bounded by expiry. */ }
        if (lifecycle) return clearSession(cfg);
        return json({ updated: true }, 200, { 'Set-Cookie': `unify_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${cfg.origin.startsWith('https:') ? '; Secure' : ''}` });
      }
      const read = (table: string, query: string) => remote(`/rest/v1/${table}?${query}`, 'GET', undefined, token, cfg.key);
      if (path[0] === 'session' && request.method === 'GET') return json({ user: { id: user.id, email: user.email }, memberships: await read('memberships', `user_id=eq.${user.id}&select=org_id,role,organizations(name)`) });
      if (path[0] === 'client-projects' && request.method === 'GET') return json(await read('projects', 'select=org_id,id,name,client_id&order=name&limit=100'));
      if (path[0] === 'client-readiness' && path.length === 3 && request.method === 'GET') {
        const orgId=id(path[1]),projectId=id(path[2]);
        if (!(await read('projects', `org_id=eq.${orgId}&id=eq.${projectId}&select=id`)).length) throw new HttpError(403, 'Project access denied.');
        const published=process.env.BETA_PREDICTION_REGISTRY_ENABLED==='true'?await remote('/rest/v1/rpc/prediction_public_readiness','POST',{p_org:orgId,p_project:projectId,p_actor:user.id}):[];
        return json(predictionReadiness(published));
      }
      if (path[0] === 'client-reports' && path.length === 3 && request.method === 'GET') {
        const orgId=id(path[1]),projectId=id(path[2]);
        if (!(await read('projects', `org_id=eq.${orgId}&id=eq.${projectId}&select=id`)).length) throw new HttpError(403, 'Project access denied.');
        if (process.env.BETA_REPORTS_ENABLED !== 'true') return json({rows:[],next:null,enabled:false});
        let query; try { query=reportQuery(url); } catch { throw new HttpError(400, 'Invalid report page or revision.'); }
        const rows=await read('report_publications', `org_id=eq.${orgId}&project_id=eq.${projectId}&publication_id=gt.${query.after}${query.report_id?`&report_id=eq.${query.report_id}&revision=eq.${query.revision}`:''}&select=publication_id,payload&order=publication_id&limit=25`);
        return json(validateReportPage({rows,next:rows.length===25?rows.at(-1).publication_id:null,enabled:true}));
      }
      if (path[0] === 'client-updates' && path.length === 3 && request.method === 'GET') {
        if(process.env.BETA_PORTAL_ENABLED!=='true')throw new HttpError(503,'Portal updates are not activated.');
        const orgId=id(path[1]),projectId=id(path[2]);
        const check=async()=>{
          if(lifecycle&&!(await remote('/rest/v1/rpc/app_session_allowed','POST',{p_user:user.id,p_session:id(claims(token).session_id)})))throw new HttpError(401,'Session ended.');
          const projects=await read('projects',`org_id=eq.${orgId}&id=eq.${projectId}&select=id`);
          if(!projects.length)throw new HttpError(403,'Project access denied.');
          const query=`org_id=eq.${orgId}&project_id=eq.${projectId}&select=publication_id&order=publication_id.desc&limit=1`;
          const [runs,executions]=await Promise.all([read('shared_run_summaries',query),read('shared_execution_summaries',query)]);
          return `${runs[0]?.publication_id??0}:${executions[0]?.publication_id??0}`;
        };
        await check(); // Reject unauthorized subscriptions before opening a stream.
        return new Response(portalStream(check,request.signal),{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Accel-Buffering':'no'}});
      }
      if (['client-project','client-executions'].includes(path[0]) && request.method === 'GET') {
        const orgId=id(path[1]), projectId=id(path[2]);
        const projects=await read('projects',`org_id=eq.${orgId}&id=eq.${projectId}&select=id,name`);
        if(!projects.length)throw new HttpError(403,'Project access denied.');
        const after=url.searchParams.get('after')??'0';if(!/^\d{1,16}$/.test(after))throw new HttpError(400,'Invalid cursor.');
        if(path[0]==='client-executions'&&process.env.BETA_PORTAL_ENABLED!=='true')return json({project:projects[0],rows:[],next:null,enabled:false});
        const table=path[0]==='client-executions'?'shared_execution_summaries':'shared_run_summaries';
        const execution=path[0]==='client-executions';
        const cursor=execution?(after==='0'?'':`&publication_id=lt.${after}`):`&publication_id=gt.${after}`;
        const rows=await read(table,`org_id=eq.${orgId}&project_id=eq.${projectId}${cursor}&select=publication_id,revision,payload,published_at&order=publication_id${execution?'.desc':''}&limit=25`);
        return json({project:projects[0],rows,next:rows.length===25?rows.at(-1).publication_id:null});
      }
      if (path[0] === 'accept-invite' && request.method === 'POST') {
        const data = await readBody(request, 8192); object(data);
        const inviteToken=string(data.token,100);
        if(inviteToken.startsWith('up_'))return json(await remote('/rest/v1/rpc/project_command','POST',{p_action:'accept',p_org:null,p_actor:user.id,p_data:{token_hash:hash(inviteToken)}}));
        return json(await rpc('accept_invite', null, user.id, { token_hash: hash(string(data.token, 100)) }));
      }
      if (path[0] !== 'org') throw new HttpError(404, 'Not found.');
      const org = id(path[1]), members = await read('memberships', `org_id=eq.${org}&user_id=eq.${user.id}&select=role`);
      if (!members.length) throw new HttpError(403, 'Access denied.');
      if(path[2]==='prediction-candidates'&&path.length===3){
        if(process.env.BETA_PREDICTION_REGISTRY_ENABLED!=='true')throw new HttpError(503,'Candidate registry is not activated.');
        if(!['GET','POST'].includes(request.method))throw new HttpError(405,'Use GET or POST.');
        if(request.method==='POST'&&!['owner','admin','engineer','member'].includes(members[0].role))throw new HttpError(403,'Candidate review requires an engineer or administrator.');
        let data;try{data=registryInput(request.method==='GET'?{action:'list',project_id:url.searchParams.get('project_id')}:await readBody(request,1048576),org);}catch(error){if(error instanceof HttpError)throw error;throw new HttpError(400,'Invalid candidate input. Check scope, source references, labels and requested state.');}
        return json(await remote('/rest/v1/rpc/prediction_command','POST',{p_org:org,p_actor:user.id,p_data:data}));
      }
      if (path[2] === 'reports' && path.length === 3) {
        if (process.env.BETA_REPORTS_ENABLED !== 'true') throw new HttpError(503, 'Reports are not activated.');
        const data=request.method==='GET'?{action:'list'}:await readBody(request,8192);object(data);
        const publication=['preview','publish'].includes(String(data.action));
        if (!(publication?['owner','admin','engineer','member']:['owner','admin']).includes(members[0].role)) throw new HttpError(403, 'Report publication requires an engineer; delivery administration requires an administrator.');
        if (!publication && request.method==='POST' && lifecycle && !recentAuthentication(token)) throw new HttpError(403, 'Sign in again before changing report delivery access.');
        try { return json(await reportRoute(remote,read,org,user.id,data)); }
        catch(error){if(error instanceof HttpError)throw error;throw new HttpError(400,error instanceof Error?error.message:'Report request rejected.');}
      }
      if (path[2] === 'commands' && path.length === 3) {
        if (process.env.BETA_COMMANDS_ENABLED !== 'true') throw new HttpError(503, 'Simulation commands are not activated.');
        let data;
        try { data = commandInput(request.method === 'POST' ? await readBody(request, 4096) : url.searchParams.has('id') ? {action: 'get', id: url.searchParams.get('id')} : {action: 'list', after: url.searchParams.get('after')}); }
        catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, error instanceof Error ? error.message : 'Invalid command.'); }
        if (lifecycle && ['grant', 'approve', 'resolve'].includes(String(data.action)) && !recentAuthentication(token)) throw new HttpError(403, 'Sign in again before approving commands, resolving outcomes or changing command permissions.');
        return json(await remote('/rest/v1/rpc/command_control', 'POST', {p_org: org, p_actor: user.id, p_hash: null, p_data: data}));
      }
      if(path[2]==='integrations'&&path.length===3){
        if(process.env.BETA_CONNECTORS_ENABLED!=='true')throw new HttpError(503,'Integrations are not activated.');
        if(!['owner','admin'].includes(members[0].role))throw new HttpError(403,'Integration administration requires owner or administrator access.');
        if(request.method==='POST'&&lifecycle&&!recentAuthentication(token))throw new HttpError(403,'Sign in again before changing integrations. Save your draft first.');
        const input=request.method==='POST'?await readBody(request,16384):{};object(input);
        try{return await connectorRoute(request,cfg,remote,fetcher,org,user.id,token,input,read);}
        catch(error){if(error instanceof HttpError)throw error;throw new HttpError(400,error instanceof Error?error.message:'Integration request failed.');}
      }
      if(path[2]==='publish-execution'&&path.length===3&&request.method==='POST'){
        if(process.env.BETA_PORTAL_ENABLED!=='true')throw new HttpError(503,'Outcome publication is not activated.');
        if(!['owner','admin','engineer','member'].includes(members[0].role))throw new HttpError(403,'Publishing requires an engineer or administrator.');
        const data=await readBody(request,2048);object(data);const attemptId=id(data.attempt_id);
        if(!Number.isSafeInteger(data.cutoff)||Number(data.cutoff)<0)throw new HttpError(400,'Reload the timeline before publishing.');
        const [a]=await read('execution_attempts',`org_id=eq.${org}&id=eq.${attemptId}&select=payload`);
        if(!a)throw new HttpError(404,'Attempt not found.');
        const events=await read('execution_events',`org_id=eq.${org}&attempt_id=eq.${attemptId}&select=archive_id,payload,received_at,author&order=source_sequence&limit=1000`);
        const cutoff=Math.max(0,...events.map((e:{archive_id:number})=>e.archive_id));
        if(cutoff!==data.cutoff)throw new HttpError(409,'Evidence changed. Reload and review the timeline before publishing.');
        const projection=projectAttempt(a.payload,events.map((e:{payload:object;received_at:string;author:string})=>({...e.payload,received_at:new Date(e.received_at).toISOString(),author:e.author})));
        return json(await remote('/rest/v1/rpc/publish_execution','POST',{p_org:org,p_actor:user.id,p_data:{attempt_id:attemptId,cutoff,outcome:projection.state,evidence_warning:projection.warnings.length>0}}));
      }
      if(path[2]==='executions'&&path.length===3){
        if(process.env.BETA_LIFECYCLE_ENABLED!=='true')throw new HttpError(503,'Execution evidence is not activated.');
        if(request.method==='POST'){
          if(!['owner','admin','engineer','member','operator'].includes(members[0].role))throw new HttpError(403,'Recording execution evidence requires an internal writer role.');
          const input=await readBody(request,16384);object(input);let data;
          try{
            if(input.action==='create')data={action:'create',project_id:machineId(input.project_id),attempt:validateAttempt(input.attempt)};
            else if(input.action==='append'){const event=validateLifecycleEvent(input.event);data={action:'append',attempt_id:machineId(input.attempt_id),event,body_hash:hash(JSON.stringify(event))};}
            else throw Error('Choose create or append.');
          }catch(error){throw new HttpError(400,error instanceof Error?error.message:'Invalid execution evidence.');}
          return json(await remote('/rest/v1/rpc/execution_command','POST',{p_org:org,p_actor:user.id,p_data:data}));
        }
        if(url.searchParams.has('attempt')){
          const attemptId=id(url.searchParams.get('attempt'));
          const rows=await read('execution_attempts',`org_id=eq.${org}&id=eq.${attemptId}&select=payload,project_id,created_at`);
          if(!rows.length)throw new HttpError(404,'Attempt not found.');
          const knownAt=url.searchParams.get('known_at');
          if(knownAt&&Date.parse(knownAt)<Date.parse(rows[0].created_at))throw new HttpError(404,'Attempt was not recorded at the requested time.');
          const events=await read('execution_events',`org_id=eq.${org}&attempt_id=eq.${attemptId}&select=archive_id,payload,received_at,author&order=source_sequence&limit=1000`);
          try{return json({...rows[0],cutoff:Math.max(0,...events.map((e:{archive_id:number})=>e.archive_id)),projection:projectAttempt(rows[0].payload,events.map((e:{payload:object;received_at:string;author:string})=>({...e.payload,received_at:new Date(e.received_at).toISOString(),author:e.author})),url.searchParams.get('known_at')??undefined)});}
          catch{throw new HttpError(400,'Lifecycle evidence or historical timestamp is invalid.');}
        }
        const after=url.searchParams.get('after');
        const rows=await read('execution_attempts',`org_id=eq.${org}${after?'&id=gt.'+id(after):''}&select=id,job_id,robot_id,project_id,payload,created_at&order=id&limit=25`);
        return json({rows,next:rows.length===25?rows.at(-1).id:null});
      }
      if (path[2]==='machines' && path.length===3) {
        if(process.env.BETA_MACHINES_ENABLED!=='true')throw new HttpError(503,'Machine identities are not activated.');
        if(!['owner','admin'].includes(members[0].role))throw new HttpError(403,'Administrator access required.');
        let params:Record<string,unknown>={},action='list',secret;
        if(request.method==='POST'){
          if(lifecycle&&!recentAuthentication(token))throw new HttpError(403,'Sign in again before changing machine credentials. Save your draft first.');
          const input=await readBody(request,8192);object(input);
          try {const validated=machineAdminInput(input);action=String(validated.action);params={...validated};delete params.action;}
          catch(error){throw new HttpError(400,error instanceof Error?error.message:'Invalid machine operation.');}
          if(['create','rotate'].includes(action)){secret='um_'+randomBytes(32).toString('hex');params.token_hash=hash(secret);}
        }
        const result=await remote('/rest/v1/rpc/machine_admin','POST',{p_action:action,p_org:org,p_actor:user.id,p_data:params});
        return json(secret?{...result,token:secret}:result);
      }
      if (path[2] === 'projects' && request.method === 'GET') return json(await remote('/rest/v1/rpc/project_command','POST',{p_action:'read',p_org:org,p_actor:user.id,p_data:{}}));
      if (path[2] === 'project' && request.method === 'POST') {
        const data=await readBody(request,8192);object(data);
        const action=string(data.action);
        if(!['client','team','team_member','project','robot','invite','revoke_invite','revoke_grant','publish'].includes(action))throw new HttpError(400,'Invalid project operation.');
        if(lifecycle&&['invite','revoke_grant','team_member'].includes(action)&&!recentAuthentication(token))throw new HttpError(403,'Sign in again before changing project access. Save your draft first.');
        const params:Record<string,unknown>={};
        for(const key of ['id','project_id','client_id','team_id','user_id'])if(data[key])params[key]=id(data[key]);
        for(const key of ['name','robot_id','run_id'])if(data[key]!==undefined)params[key]=string(data[key]);
        if(data.remove===true)params.remove=true;
        let secret;
        if(action==='invite'){params.email=emailAddress(data.email);secret='up_'+randomBytes(32).toString('hex');params.token_hash=hash(secret);}
        const result=await remote('/rest/v1/rpc/project_command','POST',{p_action:action,p_org:org,p_actor:user.id,p_data:params});
        return json(secret?{...result,token:secret}:result);
      }
      const historyPage = async (data: Record<string, unknown>) => {
        if(lifecycle && !(await remote('/rest/v1/rpc/app_session_allowed','POST',{p_user:user.id,p_session:id(claims(token).session_id)})))throw new HttpError(401,'Session ended.');
        return remote('/rest/v1/rpc/history_page', 'POST', { p_org: org, p_actor: user.id, p_data: data });
      };
      if (request.method === 'GET' && path[2] === 'history') {
        const data: Record<string, unknown> = Object.fromEntries(url.searchParams);
        if (JSON.stringify(data).length > 2048) throw new HttpError(400, 'Invalid history query.');
        return json(await historyPage(data));
      }
      if (request.method === 'GET' && path[2] === 'run-context') {
        const ids = (url.searchParams.get('ids') ?? '').split(',');
        if (ids.length > 2 || ids.some(value => !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(value))) throw new HttpError(400, 'Choose one or two run IDs.');
        const [state] = await read('workspaces', `org_id=eq.${org}&select=history_synthetic,bundle`);
        const bundle = emptyBundle(); bundle.version = 2; bundle.synthetic = state.history_synthetic ?? state.bundle.synthetic;
        for (const runId of new Set(ids)) {
          const [row] = await read('runs', `org_id=eq.${org}&id=eq.${encodeURIComponent(runId)}&select=payload`);
          if (!row) throw new HttpError(404, 'Run unavailable.');
          bundle.records.runs.push(row.payload);
        }
        bundle.investigations = [];
        for (const runId of new Set(ids)) {
          const history = await read('investigation_revisions', `org_id=eq.${org}&run_id=eq.${encodeURIComponent(runId)}&select=payload&order=investigation_id,revision&limit=1000`);
          if (history.length === 1000) throw new HttpError(413, 'Investigation history exceeds the local editor. Use the complete history export.');
          bundle.investigations.push(...history.map((r: {payload: NonNullable<typeof bundle.investigations>[number]}) => r.payload));
        }
        for (const investigation of bundle.investigations) {
          for (const runId of [investigation.baselineId, investigation.retestId].filter(Boolean)) {
            if (bundle.records.runs.some(r => r.id === runId)) continue;
            const [row] = await read('runs', `org_id=eq.${org}&id=eq.${encodeURIComponent(runId)}&select=payload`);
            if (!row) throw new HttpError(404, 'Investigation reference unavailable.');
            bundle.records.runs.push(row.payload);
          }
        }
        const robotIds = new Set(bundle.records.runs.map(r => r.robotId));
        for (const robotId of robotIds) {
          const [row] = await read('robots', `org_id=eq.${org}&id=eq.${encodeURIComponent(robotId)}&select=payload`);
          if (!row) throw new HttpError(404, 'Robot unavailable.');
          bundle.records.robots.push(row.payload);
        }
        const revisions = new Map<string, number>();
        for (const run of bundle.records.runs) revisions.set(run.snapshotId, Math.max(revisions.get(run.snapshotId) ?? 0, run.snapshotRevision));
        for (const [snapshotId, revision] of revisions) {
          if (revision > 1000) throw new HttpError(413, 'This revision chain exceeds the local editor. Use the complete history export.');
          const filter = `org_id=eq.${org}&revision=lte.${revision}&select=payload&order=revision&limit=1000`;
          bundle.records.snapshots.push(...(await read('snapshots', filter + `&id=eq.${encodeURIComponent(snapshotId)}`)).map((r: {payload: typeof bundle.records.snapshots[number]}) => r.payload));
          bundle.corrections.push(...(await read('corrections', filter + `&snapshot_id=eq.${encodeURIComponent(snapshotId)}`)).map((r: {payload: typeof bundle.corrections[number]}) => r.payload));
        }
        try { return json({ bundle: parseBundle(JSON.stringify(bundle)) }); } catch { throw new HttpError(413, 'Selected evidence exceeds the local editor or is incomplete. Use the complete history export.'); }
      }
      if (request.method === 'GET' && path[2] === 'export-history') {
        const [state] = await read('workspaces', `org_id=eq.${org}&select=version,history_synthetic,bundle`);
        await historyPage({ collection: 'robots', limit: 1 });
        const executions=process.env.BETA_LIFECYCLE_ENABLED==='true';
        const manifest=executions?await remote('/rest/v1/rpc/execution_archive','POST',{p_org:org,p_actor:user.id,p_data:{}}):null;
        const page=async(data:Record<string,unknown>)=>{
          if(!String(data.collection).startsWith('execution_'))return historyPage(data);
          // Reauthorize session and membership for every streamed page, including empty pages.
          await historyPage({collection:'robots',limit:1});
          return remote('/rest/v1/rpc/execution_archive','POST',{p_org:org,p_actor:user.id,p_data:data});
        };
        return new Response(streamHistory(page, state.history_synthetic ?? state.bundle.synthetic, manifest?.history_version??state.version,manifest?.limits), { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="tavrik-history-v${executions?2:1}.ndjson"`, 'X-Content-Type-Options': 'nosniff' } });
      }
      if (request.method === 'GET' && path[2] === 'pilot') {
        if (members[0].role !== 'owner') throw new HttpError(403, 'Owner access required.');
        return json(pilotSummary(await pilot('read', org, user.id)));
      }
      if (request.method === 'GET' && path[2] === 'workspace') {
        const rows = await read('workspaces', `org_id=eq.${org}&select=*`);
        if (rows[0].incremental) {
          const bundle = await boundedHistory(historyPage, rows[0].history_synthetic ?? false, rows[0].version);
          return json({ version: rows[0].version, updated_at: rows[0].updated_at, bundle: bundle ?? { ...emptyBundle(), synthetic: rows[0].history_synthetic ?? false }, incremental: true, historyOnly: bundle === null, role: members[0].role });
        }
        return json({ ...rows[0], role: members[0].role });
      }
      if (request.method === 'GET' && path[2] === 'export') {
        const rows = await read('workspaces', `org_id=eq.${org}&select=*`);
        if (rows[0].incremental) {
          const bundle = await boundedHistory(historyPage, rows[0].history_synthetic ?? false, rows[0].version);
          if (!bundle) throw new HttpError(413, 'History exceeds the local file format. Use Export complete history.');
          return json(bundle, 200, { 'Content-Disposition': 'attachment; filename="tavrik-organization-records.json"' });
        }
        return json(rows[0].bundle, 200, { 'Content-Disposition': 'attachment; filename="tavrik-organization-records.json"' });
      }
      if (request.method === 'GET' && path[2] === 'members') return json(await read('memberships', `org_id=eq.${org}&select=user_id,role`));
      if (request.method === 'GET' && path[2] === 'access') return json(await rpc('access', org, user.id, {}));
      if (request.method !== 'POST') throw new HttpError(404, 'Not found.');
      const data = await readBody(request); object(data);
      if (path[2] === 'pilot-comparison') return json(await pilot('comparison', org, user.id, { runId: string(data.runId), baselineId: string(data.baselineId) }));
      if (path[2] === 'save') {
        if (['viewer','internal_viewer'].includes(members[0].role)) throw new HttpError(403, 'Viewers cannot save records.');
        if (!Number.isSafeInteger(data.expected_version) || (data.expected_version as number) < 0) throw new HttpError(400, 'Invalid workspace version.');
        const current = await read('workspaces', `org_id=eq.${org}&select=${process.env.BETA_HISTORY_ENABLED === 'true' ? 'version,incremental' : 'version'}`);
        if (current[0].incremental) {
          let bundle; try { bundle = parseBundle(JSON.stringify(data.bundle)); } catch { throw new HttpError(400, 'Invalid bounded import. Include exact snapshot and correction dependencies.'); }
          return json(await remote('/rest/v1/rpc/append_records', 'POST', { p_org: org, p_actor: user.id, p_data: { bundle, request_id: string(data.request_id), body_hash: hash(JSON.stringify(bundle)) } }));
        }
        const legacy = await read('workspaces', `org_id=eq.${org}&select=bundle`);
        let incoming, next;
        try { incoming = parseBundle(JSON.stringify(data.bundle)); next = appendBundle(legacy[0].bundle, incoming); } catch { throw new HttpError(400, 'Invalid records or conflicting history. Validate your export locally.'); }
        if (next.investigations?.length) {
          try { await read('investigation_revisions', `org_id=eq.${org}&select=revision&limit=1`); }
          catch { throw new HttpError(503, 'Investigation storage is unavailable. Ask your administrator to verify the Stage 7 migration and access. Your draft is retained.'); }
        }
        return json(await rpc('save', org, user.id, { expected_version: data.expected_version, request_id: string(data.request_id), body_hash: hash(JSON.stringify(incoming)), bundle: next }));
      }
      if (!['owner','admin'].includes(members[0].role)) throw new HttpError(403, 'Administrator access required.');
      if (lifecycle && ['invite','credential','member','delete_org'].includes(path[2]) && !recentAuthentication(token)) throw new HttpError(403,'Sign out and sign in again before changing sensitive account access. Save your draft first.');
      if (['pilot-plan','pilot-review'].includes(path[2])) {
        let validated;
        try { validated = path[2] === 'pilot-plan' ? validatePilotPlan(data) : validatePilotReview(data); }
        catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Invalid pilot measurement.'); }
        return json(await pilot(path[2] === 'pilot-plan' ? 'create' : 'review', org, user.id, validated));
      }
      if (path[2] === 'invite' || path[2] === 'credential') {
        const action = path[2], secret = `${action === 'invite' ? 'ui' : 'uc'}_${randomBytes(32).toString('hex')}`;
        const params: Record<string, unknown> = { token_hash: hash(secret) };
        if (action === 'invite') {
          params.email = string(data.email, 254);
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.email as string) || !['admin','engineer','operator','internal_viewer','member','viewer'].includes(String(data.role))) throw new HttpError(400, 'Choose a valid email and role.');
          params.role = data.role;
        } else params.robot_id = string(data.robot_id);
        return json({ ...await rpc(action, org, user.id, params), token: secret });
      }
      if (['revoke_invite','revoke_credential'].includes(path[2])) return json(await rpc(path[2], org, user.id, { id: id(data.id) }));
      if (path[2] === 'member') {
        if (!['owner','admin','engineer','operator','internal_viewer','member','viewer','remove'].includes(String(data.role))) throw new HttpError(400, 'Invalid role.');
        return json(await rpc('member', org, user.id, { user_id: id(data.user_id), role: data.role }));
      }
      if (path[2] === 'delete_org') return json(await rpc('delete_org', org, user.id, { confirmation: id(data.confirmation) }));
      throw new HttpError(404, 'Not found.');
    } catch (error) {
      return json({ error: error instanceof HttpError ? error.message : 'Request could not be completed.' }, error instanceof HttpError ? error.status : 500);
    }
  };
}
