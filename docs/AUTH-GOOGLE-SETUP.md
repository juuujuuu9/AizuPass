# Authentication Setup

> **Note:** This project has migrated from Google OAuth (auth-astro) to [Clerk](https://clerk.com) for authentication.
>
> Clerk provides multiple auth providers, better security, and a modern user experience.

## Current Setup

See **[AUTH-CLERK-SETUP.md](./AUTH-CLERK-SETUP.md)** for the current authentication setup.

## Migration Notes

If you were using the previous Google OAuth setup, here are the key changes:

### Environment Variables (Old → New)

| Old (auth-astro) | New (Clerk) |
|------------------|-------------|
| `AUTH_SECRET` | No longer needed (Clerk handles this) |
| `AUTH_TRUST_HOST` | No longer needed |
| `GOOGLE_CLIENT_ID` | No longer needed (configure in Clerk dashboard instead) |
| `GOOGLE_CLIENT_SECRET` | No longer needed (configure in Clerk dashboard instead) |
| `AUTH_URL` | No longer needed |
| `NEXTAUTH_URL` | No longer needed |
| — | `CLERK_PUBLISHABLE_KEY` (required) |
| — | `CLERK_SECRET_KEY` (required) |

### Access Control (Updated)

Use role email lists to control access:

```bash
ADMIN_EMAILS=admin@example.com
# Optional scanner allowlist. If omitted, authenticated non-admin users are scanners by default.
SCANNER_EMAILS=scanner1@example.com,scanner2@example.com
```

### Benefits of Clerk

1. **Multiple providers**: Not just Google - add Microsoft, GitHub, email/password, magic links
2. **Better UX**: Modern sign-in/sign-up components
3. **User management**: Dashboard to view/manage users
4. **Built-in security**: Sessions, CSRF, email verification handled automatically
5. **Organization support**: Built-in organization/team features if needed later

## Historical Context

The original implementation used:
- `auth-astro` package with Google OAuth provider
- Auth.js (NextAuth) for session management
- Custom middleware with `getSession` from auth-astro

This was replaced with Clerk in 2026 for improved flexibility and maintainability.
