# AizuPass

**AizuPass** is multi-event QR check-in for live venues: **organizations and staff** manage guestlists and scan at the door; **attendees** use camera-scanned codes with **no PII in the QR payload** (token-based v2 format). One **Astro** app hosts UI and API routes, deployed to **Vercel**, backed by **PostgreSQL** (e.g. Neon).

---

## Features (current)

### Access and organizations

- **Clerk** authentication (multiple IdPs supported via Clerk).
- **App-managed organizations**, memberships, and **email invitations** (replaces env-based allowlists).
- Constraints aligned with a future paywall: **one organization per organizer**, **one event per organization** (see [`docs/AUTH-CLERK-SETUP.md`](docs/AUTH-CLERK-SETUP.md)).
- Flows: `/onboarding/organization`, `/onboarding/profile` (display name), `/invite/accept`, `/admin/organization` (+ staff, settings, finance pages).

### Events and guestlist

- **Event-scoped attendees**; event selector and filtering across admin and APIs.
- **CSV import** (primary path for most organizers): delimiter auto-detect, UTF-8, row warnings, skipped-row export, **add / merge / replace** modes, batched processing; identity rules (email + name columns). Extra columns map into `source_data`.
- **CSV export**; bulk actions (select, delete, export).
- **Public RSVP** via `POST /api/attendees` (rate-limited, Zod-validated) for unauthenticated registration when enabled by flow.

### Scanner and check-in

- **Camera scanning** (html5-qrcode) with **continuous scan**, debounce, **torch** where supported, **distance hint** (“6–10 inches”).
- **Manual check-in by name** (search by name/email); **atomic** manual path with **409** on duplicate check-in.
- **Traffic-light** feedback (success / already checked in / error), **audio + haptic**, **aria-live**; distinct cues for “already checked in.”
- **Offline**: IndexedDB cache of attendee payloads, **queued check-ins**, sync on reconnect with **retry/backoff**, **visible queue count**, **queue dedupe**; 409 treated as success on replay.
- **Demo QR codes** for training in dev (`DEMO-*`); production requires `ENABLE_DEMO_CODES` and `ENABLE_DEMO_CODES_IN_PRODUCTION`.

### QR and email

- **v2 QR payload** `eventId:entryId:token` (v1 legacy supported for transition); **high error correction**, high-contrast colors.
- **Resend** for transactional and bulk QR email; per-attendee refresh and bulk send from admin.
- **Download QR** in attendee UI (`QRDisplay`, including fullscreen).

### Admin experience

- Dashboard with **stats**, activity, **cmd+K** search (fuse.js), **dark mode**, density toggle, **Radix**-aligned tokens and UI primitives, toasts (sonner).

### Quality and operations

- **Zod** validation on critical inputs; **CSV injection** sanitization on import.
- **Rate** limits on RSVP, webhook, and check-in endpoints (`src/lib/rate-limit.ts`).
- **`GET /api/health`** for uptime checks.
- **CI**: GitHub Actions — `tsc --noEmit`, production build on PRs; **edge-case** script on main when `DATABASE_URL` is configured (see [`docs/qr-edge-cases.md`](docs/qr-edge-cases.md)).
- **Security audit** (2026-03-21): Critical findings addressed — CSRF protection, HTML escaping in emails, IDOR fixes (see [`docs/audit/AUDIT-2026-03-21.md`](docs/audit/AUDIT-2026-03-21.md)).

---

## Technology

| Layer | Stack |
|--------|--------|
| Framework | **Astro 5** (SSR), **React 19** for interactive islands |
| Deploy | **Vercel** (`@astrojs/vercel`) |
| Database | **PostgreSQL** via `@neondatabase/serverless` |
| Auth | **Clerk** (`@clerk/astro`) |
| Email | **Resend** |
| UI | **Tailwind CSS 4**, **Radix** primitives/colors, **lucide-react**, **class-variance-authority**, **tailwind-merge** |
| Scanner / QR | **html5-qrcode**, **qrcode** (generation) |
| Validation | **Zod** |
| Search | **fuse.js** (admin command palette) |

---

## Recent progress

| Date | Milestone |
|------|-----------|
| 2026-03-26 | **Security audit remediation** — Fixed 5 critical issues: CSRF protection re-enabled, email HTML escaping, IDOR vulnerability patched, hardcoded RSVP data removed. See [`docs/audit/AUDIT-2026-03-21.md`](docs/audit/AUDIT-2026-03-21.md). |
| 2026-03-26 | **Public RSVP page** — Added `/rsvp` route for unauthenticated event registration. |

---

## Planned development roadmap

The **single source of truth** for checkboxes, ordering, and concern audit is **[`docs/MASTER-PLAN.md`](docs/MASTER-PLAN.md)**. Below are the strategic highlights:

### Phase 1: Launch readiness
| Priority | Area | Status |
|----------|------|--------|
| **P0** | Production **Resend domain** and `FROM_EMAIL` on owned domain | In progress — [`docs/EMAIL-SENDER-GO-LIVE-CHECKLIST.md`](docs/EMAIL-SENDER-GO-LIVE-CHECKLIST.md) |
| **P0** | Security hardening (audit follow-up) | ✅ Critical issues resolved |
| **P1** | **Zapier / Make** as first-class alongside the HTTP API — [`docs/INTEGRATIONS-STRATEGY.md`](docs/INTEGRATIONS-STRATEGY.md) |

### Phase 2: Door operations & scale
| Priority | Area |
|----------|------|
| **P1** | Hardware **keyboard-wedge** scanner input; offline duplicate protection |
| **P1** | Bulk **QR ZIP** export; **print/badge** layouts; duplicate-name disambiguation |
| **P2** | **No-shows** reporting; live check-in counter (polling vs SSE) |
| **P2** | Pagination on attendee APIs; Neon transaction support for multi-step ops |

### Phase 3: Product expansion
| Priority | Area | Reference |
|----------|------|-----------|
| **P2** | **Event RSVP system** — Per-event customizable forms, theming, custom domains | [`docs/ROADMAP-EVENT-RSVP.md`](docs/ROADMAP-EVENT-RSVP.md) |
| **P3** | Capacity / no-show **analytics** dashboard |
| **P3** | **Apple Wallet** pass support |
| **P3** | Group / +1 check-in flows |

### Technical debt & infrastructure
| Priority | Area |
|----------|------|
| **Ongoing** | `db.ts` modularization; replace in-memory rate limiter with Redis/Vercel KV |
| **Backlog** | Optional **SSE** for multi-staff admin real-time sync |
| **Backlog** | **Export before event wipe** (data retention compliance) |

CSV remains the **default** guestlist path for typical organizers; API and automation are for builders and LC/NC workflows (see integrations strategy).

---

## Requirements

- Node **20+**
- **PostgreSQL** (for example [Neon](https://neon.tech))
- [Clerk](https://clerk.com) (auth)
- [Resend](https://resend.com) (email)

---

## Quick start

1. Copy env file:

   ```bash
   cp .env.example .env
   ```

2. Fill required values in `.env`:

   - `DATABASE_URL`
   - `CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `RESEND_API_KEY`
   - `FROM_EMAIL`
   - `FROM_NAME`

3. Initialize schema:

   ```bash
   npm run setup-db
   npm run migrate-events
   npm run migrate-organizations
   npm run migrate-staff-preferences
   ```

   Notes:

   - `setup-db` is **destructive** for `attendees` (drops/recreates the table) and is meant for local setup/reset.
   - On existing environments, use migrations only (skip `setup-db`).
   - Optional: apply [`docs/sql/003-users-profile.sql`](docs/sql/003-users-profile.sql) if you use the profile onboarding path (global display name on `users`).

4. Start locally:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:4321`, sign in, complete organization (and profile if applicable) onboarding, then create or select an event.

---

## Core routes

| Route | Purpose |
|------|---------|
| `/` | Scanner (standalone check-in experience) |
| `/scanner` | Standalone scanner (same capability as `/`) |
| `/rsvp` | Public event registration (unauthenticated) |
| `/admin` | Organizer/staff dashboard |
| `/admin/events` | Event list and management |
| `/admin/events/import` | Event CSV import + optional bulk QR email |
| `/admin/events/integrations` | Eventbrite and external integrations |
| `/admin/organization` | Organization settings + invitations |
| `/admin/organization/staff` | Staff management |
| `/admin/organization/settings` | Organization settings |
| `/admin/organization/finance` | Finance / subscription placeholder |
| `/login` | Sign-in |
| `/signup` | Sign-up (Clerk) |
| `/invite/accept` | Invitation acceptance |
| `/onboarding/organization` | Organization setup |
| `/onboarding/profile` | User display name (profile gate) |
| `/demo-codes` | Demo QR reference for training |

---

## Key API endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET/POST/DELETE /api/attendees` | List/create/delete attendees (event-scoped; POST = public RSVP with rate limit) |
| `POST /api/checkin` | QR check-in and manual `attendeeId` check-in |
| `GET /api/attendees/offline-cache` | Scanner offline cache payload (staff) |
| `POST /api/attendees/import` | CSV import with mapping/modes/warnings |
| `GET /api/attendees/export` | CSV export |
| `POST /api/attendees/send-bulk-qr` | Bulk QR email |
| `POST /api/attendees/refresh-qr` | Single attendee QR refresh |
| `GET/POST /api/events`, `GET/DELETE /api/events/:id` | List/create events; get/delete one event |
| `GET /api/health` | Health check |

---

## Environment variables

See `.env.example` for the canonical list. Main variables:

- `DATABASE_URL`
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `RESEND_API_KEY`
- `FROM_EMAIL`
- `FROM_NAME`
- `DEFAULT_EVENT_SLUG`
- `APP_URL` (optional)
- `PORT` (optional)
- `QR_TOKEN_TTL_DAYS` (optional)
- `ENABLE_DEMO_CODES` + `ENABLE_DEMO_CODES_IN_PRODUCTION` (optional; both required for demo QR codes in production)

---

## Scripts

| Command | Action |
|---------|--------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview build locally |
| `npm run setup-db` | Reset local attendee table (destructive) |
| `npm run migrate-qr` | QR token security migration |
| `npm run migrate-events` | Event-scoped schema migration |
| `npm run migrate-organizations` | Organization/membership migration |
| `npm run migrate-staff-preferences` | Staff preference persistence migration |
| `npm run wipe-events` | Event wipe utility |
| `npm run test:edge-cases` | Edge-case tests (dev server must be running) |
| `npm run test:edge-cases:ci` | Start server + run edge-case tests |
| `npm run test:generate-csvs` | Generate CSV fixtures for import testing |

---

## Documentation

| Doc | Purpose |
|-----|---------|
| [`docs/MASTER-PLAN.md`](docs/MASTER-PLAN.md) | Roadmap, dev checklist, concern audit |
| [`docs/ROADMAP-EVENT-RSVP.md`](docs/ROADMAP-EVENT-RSVP.md) | Event-specific RSVP: form builder, theming, custom domains |
| [`docs/INTEGRATIONS-STRATEGY.md`](docs/INTEGRATIONS-STRATEGY.md) | CSV vs API vs Zapier/Make |
| [`docs/audit/AUDIT-2026-03-21.md`](docs/audit/AUDIT-2026-03-21.md) | Security audit findings and remediation |
| [`docs/audit/AUDIT-TEMPLATE-PROMPT.md`](docs/audit/AUDIT-TEMPLATE-PROMPT.md) | Reusable prompt for the same style of full integrity audit |
| [`docs/README.md`](docs/README.md) | User-facing docs index (guides, FAQ) |
| [`docs/VERCEL-DEPLOYMENT.md`](docs/VERCEL-DEPLOYMENT.md) | Production deployment |
| [`docs/AUTH-CLERK-SETUP.md`](docs/AUTH-CLERK-SETUP.md) | Clerk + org/membership |
| [`docs/STEP-2-CENTRAL-HUB.md`](docs/STEP-2-CENTRAL-HUB.md) | Central hub, CSV import |
| [`docs/EMAIL-SENDER-GO-LIVE-CHECKLIST.md`](docs/EMAIL-SENDER-GO-LIVE-CHECKLIST.md) | Resend domain go-live |

---

## Deployment

Deploy on **Vercel**. For production setup and verification, use [`docs/VERCEL-DEPLOYMENT.md`](docs/VERCEL-DEPLOYMENT.md).

---

## CI/CD

- **Pull requests** (branches `main` / `master`): `pnpm install --frozen-lockfile`, `pnpm exec tsc --noEmit`, `pnpm run build` with placeholder env.
- **Push to main/master**: optional **edge-case** job runs when `DATABASE_URL` is available as a GitHub secret/variable (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)).
