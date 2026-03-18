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

### 3. Configure Staff Access (Role-Based)

The app uses environment variables to control who can sign in:

```bash
# Optional: restrict who can log in
STAFF_EMAILS=admin@yourdomain.com,staff@yourdomain.com
ADMIN_EMAILS=admin@yourdomain.com
STAFF_DOMAINS=yourdomain.com  # Auto-approve anyone @yourdomain.com
```

**How it works:**
- If no allowlist is set, any authenticated user gets "staff" role
- If `ADMIN_EMAILS` is set, those users get "admin" role
- If `STAFF_EMAILS` is set, those users get "staff" role
- If `STAFF_DOMAINS` is set, anyone with that domain gets "staff" role

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

## Role-Based Access Control

The app supports three roles:

| Role | Access |
|------|--------|
| `admin` | Full access: events, attendees, settings, exports |
| `staff` | General staff: check-in, view attendees |
| `scanner` | Check-in only: scanner page only |

**Note:** Currently, the role is determined by email allowlist, not by Clerk's organization roles. This keeps staff management simple via environment variables.

## Migrating from auth-astro/Google OAuth

If you're migrating from the previous Google OAuth setup:

1. **Environment variables**: Replace `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `AUTH_URL` with `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`

2. **Staff emails**: Your existing `STAFF_EMAILS`, `ADMIN_EMAILS`, and `STAFF_DOMAINS` work exactly the same way

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

### User can't access admin/scanner pages

- Check that the user's email is in `STAFF_EMAILS`, `ADMIN_EMAILS`, or matches `STAFF_DOMAINS`
- The email must match exactly (case-insensitive)

### Sign-in page not redirecting after login

- Check that the `redirectUrl` in the SignIn component matches your app structure
- Default is `/admin` for successful sign-ins

### Want to use Clerk's organization/role features instead?

The current implementation uses environment variables for simplicity. To use Clerk's built-in roles:

1. Update `src/middleware.ts` to read roles from Clerk's session claims
2. Update `src/lib/staff.ts` to check Clerk roles instead of email allowlist

## Resources

- [Clerk Astro SDK Docs](https://clerk.com/docs/references/astro/overview)
- [Clerk Dashboard](https://dashboard.clerk.com)
- [Clerk Social Providers](https://clerk.com/docs/authentication/social-connections/oauth)
