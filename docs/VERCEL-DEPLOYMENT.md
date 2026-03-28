# Vercel Deployment Guide

This guide walks you through deploying the QR Code Check-In app to Vercel for production use.

## Prerequisites

- [Vercel account](https://vercel.com/signup) (free tier works)
- [GitHub account](https://github.com) with this repository pushed
- [Clerk account](https://clerk.com) for authentication
- [Neon account](https://neon.tech) for PostgreSQL database
- [Resend account](https://resend.com) for email delivery

## Quick Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/qr-check-in)

## Step-by-Step Deployment

### 1. Push to GitHub

Ensure your code is in a GitHub repository:

```bash
git remote add origin https://github.com/yourusername/qr-check-in.git
git push -u origin main
```

### 2. Connect to Vercel

1. Go to [vercel.com](https://vercel.com) and click "Add New Project"
2. Import your GitHub repository
3. Vercel will auto-detect Astro framework
4. Click "Deploy" (it will fail initially without env vars - that's OK)

### 3. Set Environment Variables

In your Vercel project dashboard, go to **Settings > Environment Variables** and add:

#### Required Variables

| Variable | Value | Source |
|----------|-------|--------|
| `DATABASE_URL` | `postgresql://...` | Neon dashboard → Connection string |
| `CLERK_PUBLISHABLE_KEY` | `pk_live_...` | Clerk dashboard → API Keys |
| `CLERK_SECRET_KEY` | `sk_live_...` | Clerk dashboard → API Keys |
| `RESEND_API_KEY` | `re_...` | Resend dashboard → API Keys |
| `FROM_EMAIL` | `events@yourdomain.com` | Resend verified domain |
| `FROM_NAME` | `Your Event Name` | Your choice |
| `CLERK_WEBHOOK_SIGNING_SECRET` | `whsec_...` | Clerk → Webhooks → your endpoint → **Signing Secret** (`user.created` → organizer welcome email) |

#### Recommended Variables

| Variable | Value | Purpose |
|----------|-------|---------|
| `QR_TOKEN_TTL_DAYS` | `30` | QR validity (days) |
| `DEFAULT_EVENT_SLUG` | `main-event` | Default event identifier |
| `APP_URL` | `https://yourdomain.com` | Canonical site URL: staff invite links, organizer welcome email (`/onboarding/organization`). On Vercel, `VERCEL_URL` is a fallback if unset. |

### 4. Database Setup

Run the database setup script with your production database URL:

```bash
# One-time setup
DATABASE_URL="your-production-db-url" npm run setup-db

# If you have existing data to migrate
DATABASE_URL="your-production-db-url" npm run migrate-events
DATABASE_URL="your-production-db-url" npm run migrate-organizations
DATABASE_URL="your-production-db-url" npm run migrate-qr
DATABASE_URL="your-production-db-url" pnpm run migrate-organizer-welcome-email
```

### 5. Configure Clerk

1. In Clerk dashboard, add your production domain to **Allowed Origins**
2. Configure sign-in/sign-up URLs:
   - Sign-in URL: `/login`
   - Sign-up URL: `/login`
   - After sign-in: `/admin`
   - After sign-up: `/admin`
3. **Webhooks (organizer welcome email):** Add endpoint `https://<your-domain>/api/clerk/welcome`, subscribe to **`user.created`**, copy **Signing Secret** into Vercel as `CLERK_WEBHOOK_SIGNING_SECRET`. See [AUTH-CLERK-SETUP.md](AUTH-CLERK-SETUP.md) §6. (Avoid `/api/webhooks/*` on Vercel — the platform can return **404** for that prefix while `/api/health` still works.)

### 6. Verify Domain in Resend

1. Add and verify your domain in Resend dashboard
2. Update `FROM_EMAIL` to use your verified domain (e.g., `events@yourdomain.com`)
3. For testing without a domain, use `onboarding@resend.dev` (limited to your signup email)

### 7. Redeploy

After setting all environment variables:

1. Go to Deployments tab in Vercel
2. Click the three dots on the latest deployment
3. Select "Redeploy" with "Use existing Build Cache" unchecked

### 8. Verify Deployment

Check the following endpoints:

- `https://yourdomain.com` - Scanner home (standalone check-in UI)
- `https://yourdomain.com/scanner` - Scanner alias (redirects to `/`)
- `https://yourdomain.com/login` - Staff login
- `https://yourdomain.com/admin` - Admin dashboard (requires staff access)
- `https://yourdomain.com/api/health` - Health check
- `https://yourdomain.com/api/clerk/welcome` - Clerk webhook probe (`signingSecretConfigured` in JSON)

## Post-Deployment Checklist

- [ ] Health check returns `{"status":"ok"}`
- [ ] Authenticated users can log in
- [ ] Event creation works in admin (`/admin/events/new`)
- [ ] CSV import creates attendees for selected event
- [ ] QR emails are sent and received
- [ ] Scanner can check in attendees
- [ ] CSV import works in admin

## Free Tier Limits (Vercel)

| Resource | Limit |
|----------|-------|
| Bandwidth | 100 GB/month |
| Function execution | 125K requests/day |
| Build time | 6,000 minutes/month |
| Team members | 1 (you) |

For investor demos and small events, the free tier is sufficient.

## Troubleshooting

### "DATABASE_URL is not set" error
- Double-check the environment variable is set in Vercel dashboard
- Redeploy after setting variables

### Clerk auth not working
- Verify `CLERK_PUBLISHABLE_KEY` starts with `pk_live_` (not `pk_test_`)
- Check your domain is in Clerk's allowed origins
- Ensure `CLERK_SECRET_KEY` is set (not just publishable key)

### Emails not sending
- Verify Resend domain is verified (not pending)
- Check `FROM_EMAIL` matches your verified domain
- For testing, use `onboarding@resend.dev` with your signup email

### QR codes not scanning
- Ensure camera permissions are granted
- Check browser console for errors
- Try the demo codes: `DEMO-SUCCESS`, `DEMO-ALREADY`, `DEMO-INVALID`

## Scaling Considerations

When ready to scale beyond free tier:

1. **Vercel Pro** ($20/month): 1TB bandwidth, 1M function requests/day
2. **Neon Pro** (usage-based): More compute, larger storage
3. **Resend**: Pay per email sent (first 3,000 emails/month free)

For a single event with 500 attendees:
- Vercel free tier: sufficient
- Neon free tier: sufficient (500 rows = negligible)
- Resend: 500 emails well within free tier

## Security Notes

- `BYPASS_AUTH_FOR_TESTS` only works in `NODE_ENV=development` (local dev only)
- Webhook key should be generated with `openssl rand -hex 32`
- Keep `CLERK_SECRET_KEY` and `RESEND_API_KEY` secure - never commit to git
- The app includes rate limiting, but for high-traffic events consider Vercel KV

## Support

For issues:
1. Check health endpoint: `/api/health`
2. Review Vercel function logs in dashboard
3. Check browser console for client-side errors
4. Review Clerk and Resend dashboards for auth/email issues
