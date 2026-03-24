# Clerk Authentication Setup

This app uses [Clerk](https://clerk.com) for authentication. Clerk provides a modern, secure authentication system with support for multiple providers (Google, email/password, magic links, etc.).

## Setup Steps

### 1. Create a Clerk Account

1. Go to [https://dashboard.clerk.com](https://dashboard.clerk.com)
2. Sign up and create a new application
3. Note down your **Publishable Key** and **Secret Key**

### 2. Configure Environment Variables

Add these to your `.env` file:

```bash
CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

For production, use your production keys from Clerk dashboard.

### 3. Configure Access (Organization-Based)

Access is app-managed in the database (not environment email allowlists).

Run migrations:

```bash
npm run migrate-events
npm run migrate-organizations
```

**How it works:**
- Sign-in is still handled by Clerk.
- Users create one organization (owner = organizer).
- Organizer can create one event for that organization (current plan limit).
- Organizer can invite staff by email.
- Staff access is scoped to events in their organization memberships.

### 4. Configure Clerk Dashboard

#### Allowed Redirect URLs

In Clerk Dashboard → Configure → SSO Callback URLs:

Add your redirect URLs:
- Development: `http://localhost:4321`
- Production: `https://your-domain.com`

#### Configure Social Providers (Optional)

To enable Google sign-in:

1. In Clerk Dashboard → User & Authentication → Social Providers
2. Enable Google
3. Configure your Google OAuth credentials (or use Clerk's shared credentials)

To add more providers (Microsoft, GitHub, etc.):
- Toggle them on in the same Social Providers section

#### Configure Email/Password (Optional)

In Clerk Dashboard → User & Authentication → Email, Phone, Username:
- Toggle "Email address" and "Password" as needed

### 5. Configure Email Templates (Optional)

Clerk handles all auth emails (verification, password reset, etc.).

In Clerk Dashboard → Configure → Emails:
- Customize email templates
- Configure your SendGrid/Resend/SMTP for sending

### 6. Organizer welcome email (Clerk webhook)

When a new Clerk user is created, the app can send a **Resend** welcome email with a link to `/onboarding/organization` (create your first org). This is separate from Clerk’s own verification emails.

1. **Database:** add the dedupe column (once per environment):

   ```bash
   pnpm run migrate-organizer-welcome-email
   ```

2. **Environment:** set `CLERK_WEBHOOK_SIGNING_SECRET` to the **Signing Secret** from Clerk (starts with `whsec_`). Set `RESEND_API_KEY` and `FROM_EMAIL` as for other transactional mail. For correct links in the email when the webhook runs without a browser request, set **`APP_URL`** (or rely on `VERCEL_URL` on Vercel).

3. **Clerk Dashboard → Webhooks:** add an endpoint:

   - **URL:** `https://<your-production-domain>/api/clerk/welcome` (local testing: use a tunnel such as ngrok and point Clerk at `https://<tunnel>/api/clerk/welcome`).
   - **Subscribe to events:** `user.created` (you can leave other events unsubscribed; the handler ignores them).
   - **Development vs Production:** In the Clerk dashboard, switch the **instance** (Development / Production) to match where users sign up. A user created on your live site (`pk_live_…`) only triggers **Production** webhooks. Signing up on `localhost` with `pk_test_…` only triggers **Development** webhooks — and Clerk **cannot** call `http://localhost`; use ngrok (or similar) so the endpoint URL is public HTTPS.

4. **Quick check:** Open `GET https://<your-domain>/api/clerk/welcome` in a browser. You should see JSON with `signingSecretConfigured: true` once `CLERK_WEBHOOK_SIGNING_SECRET` is set on the server.

   **Vercel:** Do not use `/api/webhooks/…` for this app. On Vercel, paths under `/api/webhooks/*` can return **404** (`NOT_FOUND`) even when other API routes work; this project uses `/api/clerk/welcome` instead.

5. **Note:** Staff who sign up via an invitation also receive this email; the template tells them to use their invite link if they were invited. Welcome email is sent at most once per user (`users.organizer_welcome_sent_at`).

## Access Control Model

The app supports membership-based access:

| Membership role | Access |
|------|--------|
| `organizer` | Organization management, event management, imports/exports, email workflows |
| `staff` | Dashboard + scanner access for events in their organization |
| `none` | Signed in but no org/membership yet; prompted to create org or accept invite |

## Migrating from auth-astro/Google OAuth

If you're migrating from the previous Google OAuth setup:

1. **Environment variables**: Replace `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `AUTH_URL` with `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`

2. **Authorization model**: Replace env email role lists with organization + membership records in app DB

3. **Login flow**: Users now see Clerk's sign-in component (with email + optional social providers) instead of Google-only

4. **Benefits you get:**
   - Multiple auth providers (not just Google)
   - Email/password option
   - Magic links
   - Built-in email verification
   - Better security (Clerk handles sessions)
   - User management dashboard

## Troubleshooting

### "Authentication required" errors

- Check that `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are set correctly
- Verify keys match your Clerk application (test vs production)

### User can sign in but cannot access dashboard/scanner

- Check whether the user created an organization or accepted an invitation.
- Organizer onboarding is at `/onboarding/organization`.
- Invitations are accepted at `/invite/accept?token=...`.

### Sign-in page not redirecting after login

- Check that the `redirectUrl` in the SignIn component matches your app structure
- Default is `/admin` for successful sign-ins

### Existing Clerk users during migration

No manual edits are required in Clerk user records.

- Existing users can keep their same Clerk account.
- App ownership/membership is derived from local DB records keyed by Clerk `userId` and email.

## Resources

- [Clerk Astro SDK Docs](https://clerk.com/docs/references/astro/overview)
- [Clerk Dashboard](https://dashboard.clerk.com)
- [Clerk Social Providers](https://clerk.com/docs/authentication/social-connections/oauth)
