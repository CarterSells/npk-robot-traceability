# Account access and passwords

The beta now includes Create account, Sign in, Forgot password, Resend confirmation email, email-link handling and Change password. The same server provides a no-sign-in editable demo at `/demo`. This implements the founder's October 18 request for easier access; it does not complete public deployment or customer-hosting gates in [build.md](../build.md).

## User flow

Open http://127.0.0.1:3002. Choose **New here? Create an account**, enter your email and a unique password of at least 8 characters, confirm it, and submit. Open the confirmation email on the PC running the app. The link returns to the app; verified users can access only their existing memberships. Registration does not create an organization or grant an owner role.

Administrator-prepared accounts sign in with their assigned password after email verification. **Resend confirmation email** uses the email entered in the form. **Forgot password?** sends a reset link. The signed-in **Change password** button also opens password setup. Save/export drafts first; completing a password change signs you out. Password managers and paste work; forms have show/hide controls and matching-password validation. Do not put passwords in chat or bug reports.

After sign-in, choose an organization. Without membership, use **Accept an invitation** with the token shared by the team owner. Organization invitation tokens are separate from Supabase email confirmation; Tavrik does not automatically email these tokens.

Use **Try the demo without signing in** to load synthetic examples or create test robots. Drafts stay in that browser tab until exported; this demo does not save to an organization's hosted workspace.

## Provider setup required

In the project's [Auth settings](https://supabase.com/dashboard/project/wdwtscztkpqkejkovkob/auth/providers), enable email signup, keep email confirmation enabled, and set the provider's minimum password length to **8** to match the app. Earlier activation disabled signup. Screens and server validation alone do not change provider settings; the provider minimum has not been verified in this task.

In [URL configuration](https://supabase.com/dashboard/project/wdwtscztkpqkejkovkob/auth/url-configuration), use site URL `http://127.0.0.1:3002` and allow the exact redirect `http://127.0.0.1:3002/` for this local environment. Preserve other required URLs. The server fixes email redirects to BETA_ORIGIN; it ignores arbitrary client destinations. Use an actual HTTPS origin for a separate public deployment. Localhost email links only work on the PC hosting the app.

Configure [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) for other people's email addresses and production use. Supabase's default service is restricted and rate-limited. A send button does not prove delivery; no SMTP credentials or paid service was supplied. Keep secrets in provider/server configuration.

The implementation follows Supabase's [password flow](https://supabase.com/docs/guides/auth/passwords). Email links return an access-token fragment. The client immediately removes it from the URL and submits it to the same-origin server, which validates the user with Auth before setting a bounded HttpOnly/SameSite cookie. Refresh tokens in the fragment are discarded. Password changes use the user's Auth endpoint, never a client-specified user ID or the administrator endpoint. API success bodies do not return credentials. Signup and link exchange grant no memberships.

Existing sessions require sign-in after expiry. Persistent refresh sessions and Google OAuth are not implemented. If email cannot be sent or a link expires, correct provider setup or request a new link. Never bypass verification for real people to work around email delivery.

See [progress](build-progress.md) for executed tests and activation status. Mocked email flows cannot establish actual inbox delivery. The founder account has owner membership in Synthetic A; user email verification remains pending. No real customer records were introduced.
