# B3 account lifecycle

Implements [B3](backend-master-prompts.md) under [build.md](../build.md) sections 7 and 10. Existing Auth users, passwords, memberships and records are preserved. Google login does not authorize CAD or grant organization membership.

## Behavior and deployment

Apply `20261022211750_b3_account_lifecycle.sql` after B2 and deploy the matching server with `BETA_AUTH_LIFECYCLE=true`. Existing email-only sessions are grandfathered at migration; linked-Google sessions must sign in again. Do not deploy the old authentication handler after this migration: new sessions must receive application approval before RLS will expose records.

Password login creates a protected application-session approval after verifying the Auth user. Access and rotating refresh tokens are stored only in HttpOnly cookies; HTTPS uses Secure. JSON responses contain no tokens. The browser renews an expired session through a same-origin POST and retries once; concurrent renewals within the tab share one request. Email links create bounded sessions and require a verified email; OAuth tokens cannot enter through that adapter. Password changes revoke all application-session approvals and request global Auth sign-out. Logout clears cookies, revokes the active approval and signs out with Auth, including when only the refresh cookie remains. Upstream outages can leave remote sign-out unconfirmed; the browser is still cleared.

Google uses a ten-minute signed HttpOnly SameSite=Lax PKCE verifier cookie, a fixed callback and a fixed return to `/`. Supplied `next` destinations are ignored. Expired, cancelled, malformed or mismatched callbacks return a generic recoverable sign-in message. Provider access/refresh tokens are discarded; only the Supabase application session is retained. Rotating the server secret invalidates outstanding verifier cookies, requiring a new sign-in attempt.

Supabase itself can automatically link equal-email identities. Tavrik therefore maintains protected Google-identity approvals and application-session approvals. A newly linked Google identity on an existing email account cannot access records until the user signs in with the existing password and uses **Account access → Approve Google sign-in**. The callback must return the same Auth user. This release supports approval for the same verified email, not arbitrary cross-account merging. No email domain grants access. Google-only new accounts still need an invitation. Direct PostgREST RLS also requires the approved session; using an unapproved OAuth JWT directly does not bypass this check.

Memberships are checked on every request and database page. Sensitive invitations, new credentials, ownership/member changes and organization deletion require authentication within the previous ten minutes; refresh does not reset that authentication age. This is recent-authentication enforcement, not an MFA claim.

## Manual Google setup and acceptance

The current hosted provider is **disabled**, confirmed through Auth settings. Do not paste a client secret into chat or source files.

1. In Google Cloud, configure an OAuth web application and consent screen for the intended test audience. Use only basic OpenID/email/profile scopes. Add the Supabase redirect URI: `https://wdwtscztkpqkejkovkob.supabase.co/auth/v1/callback`.
2. In the selected Supabase project's Authentication → Providers → Google, enter the client ID/secret securely and enable Google. Configure only the intended test audience; do not enable general registration without the existing signup decision.
3. In Supabase Authentication → URL Configuration, allow the exact application callback `http://127.0.0.1:3002/api/oauth-callback` for this loopback environment. Add the corresponding exact HTTPS callback only when a private host is chosen. Keep recovery/confirmation redirect setup aligned with the existing account guide.
4. Set `BETA_GOOGLE_ENABLED=true` in the protected beta environment and restart/reload the beta server. The Google button appears only when this application flag is enabled.
5. Test actual provider success and cancellation. For an existing email account, first verify unapproved Google login is refused, then sign in by password and explicitly approve Google. Verify the same organization access after relogin, a mismatched Google account is rejected, and removed membership stays removed. Test session expiry/renewal and sign-out. Record results; mocked callbacks cannot establish this acceptance.

Use the [official Google setup guide](https://supabase.com/docs/guides/auth/social-login/auth-google), [identity-linking behavior](https://supabase.com/docs/guides/auth/auth-identity-linking) and [server-session guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide). Supabase's automatic linking behavior is why Tavrik adds an application approval boundary.

Actual mail delivery, Google consent verification, production redirect/TLS setup, managed recovery and customer hosting remain separate gates. No Google or SMTP credentials were invented, no email was sent, and no production access is implied.
