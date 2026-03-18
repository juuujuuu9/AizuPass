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
