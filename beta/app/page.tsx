'use client';
import { useEffect, useState } from 'react';
import Workspace from '../../app/local/workspace';
import AccountEntry from './account-entry';
import PilotPanel from './pilot-panel';
import HistoryPanel from './history-panel';
import ProjectPanel, { ClientProjects } from './project-panel';
import MachinePanel from './machine-panel';
import LifecyclePanel from './lifecycle-panel';
import IntegrationPanel from './integration-panel';
import type { Bundle } from '../../lib/local/records';

type Membership = { org_id: string; role: string; organizations: { name: string } };
type Loaded = { version: number; bundle: Bundle; role: string; updated_at?: string; incremental?: boolean; historyOnly?: boolean };
let renewal: Promise<boolean> | null = null;
async function api(path: string, body?: unknown) {
  const send=()=>fetch(`/api/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  let response=await send();
  if(response.status===401 && !['logout','auth-session'].includes(path)){
    renewal ??= fetch('/api/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store'}).then(r=>r.ok).catch(()=>false).finally(()=>{renewal=null;});
    if(await renewal)response=await send();
  }
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Request failed.'); return data;
}
export default function Page() {
  const [session, setSession] = useState<{ user: { id: string; email: string }; memberships: Membership[] } | null>(null);
  const [org, setOrg] = useState(''), [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [available, setAvailable] = useState(false), [checked, setChecked] = useState(false);
  const [secret, setSecret] = useState('');
  const [passwordSetup, setPasswordSetup] = useState(false);
  const [contextRevision, setContextRevision] = useState(0);
  const [googleAvailable,setGoogleAvailable]=useState(false);
  const [projectsAvailable,setProjectsAvailable]=useState(false);
  const [machinesAvailable,setMachinesAvailable]=useState(false);
  const [lifecycleAvailable,setLifecycleAvailable]=useState(false);
  const [portalAvailable,setPortalAvailable]=useState(false);
  const [connectorsAvailable,setConnectorsAvailable]=useState(false);
  const [members, setMembers] = useState<{ user_id: string; role: string }[]>([]);
  const [access, setAccess] = useState<{ invitations: { id: string; email: string; role: string; revoked_at: string | null; used_at: string | null }[]; credentials: { id: string; robot_id: string; revoked_at: string | null }[] }>({ invitations: [], credentials: [] });
  async function refreshSession() { const s = await api('session'); setSession(s); }
  useEffect(() => {
    const query=new URLSearchParams(window.location.search);
    if(query.has('auth_error')){setError('Google sign-in was cancelled, expired, or needs account approval. Sign in with your existing password and use Account access to approve Google.');window.history.replaceState(null,'',window.location.pathname);}
    void api('auth-options').then(o=>{setGoogleAvailable(o.google);setProjectsAvailable(o.projects);setMachinesAvailable(o.machines);setLifecycleAvailable(o.executions);setPortalAvailable(o.portal);setConnectorsAvailable(o.connectors);}).catch(()=>{});
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const access = fragment.get('access_token'), kind = fragment.get('type');
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    void api('status').then(async () => {
      setAvailable(true);
      if (fragment.has('error')) throw new Error('This email link is invalid or expired. Request a new confirmation or reset link.');
      if (access) {
        await api('auth-session', { access_token: access });
        if (kind === 'recovery' || kind === 'invite') setPasswordSetup(true);
        else await refreshSession();
      } else await refreshSession().catch(() => {});
    }).catch(e => setError(e.message)).finally(() => setChecked(true));
  }, []);
  async function action(work: () => Promise<void>) { setBusy(true); setError(''); setMessage(''); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'Request failed.'); } finally { setBusy(false); } }
  async function openOrganization(id: string) {
    if (loaded && !window.confirm('Export any unsaved draft before switching or reloading. Continue?')) return;
    // Clear the prior organization immediately; no old rows under a new heading.
    setLoaded(null); setOrg(id); setSecret(''); setMembers([]); setAccess({ invitations: [], credentials: [] });
    if (!id) return;
    const next = await api(`org/${id}/workspace`);
    setLoaded(next);
    if (['owner','admin'].includes(next.role)) { setMembers(await api(`org/${id}/members`)); setAccess(await api(`org/${id}/access`)); }
  }
  const fields = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); return new FormData(event.currentTarget); };
  return <><header className="beta-bar"><strong>Tavrik <span>PRIVATE BETA</span></strong>{session && <button disabled={busy} onClick={() => { if (window.confirm('Export or save any draft before signing out. Continue?')) void action(async () => { await api('logout', {}); setSession(null); setLoaded(null); setOrg(''); setSecret(''); setPasswordSetup(false); }); }}>Sign out</button>}</header>
    <div className="beta-controls" role={session && !passwordSetup ? 'region' : undefined} aria-label={session && !passwordSetup ? 'Account and organization' : undefined}>
      {!session || passwordSetup ? <AccountEntry key={passwordSetup ? 'password' : 'login'} available={available} googleAvailable={googleAvailable} initialMode={passwordSetup ? 'password' : 'login'} onSignedIn={refreshSession} onPasswordSaved={() => { setSession(null); setLoaded(null); setOrg(''); setPasswordSetup(false); setMessage('Password saved. Sign in with your new password.'); }} /> : <>
        <p>{session.user.email}</p><div className="beta-actions"><a href="/demo">Explore demo</a><button disabled={busy} onClick={() => { if (window.confirm('Save or export your draft before changing your password. Continue?')) setPasswordSetup(true); }}>Change password</button></div><label>Organization<select disabled={busy} value={org} onChange={e => void action(() => openOrganization(e.target.value))}><option value="">Choose an organization</option>{session.memberships.map(m => <option key={m.org_id} value={m.org_id}>{m.organizations.name} Â· {m.role}</option>)}</select></label>
        {org && <div className="beta-actions"><button disabled={busy} onClick={() => void action(() => openOrganization(org))}>Reload saved records</button><a href={`/api/org/${org}/export`}>Export saved records</a></div>}
        {!session.memberships.length && <p>Your account is ready. To join your team, open Accept an invitation below and paste the token your team owner shared. You can explore the demo while you wait.</p>}
        {!!session.memberships.length && !org && <p>Choose an organization to load its saved records. The public showcase and local tab drafts are separate; import an exported draft here, then save it.</p>}
        {loaded && <p role="status">Saved version: {loaded.version}. {loaded.version === 0 ? 'No successful save yet.' : loaded.updated_at && Number.isFinite(Date.parse(loaded.updated_at)) ? <>Last successful organization save: <time dateTime={loaded.updated_at}>{new Date(loaded.updated_at).toLocaleString()}</time>.</> : 'Last successful save time unavailable.'} Draft edits are not included until saved.</p>}
        {loaded && !loaded.historyOnly && !loaded.bundle.records.robots.length && <p>{loaded.role === 'viewer' ? 'No saved robots yet. Ask an organization owner or member to add and save records.' : 'This organization has no saved robots. Add a robot below or import approved JSON, then choose Save to organization.'}</p>}
        <details><summary>Accept an invitation</summary><form onSubmit={e => { const d = fields(e); void action(async () => { await api('accept-invite', { token: d.get('token') }); await refreshSession(); setMessage('Invitation accepted. Choose the organization.'); }); }}><label>Invitation token<input name="token" required autoComplete="off" type="password" /></label><button disabled={busy}>Accept invitation</button></form></details>
        {googleAvailable && <details><summary>Account access</summary><p>Approve Google for this existing account. Save or export your draft first. Use the Google account with the same verified email; this does not grant new organization access.</p><form onSubmit={e=>{const data=fields(e);void action(async()=>{const result=await api('link-google',{password:data.get('password')});window.location.assign(result.url);});}}><label>Current password<input name="password" type="password" autoComplete="current-password" required /></label><button disabled={busy}>Approve Google sign-in</button></form></details>}
        {loaded && ['owner','admin'].includes(loaded.role) && <details><summary>Manage team and collector access</summary><p>Organization ID: <code>{org}</code>. Tokens are shown once. Share them securely; Tavrik does not send invitations.</p>
          <form onSubmit={e => { const d = fields(e); void action(async () => { const result = await api(`org/${org}/invite`, { email: d.get('email'), role: d.get('role') }); setSecret(result.token); setAccess(await api(`org/${org}/access`)); }); }}><label>Invite email<input name="email" type="email" required /></label><label>Role<select name="role"><option value="member">Member â€” add records</option><option value="viewer">Viewer â€” read and export</option></select></label><button disabled={busy}>Create invitation</button></form>
          <form onSubmit={e => { const d = fields(e); void action(async () => { const result = await api(`org/${org}/credential`, { robot_id: d.get('robot') }); setSecret(result.token); setAccess(await api(`org/${org}/access`)); }); }}><label>Collector robot<select name="robot" required>{loaded.bundle.records.robots.map(r => <option value={r.id} key={r.id}>{r.name}</option>)}</select></label><button disabled={busy || !loaded.bundle.records.robots.length}>Create collector credential</button></form>
          {secret && <label>New token â€” copy now<textarea readOnly value={secret} rows={3} /><button onClick={() => setSecret('')}>Hide token</button></label>}
          <h2>Invitations</h2>{access.invitations.map(i => <p key={i.id}>{i.email} Â· {i.role} Â· {i.used_at ? 'Accepted' : i.revoked_at ? 'Revoked' : 'Pending'} <button disabled={busy || !!i.revoked_at || !!i.used_at} onClick={() => void action(async () => { await api(`org/${org}/revoke_invite`, { id: i.id }); setAccess(await api(`org/${org}/access`)); })}>Revoke invitation</button></p>)}
          <h2>Collectors</h2>{access.credentials.map(c => <p key={c.id}>{c.robot_id} Â· {c.revoked_at ? 'Revoked' : 'Issued'} <button disabled={busy || !!c.revoked_at} onClick={() => void action(async () => { await api(`org/${org}/revoke_credential`, { id: c.id }); setAccess(await api(`org/${org}/access`)); })}>Revoke credential</button></p>)}
          <h2>Members</h2>{members.map(m => <form key={m.user_id} onSubmit={e => { const d = fields(e); if (m.user_id === session.user.id && !window.confirm('Changing your own access closes this workspace. Save or export any draft first. Continue?')) return; void action(async () => { await api(`org/${org}/member`, { user_id: m.user_id, role: d.get('role') }); if (m.user_id === session.user.id) { setLoaded(null); setOrg(''); setSecret(''); await refreshSession(); } else setMembers(await api(`org/${org}/members`)); }); }}><label>{m.user_id}<select name="role" defaultValue={m.role}><option>owner</option><option>admin</option><option>engineer</option><option>operator</option><option>internal_viewer</option><option>member</option><option>viewer</option><option value="remove">Remove access</option></select></label><button disabled={busy}>Update member</button></form>)}
          <details><summary>Delete organization</summary><p>Export first. This deletes all organization records, invitations, credentials and audit history. Provider backups follow the documented retention policy.</p><form onSubmit={e => { const d = fields(e); if (window.confirm('Permanently delete this organization and all its records?')) void action(async () => { await api(`org/${org}/delete_org`, { confirmation: d.get('confirmation') }); setLoaded(null); setOrg(''); setSecret(''); await refreshSession(); setMessage('Organization deleted.'); }); }}><label>Type the organization ID<input name="confirmation" required /></label><button disabled={busy}>Delete organization permanently</button></form></details>
        </details>}
      </>}
      {loaded?.role === 'owner' && !passwordSetup && <PilotPanel key={org} org={org} api={api} />}
      {machinesAvailable && loaded && ['owner','admin'].includes(loaded.role) && !passwordSetup && <MachinePanel key={org+':'+loaded.role} org={org} api={api}/>}
      {connectorsAvailable && loaded && ['owner','admin'].includes(loaded.role) && !passwordSetup && <IntegrationPanel key={org+':'+loaded.role} org={org} api={api}/>}
      {lifecycleAvailable && loaded && !passwordSetup && <LifecyclePanel key={org+':'+loaded.role} org={org} api={api} canPublish={portalAvailable&&['owner','admin','engineer','member'].includes(loaded.role)}/>}
      {projectsAvailable && session && !passwordSetup && <ClientProjects key={session.user.id} api={api} />}
      {projectsAvailable && loaded && !passwordSetup && !['viewer','internal_viewer'].includes(loaded.role) && <ProjectPanel key={org+':'+loaded.role} org={org} role={loaded.role} api={api} robots={loaded.bundle.records.robots} runs={loaded.bundle.records.runs} />}
      {loaded?.incremental && !passwordSetup && <HistoryPanel key={org} org={org} api={api} open={bundle=>{setLoaded({...loaded,bundle,historyOnly:false});setContextRevision(n=>n+1);}} />}
      {loaded?.historyOnly && <p role="status">Your saved history exceeds the local draft size. Browse it above, or import a bounded batch below. The empty draft does not mean saved records were deleted.</p>}
      {checked && !available && <p>The private workspace is unavailable. Ask your administrator to complete staging setup. The public showcase contains synthetic examples and does not display organization records.</p>}
      {busy && <p role="status">Workingâ€¦</p>}{message && <p role="status">{message}</p>}{error && <p role="alert" className="beta-error">{error}</p>}
    </div>
    {loaded && !passwordSetup && <Workspace key={org + ':' + loaded.version + ':' + contextRevision} hosted={{ initial: loaded.bundle, readOnly: ['viewer','internal_viewer','operator'].includes(loaded.role), comparison: async (runId, baselineId) => { await api(`org/${org}/pilot-comparison`, { runId, baselineId }); }, save: async (bundle, requestId) => {
      setBusy(true);
      try {
      const result = await api(`org/${org}/save`, { bundle, expected_version: loaded.version, request_id: requestId });
      const fresh = await api(`org/${org}/workspace`);
      if (fresh.version < result.version) throw new Error('Could not confirm saved records. Retry with the same draft.');
      setLoaded(fresh);
      } finally { setBusy(false); }
    } }} />}
  </>;
}
