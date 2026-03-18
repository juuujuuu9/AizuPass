# Sentry Error Monitoring Setup (Optional)

Sentry provides real-time error tracking and performance monitoring. This is optional but highly recommended for production.

## Why Add Sentry?

- **Real-time alerts** when errors occur
- **Stack traces** with source maps for debugging
- **Performance monitoring** to identify slow API calls
- **Release tracking** to correlate errors with deployments

## Free Tier (Sentry Developer Plan)

- 5,000 errors/month
- 10M spans/month (performance)
- Unlimited projects
- 30-day data retention

Sufficient for investor demos and small events.

## Setup Instructions

### 1. Create Sentry Account

1. Go to [sentry.io](https://sentry.io) and sign up
2. Create a new project: **React** or **Node.js**
3. Copy your **DSN** (looks like: `https://xxx@yyy.ingest.sentry.io/zzz`)

### 2. Install Sentry SDK

```bash
npm install @sentry/astro
```

### 3. Add Environment Variables

Add to your `.env` file and Vercel dashboard:

```bash
SENTRY_DSN=https://xxx@yyy.ingest.sentry.io/zzz
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=1.0.0  # Or use git SHA
```

### 4. Configure Sentry in Astro

Create `sentry.client.config.js`:

```javascript
import * as Sentry from '@sentry/astro';

Sentry.init({
  dsn: import.meta.env.PUBLIC_SENTRY_DSN,
  environment: import.meta.env.PUBLIC_SENTRY_ENVIRONMENT,
  release: import.meta.env.PUBLIC_SENTRY_RELEASE,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 0.1, // 10% of transactions for performance monitoring
});
```

### 5. Add Server-Side Error Tracking

For API routes, add to `src/lib/errors.ts`:

```typescript
import * as Sentry from '@sentry/node';

export function captureAPIError(error: Error, context: { endpoint: string; ip?: string }) {
  if (process.env.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      scope.setTag('endpoint', context.endpoint);
      if (context.ip) scope.setUser({ ip_address: context.ip });
      Sentry.captureException(error);
    });
  }
  // Always log to console as fallback
  console.error(`[${context.endpoint}]`, error);
}
```

### 6. Update API Routes to Use Sentry

Example in `src/pages/api/attendees.ts`:

```typescript
import { captureAPIError } from '../../lib/errors';

export const POST: APIRoute = async ({ request }) => {
  try {
    // ... existing code ...
  } catch (err) {
    captureAPIError(err as Error, { endpoint: '/api/attendees', ip: getClientIp(request) });
    // ... return error response ...
  }
};
```

### 7. Configure Source Maps

Add to `astro.config.mjs`:

```javascript
export default defineConfig({
  // ... existing config ...
  vite: {
    build: {
      sourcemap: true, // Enable source maps for Sentry
    },
  },
});
```

### 8. Test Sentry Integration

Add a test error endpoint (remove after testing):

```typescript
// src/pages/api/test-error.ts
import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  throw new Error('Test error for Sentry');
};
```

Visit `/api/test-error` and check Sentry dashboard for the error.

## Without Sentry (Console Logging)

If you skip Sentry, ensure you have good console logging:

```typescript
// In your error handlers
console.error('[API Error]', {
  endpoint: '/api/attendees',
  timestamp: new Date().toISOString(),
  error: err.message,
  stack: err.stack,
});
```

View logs in Vercel dashboard: **Project > Logs**

## Sentry vs Console Logging

| Feature | Sentry | Vercel Logs |
|---------|--------|-------------|
| Real-time alerts | Yes | No |
| Stack traces | Yes | Partial |
| Error grouping | Yes | No |
| Performance | Yes | Basic |
| Cost | Free tier | Free |

## Recommendation

**For investor demos:** Start with Vercel logs only. Add Sentry if you have time before the demo - it shows investors you take monitoring seriously.

**For production:** Definitely add Sentry before going live with real users.

## Disabling Sentry

If you need to disable Sentry temporarily, just remove `SENTRY_DSN` from environment variables. The SDK will automatically become a no-op.
