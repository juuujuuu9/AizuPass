# Database module layout (`src/lib/db/`)

**Last updated:** 2026-03-22

## Purpose

`src/lib/db.ts` had grown to 1,000+ lines mixing users, organizations, events, attendees, check-in, and staff preferences. This doc describes the **incremental split**: move one domain at a time into `src/lib/db/*.ts`, keep **`@/lib/db` as the public import path**, and avoid big-bang rewrites.

## Current layout

| Module | Responsibility |
|--------|----------------|
| [`src/lib/db/client.ts`](../src/lib/db/client.ts) | Neon SQL client singleton (`getDb`), shared `SqlRow` type. |
| [`src/lib/db/event-row.ts`](../src/lib/db/event-row.ts) | `EventRow` shape and `rowToEvent()` mapper (used by event queries in `db.ts` and org-scoped event listing). |
| [`src/lib/db/organizations.ts`](../src/lib/db/organizations.ts) | Organizations, `organization_memberships`, `organization_invitations`, staff directory, `getEventForOrganization` / `getEventsForOrganization`. |
| [`src/lib/db.ts`](../src/lib/db.ts) | Re-exports everything from `organizations.ts` plus `EventRow` type; users, access helpers, events (by id/slug/user), attendees, check-in, CSV-related attendee ops, `createEventForUser`, staff preferences. |

### Public API (unchanged for callers)

Application code should continue to import from **`@/lib/db`** or **`../../lib/db`**. Example:

```ts
import { getOrganizationById, getAllAttendeesForUser } from '@/lib/db';
```

`db.ts` uses `export * from './db/organizations'` and `export type { EventRow } from './db/event-row'`, so symbols that lived on `db` before the split stay on `db` after.

### Dependency direction

- `db/client.ts` → `env` only.
- `db/event-row.ts` → no DB calls (pure mapping).
- `db/organizations.ts` → `client`, `event-row`.
- `db.ts` → `client`, `event-row`, `organizations` (for `createEventForUser`), `env`.

There is **no** import from `db.ts` into `organizations.ts`, so cycles are avoided.

## How to add the next slice

1. **Pick a domain** you are already modifying (e.g. attendees-only helpers, or check-in).
2. **Create** `src/lib/db/<domain>.ts` that imports `getDb` from `./client` (and shared mappers/types as needed).
3. **Move** functions and their private helpers into that file; keep exports explicit.
4. **Re-export** from `db.ts` with `export * from './db/<domain>'` (or named exports if you need to avoid collisions).
5. **Run** `npm run build` and `npm run test:edge-cases:ci` when DB behavior is touched.
6. **Update** this doc’s table and “Last updated”.

Do **not** require call sites to import subpaths like `@/lib/db/organizations` unless you deliberately want a narrower surface (optional future cleanup).

## Related

- [MASTER-PLAN.md](MASTER-PLAN.md) — concern audit row for `db.ts` split.
- [Master-Bloat-Audit.md](Master-Bloat-Audit.md) — Phase 3 structural backlog.
