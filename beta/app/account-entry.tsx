'use client';
import { useState } from 'react';

type Mode = 'login' | 'signup' | 'recover' | 'password';
export default function AccountEntry({ available, googleAvailable = false, initialMode = 'login', onSignedIn, onPasswordSaved }: { available: boolean; googleAvailable?: boolean; initialMode?: Mode; onSignedIn: () => Promise<void>; onPasswordSaved: () => void }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState(''), [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  function change(next: Mode) { setMode(next); setError(''); setMessage(''); setShow(false); }
  async function submit(path: string, body: unknown) {
    const response = await fetch(`/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to continue. Please try again.'); return data;
  }
  const title = { login: 'Welcome back', signup: 'Create your account', recover: 'Reset your password', password: 'Choose a new password' }[mode];
  return <main className="account-layout"><aside className="account-intro"><p className="account-eyebrow">YOUR ROBOT’S ENGINEERING HISTORY</p><h1>Keep the setup.<br />Understand the changes.</h1><p>Record configurations, compare test runs, and keep the evidence behind every investigation.</p><a href="/demo">Try the demo without signing in →</a><p className="account-note">The demo uses synthetic records. Your team’s saved records stay in its private workspace.</p></aside>
    <div className="account-card"><h2>{title}</h2><p>{mode === 'signup' ? 'Choose a password, confirm your email, then join your team with an invitation.' : mode === 'recover' ? 'We’ll send a link to your email so you can choose a new password.' : mode === 'password' ? 'Use a unique password with at least 8 characters.' : 'Sign in to your team’s saved robot records.'}</p>
      <form key={mode} aria-label={title} onSubmit={async e => {
        e.preventDefault(); const form = e.currentTarget, values = new FormData(form); setError(''); setMessage('');
        const password = values.get('password');
        if (['signup', 'password'].includes(mode) && password !== values.get('confirm')) { setError('The passwords do not match.'); return; }
        setBusy(true);
        try {
          const data = await submit(mode, { email, password });
          form.reset();
          if (mode === 'login') await onSignedIn();
          else if (mode === 'password') { change('login'); onPasswordSaved(); setMessage('Password saved. Sign in with your new password.'); }
          else setMessage(data.message);
        } catch (e) { setError(e instanceof Error ? e.message : 'Unable to continue.'); } finally { setBusy(false); }
      }}>
        {mode !== 'password' && <label>Email<input required name="email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} /></label>}
        {mode !== 'recover' && <><label>Password<input required name="password" type={show ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? undefined : 8} maxLength={1024} aria-describedby={mode === 'login' ? undefined : 'password-help'} /></label>
          {mode !== 'login' && <><p id="password-help" className="account-note">At least 8 characters. A long, unique passphrase works well.</p><label>Confirm password<input required name="confirm" type={show ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={1024} /></label></>}
          <button className="account-text-button" type="button" aria-pressed={show} onClick={() => setShow(!show)}>{show ? 'Hide passwords' : 'Show passwords'}</button></>}
        {error && <p role="alert" className="beta-error">{error}</p>}{message && <p role="status">{message}</p>}
        <button className="account-primary" disabled={busy || !available}>{busy ? 'Please wait…' : { login: 'Sign in', signup: 'Create account', recover: 'Send reset link', password: 'Save password' }[mode]}</button>
      </form>
      {mode==='login' && googleAvailable && <button disabled={busy||!available} onClick={async()=>{setBusy(true);setError('');try{const data=await submit('google',{});window.location.assign(data.url);}catch(e){setError(e instanceof Error?e.message:'Google sign-in unavailable.');setBusy(false);}}}>Continue with Google</button>}
      <div className="account-links">{mode === 'login' ? <><button disabled={busy} onClick={() => change('recover')}>Forgot password?</button><button disabled={busy} onClick={() => change('signup')}>New here? Create an account</button></> : mode !== 'password' && <button disabled={busy} onClick={() => change('login')}>Back to sign in</button>}
        {['signup','login'].includes(mode) && <button disabled={busy || !available || !email} onClick={async () => { setBusy(true); setError(''); try { const d = await submit('resend-confirmation', { email }); setMessage(d.message); } catch(e) { setError(e instanceof Error ? e.message : 'Unable to send confirmation.'); } finally { setBusy(false); } }}>Resend confirmation email</button>}
      </div>
    </div></main>;
}
